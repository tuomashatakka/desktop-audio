# Plan: Frontend Data API + IPC and Web FS Adapters

## Context

The `Bridge` abstraction landed in commits `15664b6..25592b8`. It works as a switchable shim — `renderer.tsx` picks `BrowserBridge` when `window.electronAPI` is missing — and `bun run dev:web` boots Vite standalone, serves the renderer, and compiles. Tests pass, typecheck is clean.

But the abstraction is a god-interface: `Bridge` mixes data access (`loadLibrary`, `readFile`, `getAudioMetadata`, `upsertModel`), host integration (`minimizeWindow`, `showContextMenu`, `onMediaPlayPause`, `updateMediaState`), and event streams (`onLibraryBatch`, `onMediaSeek`) under one interface. That makes "use a different source for the data" hard: a future HTTP backend would have to stub out 20 host-only methods. And `BrowserBridge` is mostly stubs — `readFile` returns `new ArrayBuffer(0)`, `selectDirectory` returns the literal string `'/mock/path'`, `getAudioMetadata` returns the wrong shape (it currently declares `Promise<MediaState>` instead of `Promise<AudioMetadata>` — a regression at `src/app/data/Bridge.ts:15`). The browser session loads but cannot actually play audio.

This plan extracts the **data-access surface** from `Bridge` into a focused `DataSource` capability set, and ships two real adapters for it: `IpcDataSource` (delegates to the existing preload IPC) and `WebFsDataSource` (uses the File System Access API to actually pick a directory, scan it, read audio bytes, and parse metadata in the renderer). The leftover host-integration methods (window controls, media keys, MPRIS, context menu) stay on `Bridge` — that's where they belong, since they're inherently Electron-only and a no-op `BrowserHost` already covers the browser case.

The intended outcome: a developer can swap `IpcDataSource` for `WebFsDataSource` (or a future `HttpDataSource`) without touching any view, context, or hook. The browser dev mode actually plays files the user picks. The IPC path keeps current behaviour with no observable change.

---

## Goals

1. Define a `DataSource` interface that captures everything a view/context needs from "the data layer": library scan, file read, metadata, model writes, change events.
2. Ship `IpcDataSource` — wraps `window.electronAPI` calls; preserves current Electron behaviour exactly.
3. Ship `WebFsDataSource` — uses `window.showDirectoryPicker()`, walks the handle tree, reads files via `FileSystemFileHandle.getFile()`, parses tags via `music-metadata` (already a dep) running in the renderer (or a Web Worker, see §6).
4. Composition root: `renderer.tsx` builds `{ data: DataSource, host: HostBridge }` and provides both via context.
5. Migrate every consumer that currently calls `useBridge().{loadLibrary,scanLibrary,readFile,getAudioMetadata,upsertModel,deleteModel,onLibraryBatch,onLibraryDone}` to `useData()`.
6. Fix the `getAudioMetadata` return-type regression (back to `AudioMetadata`).

Non-goals: changing the model classes, the slot layout, the `@observable` story, persistence schema. Those are out of scope.

---

## Design

### Capability split

```
src/app/data/
  Bridge.ts                  →  HostBridge.ts   (window/media-keys/context-menu/MPRIS)
  ElectronBridge.ts          →  ElectronHost.ts (host adapter)
  BrowserBridge.ts           →  BrowserHost.ts  (no-op host adapter)
  BridgeContext.tsx          →  HostContext.tsx (useHost())
  DataSource.ts              NEW interface
  IpcDataSource.ts           NEW
  WebFsDataSource.ts         NEW
  DataContext.tsx            NEW (useData(), DataProvider)
  fixtures/                  NEW (tiny seed library for headless dev)
  index.ts                   re-export both
```

### `DataSource` interface

```ts
// src/app/data/DataSource.ts
export interface DataSource {
  // Library lifecycle
  readonly addRoot:       () => Promise<string | null>          // user picks a folder; returns its handle id/path
  readonly removeRoot:    (rootId: string) => Promise<void>
  readonly listRoots:     () => Promise<readonly LibraryRoot[]>
  readonly scan:          (rootIds: readonly string[]) => void  // fire-and-forget; results stream via subscribe()
  readonly load:          () => Promise<readonly TrackDTO[]>    // hydrate from cache
  readonly subscribe:     (l: DataListener) => () => void       // batch + done events

  // Per-track ops
  readonly readBytes:     (trackId: string) => Promise<ArrayBuffer>
  readonly readMetadata:  (trackId: string) => Promise<AudioMetadata>

  // Mutations
  readonly upsertTrack:   (track: TrackDTO) => Promise<void>
  readonly deleteTrack:   (trackId: string) => Promise<void>
}

export interface LibraryRoot { readonly id: string; readonly label: string }

export type DataEvent =
  | { readonly type: 'batch'; readonly tracks: readonly TrackDTO[] }
  | { readonly type: 'done';  readonly totalCount: number }
  | { readonly type: 'error'; readonly message: string }

export type DataListener = (e: DataEvent) => void
```

Keying by `trackId` (not raw path) lets `WebFsDataSource` keep `FileSystemFileHandle`s in an internal map without exposing them. `IpcDataSource` resolves `trackId` to a path internally (the SQLite row already has both).

### `IpcDataSource`

Thin wrapper over the existing preload methods. `addRoot` calls `selectDirectory` then `scanLibrary([path])`; `subscribe` multiplexes `onLibraryBatch`/`onLibraryDone` into the unified event stream; `readBytes` resolves `trackId → path` via an in-memory map populated by batches, then calls `readFile(path)`. `upsertTrack`/`deleteTrack` call `upsertModel('track', dto)`/`deleteModel('track', id)`.

This adapter has zero behaviour change vs. today.

### `WebFsDataSource`

Uses the File System Access API (Chromium 86+, the only target for `bun run dev:web`):

- `addRoot()` → `window.showDirectoryPicker()` returns a `FileSystemDirectoryHandle`. Persist the handle in IndexedDB (via `idb-keyval` or a 30-line bare-bones helper) keyed by a generated UUID; return the UUID. Granted handles survive reloads as long as the user re-grants permission via `handle.requestPermission()`.
- `scan(rootIds)` → walk the directory handle tree, filter to audio extensions (`.mp3`, `.flac`, `.ogg`, `.wav`, `.m4a`, `.opus`), generate `TrackDTO`s with `id = hash(rootId + relativePath)`, store `{ trackId → fileHandle }` in an internal `Map`. Emit `batch` events of 20, then `done`. Reuses the same chunking pattern as `scanner-worker.ts:41`.
- `readMetadata(trackId)` → `handle.getFile()` then `parseBlob(file)` from `music-metadata` (already in deps; works in the browser via its ESM build).
- `readBytes(trackId)` → `handle.getFile().then(f => f.arrayBuffer())`. Replaces the current 0-byte stub.
- `load()` → no-op the first time; on subsequent reloads, replays cached `TrackDTO`s from IndexedDB (`tracks` object store) so the UI hydrates instantly.
- `upsertTrack`/`deleteTrack` → write to the same IndexedDB store. This gives the browser session SQLite-equivalent persistence without leaving the renderer.

A small Web Worker (`src/app/data/web-fs-worker.ts`) optionally takes the metadata parsing off the main thread — same chunked-batch protocol as `scanner-worker.ts`, but sender/receiver are renderer-side.

### Wiring

```tsx
// src/renderer.tsx
const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI)
const host = isElectron ? new ElectronHost() : new BrowserHost()
const data: DataSource = isElectron ? new IpcDataSource() : new WebFsDataSource()

createRoot(...).render(
  <HostProvider value={host}>
    <DataProvider value={data}>
      <App />
    </DataProvider>
  </HostProvider>
)
```

`Model.bridge` (currently never set anywhere — confirmed at `src/app/models/Model.ts:10` is `null`) becomes `Model.dataSource`, set once by `<DataProvider>` on mount. This unbreaks the `markDirty → flush → upsertTrack` chain: today every flush is a silent no-op because no model ever has a bridge bound.

---

## Migration

| File | Today | After |
|---|---|---|
| `src/app/contexts/AudioContext.tsx:276` | `bridge.readFile(track.path)` | `data.readBytes(track.id)` |
| `src/app/contexts/AudioContext.tsx:211` | `bridge.updateMediaState(...)` | `host.updateMediaState(...)` |
| `src/app/contexts/AudioContext.tsx:230` | `bridge.onMediaSeek(...)` | `host.onMediaSeek(...)` |
| `src/app/contexts/SettingsContext.tsx` getMusicDir | `bridge.getMusicDir()` | drop — `WebFsDataSource` returns null roots; `IpcDataSource.listRoots()` seeds with music dir |
| `src/app/hooks/useLibraryScanner.ts` | `bridge.scanLibrary/loadLibrary/onLibraryBatch/onLibraryDone` | `data.scan/load/subscribe` |
| `src/app/views/SettingsView.tsx:11` | `bridge.selectDirectory()` | `data.addRoot()` |
| `src/app/views/LibraryView.tsx:84,94` | `bridge.showContextMenu/onContextMenuAction` | `host.showContextMenu/onContextMenuAction` |
| `src/app/hooks/useKeyboardShortcuts.ts` | `bridge.onMediaPlayPause/Next/Prev` | `host.onMediaPlayPause/Next/Prev` |
| `src/app/App.tsx` (existing) | `useBridge()` | `useHost()` |
| `src/app/models/Model.ts:10` | `bridge: Bridge \| null = null` | `dataSource: DataSource \| null = null`, set by `DataProvider` |

After migration, delete the old `Bridge.ts`/`ElectronBridge.ts`/`BrowserBridge.ts`/`BridgeContext.tsx` files (they are subsumed by `HostBridge.ts` + the new data files).

Bug fix in the same pass: `Bridge.ts:15` declares `getAudioMetadata(): Promise<MediaState>` — should be `Promise<AudioMetadata>`. The new `DataSource.readMetadata` returns `AudioMetadata` correctly.

---

## File-by-file change list (execution order)

**Phase 1 — Capability split (no behaviour change):**
1. Rename `Bridge.ts` → `HostBridge.ts`, strip data methods (`scanLibrary`, `loadLibrary`, `onLibraryBatch`, `onLibraryDone`, `selectDirectory`, `getMusicDir`, `readFile`, `getAudioMetadata`, `upsertModel`, `deleteModel`).
2. Rename `ElectronBridge.ts` → `ElectronHost.ts`, drop the same methods.
3. Rename `BrowserBridge.ts` → `BrowserHost.ts`, drop the same methods.
4. Rename `BridgeContext.tsx` → `HostContext.tsx` (`HostProvider`, `useHost`).

**Phase 2 — `DataSource` + `IpcDataSource`:**
5. `src/app/data/DataSource.ts` (interface + types).
6. `src/app/data/IpcDataSource.ts` (delegates to `window.electronAPI`).
7. `src/app/data/DataContext.tsx` (`DataProvider`, `useData`). Sets `Model.dataSource = value` on mount.

**Phase 3 — `WebFsDataSource`:**
8. `src/app/data/idb.ts` (50-line key-value helper around IndexedDB; no new deps).
9. `src/app/data/WebFsDataSource.ts` — directory walker, `Map<trackId, FileSystemFileHandle>`, IndexedDB cache for handles + DTOs.
10. (optional) `src/app/data/web-fs-worker.ts` — off-thread metadata parsing. Skip if scan time on a 1k-track folder is acceptable on the main thread.

**Phase 4 — Wiring + migrations:**
11. `src/renderer.tsx` — build `host` and `data`, wrap in both providers.
12. Migrate the 8 call sites in the table above.
13. Update `Model.ts` to use `dataSource.upsertTrack`/`deleteTrack` instead of `bridge.upsertModel`/`deleteModel`.
14. Delete the old `Bridge.ts`/`ElectronBridge.ts`/`BrowserBridge.ts`/`BridgeContext.tsx`.
15. Fix the `AudioMetadata` vs. `MediaState` regression while editing.

**Phase 5 — Tests:**
16. `tests/data/DataSource.contract.test.ts` — shared contract suite that runs against both adapters: `addRoot → scan → subscribe → load → readBytes → upsertTrack → load again` returns the mutation. Seeds an in-memory directory handle for the WebFs run (use a tiny `MemoryDirectoryHandle` test helper) and a fake `electronAPI` for the IPC run (extend `tests/helpers/makeMockBridge.ts`).
17. `tests/data/WebFsDataSource.test.ts` — directory walker filters audio extensions, batch chunking is 20, IndexedDB persistence round-trip.
18. `tests/data/IpcDataSource.test.ts` — every method calls the right `electronAPI` channel exactly once.
19. Update existing `tests/data/BrowserBridge.test.ts` → split into `BrowserHost.test.ts` (host stub) and merge data assertions into the contract test.
20. Update view tests (`tests/views/LibraryView.test.tsx`, `SettingsView.test.tsx`) to inject both `<DataProvider>` and `<HostProvider>`. Extend `tests/helpers/renderWithProviders.tsx`.

---

## Test plan

- Contract suite (`DataSource.contract.test.ts`) is the load-bearing test — every method on every adapter must pass it. Ensures behavioural parity.
- `WebFsDataSource` unit tests:
  - `addRoot` returns `null` when the user cancels the picker.
  - `scan` filters non-audio files (`.txt`, `.jpg`).
  - `subscribe` emits exactly `ceil(n/20)` `batch` events plus one `done`.
  - `readBytes` returns the actual file bytes (not 0).
  - `upsertTrack` then `load` returns the mutated DTO.
  - Permission-denied path: `requestPermission()` returns `'denied'` → `addRoot` returns `null`, no throw.
- `IpcDataSource` unit tests use the existing `tests/mocks/electron.ts` stubs — assert each method routes to the expected channel.
- View tests: `SettingsView` "Add Folder" calls `data.addRoot()` (not `host.selectDirectory`); `LibraryView` mount calls `data.scan(rootIds)` once.
- Smoke test for `bun run dev:web`: start server, fetch `/`, assert no `electronAPI` references in `/src/app/data/index.ts` after dev compilation.

---

## Verification (end-to-end)

1. `bun run typecheck && bun run lint && bun run test` — all green.
2. `bun run start` (Electron):
   - Library scans, plays a track. No regression. (Same path as today, just routed via `IpcDataSource`.)
3. `bun run dev:web` then open `http://localhost:5173`:
   - Settings → Add Folder → pick a real directory containing `.mp3`s.
   - Library populates with real track metadata (titles, artists, durations) — not stubs.
   - Click play → audio actually plays through `<audio>` + `URL.createObjectURL(blob)`.
   - Reload the page → roots and track DTOs come back from IndexedDB; permission re-prompt only on file access.
4. Inspect DevTools Application → IndexedDB → `desktop-audio` database → confirm `roots` and `tracks` stores populated.

---

## Risks & open questions

1. **`music-metadata` in the browser** — its ESM entry imports `node:buffer`. Verify Vite's `define` polyfill or pin to the lighter `music-metadata-browser` fork. Run a 5-line smoke test before committing to it.
2. **File handle persistence** — granting a directory handle that survives reload is supported in Chromium but the user must re-confirm permission per session. Acceptable for dev mode.
3. **Composition surface** — having two providers (`HostProvider` + `DataProvider`) doubles the wiring at the root. Keep `App.tsx` clean by exposing a single `<RootProviders host data>` wrapper.
4. **`Model.dataSource` global** — same pattern as today's `Model.bridge`, just renamed. Acceptable for a singleton renderer; revisit if we ever spawn a second React root.
5. **Worker for metadata parsing** — only needed if scan latency is felt. Defer until measured.
6. **Future adapters** — `HttpDataSource` (REST or tRPC), `FixtureDataSource` (static JSON for screenshots/CI), and `SqliteWasmDataSource` (sql.js running in a worker) all become trivial once the contract test exists.

---

## Critical files to modify

- `src/app/data/Bridge.ts` → `HostBridge.ts` (data methods removed)
- `src/app/data/ElectronBridge.ts` → `ElectronHost.ts`
- `src/app/data/BrowserBridge.ts` → `BrowserHost.ts`
- `src/app/data/BridgeContext.tsx` → `HostContext.tsx`
- `src/app/data/DataSource.ts` (new)
- `src/app/data/IpcDataSource.ts` (new)
- `src/app/data/WebFsDataSource.ts` (new)
- `src/app/data/DataContext.tsx` (new)
- `src/app/data/idb.ts` (new)
- `src/renderer.tsx` (wire both providers + `Model.dataSource`)
- `src/app/contexts/AudioContext.tsx` (split: `useData` for bytes, `useHost` for media state)
- `src/app/hooks/useLibraryScanner.ts` (use `useData`)
- `src/app/hooks/useKeyboardShortcuts.ts` (use `useHost`)
- `src/app/views/SettingsView.tsx` (use `useData().addRoot`)
- `src/app/views/LibraryView.tsx` (use `useHost` for context menu)
- `src/app/models/Model.ts` (`dataSource` instead of `bridge`)
- `tests/helpers/renderWithProviders.tsx` (inject both providers)
- `tests/data/*.test.ts` (contract + per-adapter)

## Reusable existing code

- `parseBlob` from `music-metadata` — same library as `scanner-worker.ts:98`, runnable in the browser.
- `decodeWaveformBars` at `src/app/contexts/AudioContext.tsx:30-58` — unchanged.
- `tests/helpers/makeMockBridge.ts` — split into `makeMockHost` + `makeMockData`.
- The chunked-batch protocol from `scanner-worker.ts:41` — directly portable to `WebFsDataSource.scan`.
