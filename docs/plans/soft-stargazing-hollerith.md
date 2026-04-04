# Plan: IPC Bridge Simplification + Persistent Subscription Model

## Context

The current IPC architecture has two problems:
1. **Fragile scan subscription** — `scanLibraryStream` embeds callbacks inside the preload bridge, coupled to a single scan session. You can't subscribe before triggering; you must re-subscribe on each scan. `ipcRenderer.once` for `scan-library-done` means missed events if subscribe is late.
2. **Messy bridge interface** — 11 flat methods mixing window controls, file ops, and library ops. No grouping, no consistent naming convention.

Goal: Rename all IPC channels to `namespace:action` form, remove the embedded-callback pattern, expose a persistent `onLibraryBatch`/`onLibraryDone` subscription that React manages via `useEffect` cleanup. Delete `fileScanner.ts` entirely (dead after refactor).

---

## New IPC Channel Names

| Old | New | Direction |
|-----|-----|-----------|
| `select-directory` | `file:select` | invoke |
| `get-music-library-path` | `file:music-dir` | invoke |
| `scan-directory` | **DELETED** | — |
| `get-audio-metadata` | `file:metadata` | invoke |
| `read-file` | `file:read` | invoke |
| `load-library-db` | `library:load` | invoke |
| `scan-library-stream` | `library:scan` | on (fire-and-forget) |
| `scan-library-batch` | `library:batch` | send (main→renderer) |
| `scan-library-done` | `library:done` | send (main→renderer) |
| `window-minimize` | `window:minimize` | on |
| `window-maximize` | `window:maximize` | on |
| `window-close` | `window:close` | on |
| `window-is-maximized` | `window:is-maximized` | invoke |

---

## New Bridge Interface

```typescript
interface ElectronAPI {
  // Library
  readonly scanLibrary:    (dirPaths: string[]) => void
  readonly loadLibrary:    () => Promise<readonly Track[]>
  readonly onLibraryBatch: (cb: (tracks: Track[]) => void) => () => void  // returns unsubscribe
  readonly onLibraryDone:  (cb: () => void) => () => void                 // returns unsubscribe

  // Files
  readonly selectDirectory:  () => Promise<string | null>
  readonly getMusicDir:      () => Promise<string>
  readonly readFile:         (path: string) => Promise<ArrayBuffer>
  readonly getAudioMetadata: (path: string) => Promise<AudioMetadata>

  // Window
  readonly minimizeWindow: () => void
  readonly maximizeWindow: () => void
  readonly closeWindow:    () => void
  readonly isMaximized:    () => Promise<boolean>
}
```

Key differences from old:
- `scanLibraryStream(path, onBatch, onDone)` → split into `scanLibrary(paths[])` + `onLibraryBatch(cb)` + `onLibraryDone(cb)`
- `onLibraryBatch`/`onLibraryDone` use persistent `ipcRenderer.on` (not `once`), return cleanup functions for React lifecycle
- `scanLibrary` accepts `string[]` (all paths at once) — worker already supports `dirPaths: string[]`
- `getMusicLibraryPath` → `getMusicDir` (shorter)
- `loadLibraryDb` → `loadLibrary`

---

## Files to Change

### 1. `src/main.ts`

- Rename all `ipcMain.handle`/`ipcMain.on` channel strings to new names
- Delete the `scan-directory` handler entirely (lines 80–104: `walkDir` function + handler)
- In `scan-library-stream` → `library:scan` handler:
  - Change parameter from `dirPath: string` to `dirPaths: string[]`
  - Worker already receives `{ type: 'scan', dirPaths }` so just pass array directly
  - Extract snake_case→camelCase mapping into a named `mapTrack` helper at top of IPC section (currently duplicated in `load-library-db` and `scan-library-stream` handlers)
  - Keep per-scan `worker.on`/`worker.off` pattern (it's actually correct — persistent handler would accumulate if multiple scans overlap)

### 2. `src/preload.ts` — full replacement

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Library
  scanLibrary: (dirPaths: string[]) =>
    ipcRenderer.send('library:scan', dirPaths),
  loadLibrary: () =>
    ipcRenderer.invoke('library:load'),
  onLibraryBatch: (cb: (tracks: unknown[]) => void) => {
    const handler = (_: unknown, tracks: unknown[]) => cb(tracks)
    ipcRenderer.on('library:batch', handler)
    return () => ipcRenderer.removeListener('library:batch', handler)
  },
  onLibraryDone: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('library:done', handler)
    return () => ipcRenderer.removeListener('library:done', handler)
  },

  // Files
  selectDirectory:  () => ipcRenderer.invoke('file:select'),
  getMusicDir:      () => ipcRenderer.invoke('file:music-dir'),
  readFile:         (path: string) => ipcRenderer.invoke('file:read', path),
  getAudioMetadata: (path: string) => ipcRenderer.invoke('file:metadata', path),

  // Window
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),
  isMaximized:    () => ipcRenderer.invoke('window:is-maximized'),
})
```

### 3. `src/app/services/contextBridge.ts`

Update `ElectronAPI` interface to match new preload exactly. Remove: `scanDirectory`, `loadLibraryDb`, `scanLibraryStream`, `getMusicLibraryPath`. Add: `scanLibrary`, `loadLibrary`, `onLibraryBatch`, `onLibraryDone`, `getMusicDir`.

### 4. `src/app/hooks/useLibraryScanner.ts` — rewrite

Inline `buildFolderTree` from `fileScanner.ts` (it's pure logic, ~40 lines). Remove imports of `scanDirectory`, `selectDirectory` from services.

New structure — subscribe once on mount, hydrate from DB once on mount, `scanLibrary` is now fire-and-forget:

```typescript
// useRef for trackMap (not useState — no render needed per-insert)
const trackMap = useRef(new Map<string, Track>())

// Subscribe to scan events once — persistent for lifetime of component
useEffect(() => {
  const unsubBatch = bridge.onLibraryBatch(batch => {
    for (const t of batch) trackMap.current.set(t.id, t)
    setTracks([...trackMap.current.values()].sort((a, b) => a.title.localeCompare(b.title)))
    setLoading(true)
  })
  const unsubDone = bridge.onLibraryDone(() => {
    const allTracks = [...trackMap.current.values()]
    setFolders(buildFolderTree(libraryPathsRef.current, allTracks.map(t => t.path)))
    setLoading(false)
  })
  return () => { unsubBatch(); unsubDone() }
}, [])

// DB hydration — runs once on mount
useEffect(() => {
  bridge.loadLibrary().then(tracks => {
    if (tracks.length > 0) {
      for (const t of tracks) trackMap.current.set(t.id, t)
      setTracks([...tracks])
    }
  }).catch(err => console.error('[useLibraryScanner] DB load failed:', err))
}, [])
```

`libraryPathsRef` — use a ref to capture current `libraryPaths` inside the `onLibraryDone` callback without closing over a stale value:
```typescript
const libraryPathsRef = useRef(libraryPaths)
useEffect(() => { libraryPathsRef.current = libraryPaths }, [libraryPaths])
```

`scanLibrary`:
```typescript
const scanLibrary = useCallback(() => {
  if (libraryPaths.length === 0) return
  trackMap.current.clear()
  setLoading(true)
  bridge.scanLibrary(libraryPaths)  // all paths in one shot
}, [libraryPaths, setLoading])
```

`addAndScan` — call `bridge.selectDirectory()` directly (no wrapper needed):
```typescript
const addAndScan = useCallback(async () => {
  return await bridge.selectDirectory() ?? null
}, [])
```

`buildFolderTree` — adapted from `fileScanner.ts` to accept multiple roots:
- Signature: `buildFolderTree(rootPaths: string[], files: string[]): FolderNode[]`
- For each root, builds a subtree. Returns array of root nodes.

### 5. `src/app/contexts/SettingsContext.tsx`

Line 35: `bridge?.getMusicLibraryPath` → `bridge?.getMusicDir`
Line 37: `await bridge.getMusicLibraryPath()` → `await bridge.getMusicDir()`

### 6. `src/app/views/LibraryView.tsx`

- Remove import `scanDirectory` from `'../services'` (line 5)
- Replace `handleFolderSelect` — instead of calling `scanDirectory(path)` and replacing tracks, just call `selectFolder(path)` and let `displayTracks` compute the filtered view:

```typescript
const handleFolderSelect = (path: string) => {
  selectFolder(path)
}
```

- Update `displayTracks` useMemo to filter by `selectedFolderPath`:

```typescript
const displayTracks = useMemo(() => {
  if (selectedPlaylistId) {
    return playlists.find(p => p.id === selectedPlaylistId)?.tracks ?? []
  }
  if (selectedFolderPath) {
    return filteredTracks.filter(t => t.path.startsWith(selectedFolderPath))
  }
  return filteredTracks
}, [selectedPlaylistId, selectedFolderPath, playlists, filteredTracks])
```

This is strictly better — folder selection is now instant (no async), non-destructive (tracks stay loaded), and the full library restores when you deselect a folder. Remove the `setLoading` calls from `handleFolderSelect` since there's no async work.

### 7. `src/app/views/SettingsView.tsx`

- Remove import `selectDirectory` from `'../services'` (line 3)
- Add import `bridge from '../services/contextBridge'`
- Replace `await selectDirectory()` with `await bridge.selectDirectory()`

### 8. `src/app/services/index.ts`

Remove line 3: `export { scanDirectory, getAudioMetadata, selectDirectory } from './fileScanner'`

### 9. Delete `src/app/services/fileScanner.ts`

The entire file becomes dead after step 4 inlines `buildFolderTree`. No other file imports from it after steps 7+8.

---

## Execution Order

1. `src/main.ts` (rename channels, delete `scan-directory`, extract `mapTrack`)
2. `src/preload.ts` (new bridge shape)
3. `src/app/services/contextBridge.ts` (updated interface)
4. `src/app/hooks/useLibraryScanner.ts` (subscription model + inline `buildFolderTree`)
5. `src/app/contexts/SettingsContext.tsx` (rename one method)
6. `src/app/views/LibraryView.tsx` (remove import, fix folder select + displayTracks)
7. `src/app/views/SettingsView.tsx` (remove import, inline bridge call)
8. `src/app/services/index.ts` (remove fileScanner exports)
9. Delete `src/app/services/fileScanner.ts`

---

## Verification

1. `bun run start` — app should launch, library hydrates from DB on boot, scan button triggers stream
2. Add a library path in Settings → triggers `bridge.selectDirectory()` correctly
3. Folder click in sidebar → instant filter (no loading state), shows only tracks under that path
4. Deselect folder (click root or navigate away) → full library restores
5. Scan button → loading indicator shows, tracks populate incrementally via batches, `done` fires once
6. TypeScript build: `bun run typecheck` — no errors on bridge interface
