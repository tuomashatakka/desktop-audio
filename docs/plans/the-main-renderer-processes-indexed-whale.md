# Plan: Decouple Renderer, Add Models, Slot Layout

## Context

The renderer currently couples its views to Electron through a 3-line `services/contextBridge.ts` re-export of `window.electronAPI`. Seven files reach into that bridge directly (App, AudioContext, SettingsContext, LibraryView, SettingsView, useLibraryScanner, useKeyboardShortcuts), so the views cannot run anywhere except inside the Electron renderer process. Data also lives as plain `interface` shapes in `services/types.ts` with no behaviour, no observability, and no way to write changes back to SQLite — only the scanner-worker writes today.

This plan decouples the view layer behind a `Bridge` interface so the renderer runs in a plain browser, replaces the plain interfaces with model classes (`FolderEntry`, `Track`, `Album`, `Artist`) backed by an `@observable` decorator that debounces writes through new `models:upsert` / `models:delete` IPC channels, gives `Track` a lazy waveform property with an LRU cache, and re-shapes the root layout into a Next.js-style named-slots composition. The intended outcome: `bun run dev:web` opens the renderer in a browser with mock data, every view + model has tests, and the existing Electron build keeps working unchanged from a user's perspective.

User-confirmed choices:
- Slots pattern (no Next.js migration).
- Full write IPC + SQLite persistence via `@observable`.
- Album/Artist derived in-memory over the existing `tracks` table — no schema change.
- Waveform = lazy property + in-memory LRU; no persistence.

Defaults adopted without asking (reversible):
- Per-model subscription as the API; `ModelRegistry` aggregates batch events for views that render many rows (LibraryView's TrackTable subscribes to the registry, not 10k Tracks).
- Expanded-player overlay rendered via a React portal, not as a layout slot — keeps `AppLayout` to four named slots.
- Debounce window = 150 ms, overridable per Model subclass via `static flushDelayMs`.
- `models:upsert` / `models:delete` use `ipcRenderer.send` (fire-and-forget); upgrade to `invoke` only if a UI ever needs round-trip confirmation.

---

## Target Structure

```
src/
  app/
    data/                       NEW
      Bridge.ts                 interface (existing ElectronAPI + upsertModel/deleteModel)
      ElectronBridge.ts         routes to window.electronAPI
      BrowserBridge.ts          in-memory + File System Access API mock
      BridgeContext.tsx         BridgeProvider + useBridge()
      index.ts
    models/                     NEW
      Model.ts                  base: id, EventTarget, dirty set, debounced flush
      observable.ts             stage-3 accessor decorator
      useObservable.ts          useSyncExternalStore wrapper
      FolderEntry.ts
      Track.ts                  lazy `get waveform(): Promise<Float32Array>`
      Album.ts                  derived; AlbumIndex memoises by id
      Artist.ts                 derived; ArtistIndex memoises by id
      WaveformCache.ts          singleton LRU keyed by track id
      registry.ts               ModelRegistry + AlbumIndex + ArtistIndex
      index.ts
    layout/                     NEW
      AppLayout.tsx             <AppLayout titlebar sidebar main player />
      Titlebar.tsx              extracted from App.tsx
      LibrarySidebar.tsx        extracted from LibraryView.tsx (current lines 124-195)
      ExpandedPlayerPortal.tsx  portal-mounted overlay
      index.ts
  preload.ts                    + upsertModel, deleteModel
  main.ts                       + ipc handlers, spawn db-writer
  db-writer.ts                  NEW Node Worker (separate from scanner-worker)
tests/
  models/{Model,observable,FolderEntry,Track,Album,Artist,WaveformCache}.test.ts
  data/BrowserBridge.test.ts
  layout/AppLayout.test.tsx
  views/{LibraryView,SettingsView}.test.tsx   NEW
```

**Hard rule**: nothing under `views/`, `components/`, `contexts/`, `hooks/`, `layout/` may import `electron`, `window.electronAPI`, or `services/contextBridge`. All Electron-side I/O goes through `useBridge()`.

---

## 1. `@observable` decorator (TC39 stage-3)

`tsconfig.json` has no `experimentalDecorators` — TS 6 + `target: ESNext` emits stage-3 natively. Vite/esbuild handles it.

```ts
// src/app/models/observable.ts
type Ctx<T, V> = ClassAccessorDecoratorContext<T, V>
type Acc<T, V> = ClassAccessorDecoratorTarget<T, V>

export function observable<T extends Model, V> (target: Acc<T, V>, ctx: Ctx<T, V>): Acc<T, V> {
  const key = String(ctx.name)
  ctx.addInitializer(function (this: T) { this.__fields.add(key) })
  return {
    get () { return target.get.call(this) },
    set (value: V) {
      const prev = target.get.call(this)
      if (Object.is(prev, value)) return
      target.set.call(this, value)
      if (!this.__suppress) this.__markDirty(key)
    },
  }
}
```

```ts
// src/app/models/Model.ts (sketch)
export abstract class Model {
  static bridge: Bridge | null = null
  static flushDelayMs = 150
  abstract readonly id: string
  __fields = new Set<string>()
  __dirty  = new Set<string>()
  __suppress = false
  __version = 0
  #emitter = new EventTarget()
  #flushHandle: ReturnType<typeof setTimeout> | null = null

  __markDirty (key: string) {
    this.__dirty.add(key)
    this.__version++
    this.#emitter.dispatchEvent(new Event('change'))
    if (this.#flushHandle || !Model.bridge) return
    const delay = (this.constructor as typeof Model).flushDelayMs
    this.#flushHandle = setTimeout(() => this.#flush(), delay)
  }
  #flush () {
    this.#flushHandle = null
    if (this.__dirty.size === 0 || !Model.bridge) return
    Model.bridge.upsertModel(this.constructor.name, this.toJSON())
    this.__dirty.clear()
  }
  hydrate (patch: Partial<this>) {
    this.__suppress = true
    Object.assign(this, patch)
    this.__suppress = false
  }
  on (cb: () => void) {
    const h = () => cb()
    this.#emitter.addEventListener('change', h)
    return () => this.#emitter.removeEventListener('change', h)
  }
  toJSON () {
    const out: Record<string, unknown> = {}
    for (const k of this.__fields) out[k] = (this as never)[k]
    return out
  }
}
```

Recursion guard: `hydrate()` flips `__suppress` so backend pushes don't re-trigger a write. Equality short-circuit in the setter prevents no-op loops.

```ts
// src/app/models/useObservable.ts
export function useObservable<M extends Model> (m: M): M {
  useSyncExternalStore(cb => m.on(cb), () => m.__version)
  return m
}
```

---

## 2. Models

| Model | Persisted | `@observable` fields | Notes |
|---|---|---|---|
| `FolderEntry` | derived from `tracks.path` | `name`, `path`, `parentId` | `expanded` stays on `UIContext` (UI-only) |
| `Track` | yes (`tracks` table) | all current Track fields | `get waveform()` reads through `WaveformCache` |
| `Album` | derived | `title`, `artist` | `tracks` getter delegates to `AlbumIndex.byId(this.id)`; never written |
| `Artist` | derived | `name` | `albums`/`tracks` getters delegate to `ArtistIndex` |

`AlbumIndex` / `ArtistIndex` (in `registry.ts`) subscribe to every `Track`'s `change` event once. On `artist` / `album` mutation they re-bucket. `Album.byId` and `Artist.byId` memoise instance identity, so `useObservable(album)` works across renders.

`WaveformCache` (singleton, max 32 entries, LRU) lifts `decodeWaveformBars` from `AudioContext.tsx:30-58` into `models/WaveformCache.ts`. `Track.waveform` calls `WaveformCache.get(this.id, () => bridge.readFile(this.path).then(decode))`.

---

## 3. Bridge abstraction

```ts
// src/app/data/Bridge.ts
export interface Bridge {
  // every existing ElectronAPI method (see preload.ts:5-90)
  scanLibrary(paths: string[]): void
  loadLibrary(): Promise<readonly TrackDTO[]>
  onLibraryBatch(cb: (t: TrackDTO[]) => void): () => void
  onLibraryDone(cb: () => void): () => void
  selectDirectory(): Promise<string | null>
  getMusicDir(): Promise<string | null>
  readFile(path: string): Promise<ArrayBuffer>
  getAudioMetadata(path: string): Promise<AudioMetadata>
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  isMaximized(): Promise<boolean>
  onMediaPlayPause(cb: () => void): () => void
  onMediaNext(cb: () => void): () => void
  onMediaPrev(cb: () => void): () => void
  showContextMenu(items: SerializableMenuItem[], x: number, y: number, w: number, h: number): void
  hideContextMenu(): void
  onContextMenuAction(cb: (i: number) => void): () => void
  updateMediaState(s: MediaState): void
  onMediaSeek(cb: (delta: number) => void): () => void
  // NEW
  upsertModel(kind: string, payload: Record<string, unknown>): void
  deleteModel(kind: string, id: string): void
}
```

`ElectronBridge` is the existing `services/contextBridge.ts` body upgraded to a class-with-methods, plus the two new write methods. `BrowserBridge` keeps a `Map<string, TrackDTO>` seeded from a fixture, uses `window.showDirectoryPicker()` for `selectDirectory` (falling back to a hard-coded mock set), and reads files via the File System Access API where granted.

`BridgeProvider` calls `Model.bridge = bridge` once on mount and exposes `useBridge()` for non-model code.

**Migration table** (each call site gets `useBridge()`; then delete `services/contextBridge.ts`):

| File | Lines | Today |
|---|---|---|
| `App.tsx` | 9, 100, 109, 118 | window controls |
| `contexts/AudioContext.tsx` | 4, 201-225, 228-240, 277 | media state, seek, file read |
| `contexts/SettingsContext.tsx` | 3, 34-44 | music dir |
| `views/LibraryView.tsx` | 8, 84, 94 | context menu |
| `views/SettingsView.tsx` | 3, 11 | directory picker |
| `hooks/useLibraryScanner.ts` | 4, 85, 95, 112, 133, 137 | scan/load/select |
| `hooks/useKeyboardShortcuts.ts` | 3, 75-82 | media keys |

---

## 4. Write IPC + main-process plumbing

New IPC: `models:upsert` (`send`, payload `{ kind, data }`), `models:delete` (`send`, payload `{ kind, id }`).

A new `src/db-writer.ts` Node Worker handles writes. Rationale: the scanner-worker is busy with `WAL` writes during scans; SQLite WAL allows multiple readers + single writer per process, but a dedicated writer worker prevents head-of-line blocking and keeps lifetimes clean (writer = app lifetime, scanner = per-scan).

`main.ts` adds:
```ts
ipcMain.on('models:upsert', (_e, { kind, data }) =>
  writerWorker.postMessage({ type: 'upsert', kind, data }))
ipcMain.on('models:delete', (_e, { kind, id }) =>
  writerWorker.postMessage({ type: 'delete', kind, id }))
```

The writer only handles `kind === 'Track'` initially (FolderEntry derived from paths; Album/Artist derived). Reuses the existing `tracks` table — UPDATEs only, no schema change.

---

## 5. Slots layout

```tsx
// src/app/layout/AppLayout.tsx
export function AppLayout (props: {
  readonly titlebar: ReactNode
  readonly sidebar:  ReactNode
  readonly main:     ReactNode
  readonly player:   ReactNode
}) {
  return (
    <div className='app-shell'>
      <header className='slot-titlebar'>{props.titlebar}</header>
      <aside  className='slot-sidebar'>{props.sidebar}</aside>
      <main   className='slot-main'>{props.main}</main>
      <footer className='slot-player'>{props.player}</footer>
    </div>
  )
}
```

```tsx
// new App.tsx body
function AppContent () {
  const { currentView } = useUI()
  const { currentTrack } = useAudio()
  const main =
    currentView === 'player'     ? <PlayerView /> :
    currentView === 'settings'   ? <SettingsView /> :
    currentView === 'tag-editor' ? <TagEditorView /> :
                                   <LibraryView />
  return (
    <>
      <AppLayout
        titlebar={<Titlebar />}
        sidebar ={currentView === 'library' ? <LibrarySidebar /> : null}
        main    ={main}
        player  ={currentTrack ? <PlayerBar /> : null}
      />
      <ExpandedPlayerPortal />
    </>
  )
}
```

Splitting `LibraryView.tsx` lines 124-195 into `LibrarySidebar.tsx` is what unlocks the slot pattern and drops tree depth from ~6 (`AppContent → main → view-content → LibraryView → library-view → aside → section-header`) to **3 from layout to leaf**.

CSS: rename `.app-layout` → `.app-shell`; grid template areas `"titlebar titlebar" / "sidebar main" / "player player"`.

---

## 6. Browser-only dev mode

```jsonc
// package.json scripts
"dev:web": "VITE_BRIDGE=browser vite --config vite.renderer.config.ts"
```

```tsx
// src/renderer.tsx
const useBrowserBridge = import.meta.env.VITE_BRIDGE === 'browser' || !window.electronAPI
const bridge: Bridge = useBrowserBridge ? new BrowserBridge() : new ElectronBridge()

createRoot(document.getElementById('app')!).render(
  <BridgeProvider value={bridge}><App /></BridgeProvider>
)
```

`vite.renderer.config.ts` already has only `[react()]` and `optimizeDeps.exclude: ['animejs']` — works as a standalone dev server. `index.html` is at repo root and already serves the renderer entry.

**Verification**: run `bun run dev:web`, open `http://localhost:5173`, navigate Library → Settings → Player. Acceptance: zero console errors mentioning `electronAPI`; mock library renders; play button triggers a directory-picker prompt (FS Access API).

---

## 7. Execution order (file-by-file)

**Phase 1 — Bridge boundary (no behaviour change):**
1. Create `src/app/data/{Bridge.ts, ElectronBridge.ts, BridgeContext.tsx, BrowserBridge.ts, index.ts}`.
2. Migrate consumers to `useBridge()`: `App.tsx` → `SettingsContext.tsx` → `AudioContext.tsx` → `SettingsView.tsx` → `LibraryView.tsx` → `useLibraryScanner.ts` → `useKeyboardShortcuts.ts`.
3. Wrap `<App />` in `<BridgeProvider>` in `src/renderer.tsx`.
4. Delete `src/app/services/contextBridge.ts`.

**Phase 2 — Models:**
5. `models/Model.ts`, `observable.ts`, `useObservable.ts`.
6. `models/Track.ts`, `WaveformCache.ts`, `FolderEntry.ts`.
7. `models/Album.ts`, `Artist.ts`, `registry.ts`, `index.ts`.
8. Refit `LibraryContext.tsx` to hold `ModelRegistry` instead of `readonly Track[]`. `filteredTracks`, `selectTrack` etc. operate on Track instances. `services/types.ts` shrinks to IPC-payload (DTO) types only.

**Phase 3 — Layout:**
9. `layout/AppLayout.tsx`, `Titlebar.tsx`, `index.ts`.
10. Extract `LibrarySidebar.tsx` from `LibraryView.tsx`.
11. Add `layout/ExpandedPlayerPortal.tsx` (replaces `App.tsx:135-151`).
12. Rewrite `App.tsx` `AppContent` to use `<AppLayout>`. Update CSS classes.

**Phase 4 — Write IPC:**
13. Create `src/db-writer.ts`. Reuses `mapTrack` shape from `main.ts:108-115`.
14. Extend `src/preload.ts` and `global.d.ts` with `upsertModel`/`deleteModel`.
15. Extend `src/main.ts` with `models:upsert` / `models:delete` handlers + writer-worker spawn (mirror `getScanWorker()` at `main.ts:230-263`).
16. Wire `Model.#flush()` → `Bridge.upsertModel` (already in the sketch).

**Phase 5 — Browser dev mode:**
17. Add `dev:web` script to `package.json`.
18. Bridge-selection logic in `src/renderer.tsx`.

**Phase 6 — Tests** (see next section).

---

## 8. Test plan

Existing pattern: `tests/<area>/<Name>.test.tsx`, vitest 4.1.2, jsdom, RTL 16.3.2, jest-dom matchers. Setup at `tests/setup.ts` mocks `AudioContext` / `AnalyserNode` / `HTMLMediaElement`.

**New files:**
- `tests/models/observable.test.ts` — assignment fires `change`; equal value does not; `hydrate()` does not call `bridge.upsertModel` (spy bridge); after the debounce window exactly one `upsertModel` call with combined dirty fields.
- `tests/models/Model.test.ts` — `toJSON()` returns only `@observable` keys; rapid sets debounce to one flush; `flushDelayMs` override on a subclass is honoured.
- `tests/models/Track.test.ts` — field changes; `waveform` returns same Promise on repeated access; calling on different Tracks invokes the loader once each.
- `tests/models/WaveformCache.test.ts` — eviction order, loader called once per id.
- `tests/models/Album.test.ts`, `tests/models/Artist.test.ts` — derived membership updates when a track's `album`/`artist` mutates; `Album.byId` returns stable identity.
- `tests/models/FolderEntry.test.ts` — children resolved via registry walk over Track paths.
- `tests/data/BrowserBridge.test.ts` — `selectDirectory` falls back when FS Access API absent; `upsertModel` stores in memory; `loadLibrary` returns hydrated DTOs.
- `tests/layout/AppLayout.test.tsx` — renders all four slot regions; slot content swaps when `UIContext.currentView` changes (wrap providers + `<BridgeProvider value={makeMockBridge()}>`).
- `tests/views/LibraryView.test.tsx` (NEW) — scan triggers `bridge.scanLibrary` once; right-click invokes `bridge.showContextMenu` with computed coords; menu action 0 plays the track.
- `tests/views/SettingsView.test.tsx` (NEW) — "Add Folder" calls `bridge.selectDirectory`, then library-paths state updates.

**Updates:**
- `tests/contexts/AudioContext.test.tsx`, `SettingsContext.test.tsx`, `UIContext.test.tsx` — replace `window.electronAPI` mutation with `<BridgeProvider value={makeMockBridge()}>` wrapper.
- `tests/setup.ts` — keep current Web Audio mocks; default `window.electronAPI` to a noop mock so `ElectronBridge` works in jsdom too.

**Reused utilities to add:**
- `tests/helpers/makeMockBridge.ts` — returns a `Bridge` with vi.fn for every method.
- `tests/helpers/renderWithProviders.tsx` — wraps a node in `BridgeProvider + UIProvider + SettingsProvider + LibraryProvider + AudioProvider`.

---

## 9. Verification (end-to-end)

1. **Type check & lint**: `bun run typecheck && bun run lint`.
2. **Tests**: `bun test` — all model, decorator, bridge, layout, and view tests pass.
3. **Electron build still works**: `bun run start` — Library scans, plays a track, OS media controls reflect state, context menu shows, window controls work.
4. **Browser dev mode**: `bun run dev:web`, open `http://localhost:5173` in Chrome/Edge:
   - All four views (Library, Player, Settings, Tag Editor) render without `electronAPI` errors.
   - Tag Editor: change a track's `title`, observe `BrowserBridge.upsertModel('Track', …)` called after ~150 ms (DevTools).
   - Player: clicking play prompts the directory picker (FS Access API), then plays.
5. **Tree depth audit**: open React DevTools, confirm no path from `<AppLayout>` to a leaf component exceeds 3 wrapper components.

---

## Critical files to modify

- `src/app/services/contextBridge.ts` (deleted) → `src/app/data/{Bridge,ElectronBridge,BrowserBridge,BridgeContext}.ts`
- `src/app/App.tsx:42-156` (rewrite using `<AppLayout>`)
- `src/app/views/LibraryView.tsx:124-195` (extract `LibrarySidebar`)
- `src/app/contexts/{Audio,Settings,Library}Context.tsx` (use `useBridge()`; LibraryContext holds `ModelRegistry`)
- `src/app/hooks/{useLibraryScanner,useKeyboardShortcuts}.ts` (use `useBridge()`)
- `src/app/services/types.ts` (shrink to DTO types; class models live in `models/`)
- `src/preload.ts` (+ `upsertModel`, `deleteModel`)
- `src/main.ts:118-321` (+ `models:upsert`, `models:delete`, spawn `db-writer`)
- `src/db-writer.ts` (new Node Worker; mirrors `scanner-worker.ts` worker conventions)
- `src/renderer.tsx` (bridge selection + `<BridgeProvider>`)
- `package.json` (+ `dev:web` script)
- `vite.renderer.config.ts` (no change expected; verify standalone serve works)
- `tests/setup.ts` (default `window.electronAPI` noop)

## Reusable existing code

- `decodeWaveformBars` at `src/app/contexts/AudioContext.tsx:30-58` — lift into `models/WaveformCache.ts`.
- `mapTrack` at `src/main.ts:108-115` — reuse in `db-writer.ts` for snake_case ↔ camelCase.
- `getScanWorker()` pattern at `src/main.ts:230-263` — mirror for the writer worker.
- `services/audioEngine.ts` — currently dead code; flagged as a follow-up consolidation target with `AudioContext`. **Not** touched in this refactor.

## Risks / things to watch

- Per-Track subscriptions could over-render during a 10k-track scan. Mitigation already in plan: `TrackTable` subscribes to `ModelRegistry`, not to individual Tracks.
- `scanner-worker` + `db-writer` both opening `library.db` — supported by SQLite WAL but warrants a smoke test under load.
- File System Access API requires a user gesture for `readFile` in the browser; first track click prompts a directory picker. Acceptable for dev mode.
- Stage-3 decorators are TS 6 native, but worth a one-line smoke test on `models/observable.ts` before committing the rest of the model layer.
