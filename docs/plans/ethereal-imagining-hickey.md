# Plan: SQLite persistence + background scanner worker

## Context

Library tracks currently live only in React memory — every restart loses them and requires a full re-scan. All scanning logic runs inline in the Electron main process on the main thread, blocking IPC while walking the filesystem and parsing metadata.

This plan moves scanning into a `worker_threads` worker and persists every track to SQLite via `better-sqlite3`. On startup the renderer gets the full library from DB instantly; background scans write to the DB and stream batches to the renderer identically to today. The renderer-side API surface barely changes.

---

## Architecture

```
Renderer (LibraryContext)
  ↑ IPC: load-library-db (startup, fast)
  ↑ IPC: scan-library-batch / scan-library-done (streaming, unchanged)

Main Process (main.ts)
  ↔ postMessage: scan / batch / done / error
  
Scanner Worker (scanner-worker.ts, worker_threads)
  → better-sqlite3 → userData/library.db
```

---

## SQLite Schema

File: `userData/library.db` (path passed to worker via `workerData.dbPath`)

```sql
CREATE TABLE IF NOT EXISTS tracks (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL,
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  album        TEXT NOT NULL,
  duration     INTEGER NOT NULL,
  format       TEXT NOT NULL,
  size         INTEGER NOT NULL,
  cover_color  TEXT NOT NULL,
  album_art    TEXT,
  year         INTEGER,
  genre        TEXT,
  track_number INTEGER,
  mtime_ms     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
```

`mtime_ms` is worker-internal only — stripped before sending to renderer.
`id` = file path (matches current `Track.id` convention).

**Upsert strategy — mtime-based:**
- `stat()` each file → if `mtime_ms` matches DB row → skip metadata parse
- Otherwise `parseFile()` → upsert row
- After full walk → delete rows whose paths no longer exist under the scanned dirs

---

## Worker ↔ Main message protocol

**Main → Worker** (postMessage):
```typescript
type MainMessage =
  | { type: 'scan'; dirPaths: string[] }
  | { type: 'abort' }
```

**Worker → Main** (postMessage):
```typescript
type WorkerMessage =
  | { type: 'batch'; tracks: ScannedTrack[] }   // 20 tracks at a time
  | { type: 'done';  totalCount: number }
  | { type: 'error'; message: string }
```

Worker receives `workerData: { dbPath: string }` at startup.

---

## IPC channels

| Channel | Change | Purpose |
|---|---|---|
| `scan-library-stream` | **kept, rewired** | Renderer triggers scan; main delegates to worker |
| `scan-library-batch` | **kept, unchanged** | Main pushes 20-track batch to renderer |
| `scan-library-done` | **kept, unchanged** | Main signals scan complete |
| `load-library-db` | **NEW** | Renderer fetches all persisted tracks on startup |
| `scan-library` | **removed** | Blocking variant; never hit in practice |
| `scan-directory` | kept | Folder tree building (unchanged) |
| `get-audio-metadata` | kept | Tag editor (unchanged) |

---

## Files to CREATE

### `src/scanner-worker.ts`
- `import { workerData, parentPort } from 'node:worker_threads'`
- `import Database from 'better-sqlite3'`
- Scanning helpers moved verbatim from `main.ts` lines 137–269:
  `AUDIO_EXTENSIONS_SET`, `generateCoverColor`, `extractYear`, `extractTrackNumber`,
  `parseTitleArtist`, `encodeAlbumArt`, `extractOptionalFields`, `processAudioFile`
- `music-metadata` import at top (bundled by Vite — NOT external)
- DB init: `new Database(workerData.dbPath)` + WAL mode + create table + prepare statements
- `parentPort.on('message')` → handles `{ type: 'scan', dirPaths }`
- Walk: `readdir` → `stat` → mtime check → upsert → batch (20) → `postMessage batch`
- After walk: delete stale paths, `postMessage done`

### `vite.worker.config.ts`
```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: { entry: 'src/scanner-worker.ts', formats: ['cjs'] },
    rollupOptions: {
      external: [
        'better-sqlite3',
        'node:worker_threads', 'node:fs', 'node:fs/promises', 'node:path',
        'electron',
      ],
      // music-metadata is NOT external — let Vite bundle it (avoids ESM/CJS issue)
    },
  },
})
```

---

## Files to MODIFY

### `package.json`
- Add `"better-sqlite3": "^11.x"` to dependencies
- Add `"@types/better-sqlite3": "^7.x"` and `"electron-rebuild": "^3.x"` to devDependencies
- Add script: `"rebuild": "electron-rebuild -f -w better-sqlite3"`

### `forge.config.ts`
```typescript
// Add to VitePlugin.build array:
{
  entry: 'src/scanner-worker.ts',
  config: 'vite.worker.config.ts',
  target: 'main',
}

// Update rebuildConfig:
rebuildConfig: {
  force: true,
  onlyModules: ['better-sqlite3'],
}
```

### `vite.main.config.ts`
Add `better-sqlite3` as external (safe-guards against Vite trying to bundle the .node file):
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
})
```

### `src/main.ts`
**Delete** lines 135–366 (all scan helpers + `scan-library` handle + `scan-library-stream` on-handler). Also remove `import * as mm from 'music-metadata'` and `import { readdir, stat } from 'node:fs/promises'`.

**Add** near top (after imports):
```typescript
import { Worker } from 'node:worker_threads'

let scanWorker: Worker | null = null

function getScanWorker(): Worker {
  if (scanWorker) return scanWorker
  const dbPath = path.join(app.getPath('userData'), 'library.db')
  scanWorker = new Worker(
    path.join(__dirname, 'scanner-worker.js'),
    { workerData: { dbPath } }
  )
  scanWorker.on('error', err => console.error('[worker]', err))
  scanWorker.on('exit', code => { if (code !== 0) console.error('[worker] exited', code); scanWorker = null })
  return scanWorker
}

app.on('before-quit', () => scanWorker?.terminate())
```

**Add** new IPC handlers (replace the deleted block):
```typescript
// Fast startup load — reads DB without scanning
ipcMain.handle('load-library-db', () => {
  const Database = require('better-sqlite3')   // runtime require avoids bundling
  const dbPath = path.join(app.getPath('userData'), 'library.db')
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    const rows = db.prepare('SELECT * FROM tracks ORDER BY title ASC').all()
    db.close()
    return rows.map(({ mtime_ms, ...track }: Record<string, unknown>) => track)
  } catch {
    return []  // DB doesn't exist yet (first run)
  }
})

// Streaming scan — delegates to worker
ipcMain.on('scan-library-stream', (event, dirPath: string) => {
  const worker = getScanWorker()
  const handle = (msg: { type: string; tracks?: unknown[]; message?: string }) => {
    if (msg.type === 'batch') {
      event.sender.send('scan-library-batch', msg.tracks)
    } else if (msg.type === 'done' || msg.type === 'error') {
      worker.off('message', handle)
      event.sender.send('scan-library-done')
    }
  }
  worker.on('message', handle)
  worker.postMessage({ type: 'scan', dirPaths: [dirPath] })
})
```

### `src/preload.ts`
Add one method:
```typescript
loadLibraryDb: () => ipcRenderer.invoke('load-library-db'),
```
Remove `scanLibrary` (blocking variant no longer exposed by main).

### `src/app/services/fileScanner.ts`
Update `Window['electronAPI']` interface:
- Remove `readonly scanLibrary`
- Add `readonly loadLibraryDb: () => Promise<readonly Track[]>`

Update `scanDirectory()`: replace the `window.electronAPI.scanLibrary(rootPath)` call with
`window.electronAPI.loadLibraryDb()` filtered to paths under `rootPath`, so the fallback path in `useLibraryScanner` still gets tracks without needing the removed blocking IPC.

### `src/app/services/index.ts`
No changes needed (scanDirectory still exported).

### `src/app/hooks/useLibraryScanner.ts`
Add a one-time startup effect to hydrate tracks from the DB before the scan fires:
```typescript
// Load persisted tracks immediately on first mount (instant startup)
useEffect(() => {
  if (!window.electronAPI?.loadLibraryDb) return
  window.electronAPI.loadLibraryDb().then(tracks => {
    if (tracks.length > 0) {
      setTracks(tracks as Track[])
    }
  })
}, [])   // empty deps — run once
```
The rest of `scanLibrary` is unchanged — scanning still streams batches via `scanLibraryStream` and progressively replaces tracks.

---

## Implementation sequence

1. `bun add better-sqlite3` + `bun add -d @types/better-sqlite3 electron-rebuild`
2. `bun run rebuild` (compile .node against Electron ABI)
3. Create `src/scanner-worker.ts`
4. Create `vite.worker.config.ts`
5. Update `forge.config.ts` + `vite.main.config.ts`
6. Modify `src/main.ts` (delete scan block, add worker + new handlers)
7. Modify `src/preload.ts`
8. Modify `src/app/services/fileScanner.ts`
9. Modify `src/app/hooks/useLibraryScanner.ts`
10. `bun run typecheck` → fix errors
11. `bun run start` → verify: startup shows DB tracks instantly, scan still streams

---

## What does NOT change

- `LibraryContext.tsx` — no changes
- `LibraryView.tsx` — no changes
- All atomic/composite components — no changes
- `AudioContext.tsx`, `UIContext.tsx`, `SettingsContext.tsx` — no changes
- `scan-library-batch` / `scan-library-done` IPC shape — identical
- Streaming batch UX (20 tracks at a time) — preserved
- `scan-directory`, `get-audio-metadata`, `read-file`, window control handlers — untouched

---

## Known risks

| Risk | Mitigation |
|---|---|
| `music-metadata` v11 is ESM-only; worker built as CJS | Mark it as bundleable (not external) — Vite transforms ESM→CJS at build time |
| `better-sqlite3` needs native rebuild for Electron ABI | `bun run rebuild` step; `rebuildConfig` in forge handles packaging |
| Worker `.js` path resolution in packaged ASAR | Worker built as separate Vite entry → lands in same dir as `main.js` → `__dirname` resolves correctly; `.node` files auto-unpacked by Forge |
| Album art stored as base64 TEXT in DB → large file for big libraries | Acceptable for now (matches current in-memory approach); can be extracted to blob storage later |
| First-run: DB doesn't exist → `load-library-db` returns `[]` | Caught with `fileMustExist: true` + try/catch → returns `[]` → scan runs normally and creates DB |

---

## Verification

1. First launch: `load-library-db` returns `[]` → scan triggers → tracks stream in → DB populated
2. Restart: `load-library-db` returns full track list instantly before scan fires
3. Modified file: worker detects mtime change → re-parses → upserts → sends in next batch
4. Deleted file: post-walk cleanup deletes DB row → not returned on next startup
5. `bun run typecheck` passes with no errors
