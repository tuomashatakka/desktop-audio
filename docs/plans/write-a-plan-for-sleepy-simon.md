# Plan: Custom Context Menu Window + Native Media Controls

## Context

The existing in-window `ContextMenu` component uses `createPortal` to render inside the main BrowserWindow DOM. This means the menu is clipped by the window bounds and cannot overflow outside it. The fix is to replace it with a second, hidden frameless `BrowserWindow` that is positioned precisely over the screen coordinates of the target element, allowing the menu to render over the OS chrome.

Additionally, while media keys (play/pause, next, prev) are already handled via `globalShortcut`, the OS has no knowledge of what is currently playing. Native media controls (MPRIS2 on Linux) require the app to register itself as a media player and push track/playback state to the OS.

---

## Feature 1: Context Menu via Popover BrowserWindow

### Architecture

```
Main Renderer            Main Process             Popover Renderer
      |                        |                         |
      |--contextmenu:show----->|                         |
      |  { items, x, y, w, h }|                         |
      |                        |--setBounds + show------>|
      |                        |--contextmenu:items----->|
      |                        |                         |--renders menu
      |                        |<--contextmenu:action----|
      |                        |     { index }           |
      |<--contextmenu:action---|                         |
      |  execute callback[i]   |                         |
```

Actions are serialized as `SerializableMenuItem[]` (no functions). The main renderer holds callbacks indexed by position and dispatches on `index` when the action returns.

### Coordinate Calculation (Renderer Side)

```ts
const screenX = window.screenX + rect.left
const screenY = window.screenY + rect.bottom + 4
```

`window.screenX/Y` gives the BrowserWindow top-left in screen space. `getBoundingClientRect()` gives viewport-relative coords. The sum is the correct screen position.

### Files to Create

| File | Purpose |
|------|---------|
| `vite.context-menu.config.ts` | Vite config for the second renderer, sets `root` to `src/app/context-menu/` |
| `src/context-menu-preload.ts` | Minimal `contextMenuAPI` bridge for the popover window |
| `src/app/context-menu/index.html` | HTML entry for the popover renderer |
| `src/app/context-menu/index.tsx` | React root mount — imports `../../index.css` (same CSS bundle as main window) |
| `src/app/context-menu/ContextMenuApp.tsx` | Menu UI — subscribes to items, dispatches action index on click |

### Shared CSS

Both renderer windows import the same `src/index.css` entry. The context menu app does this via a relative path:

```ts
// src/app/context-menu/index.tsx
import '../../index.css'   // resolves to src/index.css — same stylesheet as main window
```

`src/index.css` already sets `background: transparent` on `body`, which is correct for the frameless transparent popover window. All design tokens, reset rules, and `.context-menu-*` classes from `popover.css` are shared with zero duplication.

### Files to Modify

**`src/app/services/types.ts`** — add:
```ts
export interface SerializableMenuItem {
  readonly label?:     string
  readonly icon?:      string
  readonly danger?:    boolean
  readonly separator?: boolean
}
```

**`forge.config.ts`** — add second renderer entry and preload build entry:
```ts
// In renderer array:
{ name: 'context_menu_window', config: 'vite.context-menu.config.ts' }

// In build array:
{ entry: 'src/context-menu-preload.ts', config: 'vite.preload.config.ts', target: 'preload' }
```

**`src/main.ts`** — add `let popoverWindow: BrowserWindow | null = null`, a `createPopoverWindow()` function called in `app.on('ready')`, three IPC handlers, and a fix for `window-all-closed`:

```ts
function createPopoverWindow () {
  popoverWindow = new BrowserWindow({
    width: 240, height: 160,
    show: false, frame: false, transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'context-menu-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  // load CONTEXT_MENU_WINDOW_VITE_DEV_SERVER_URL or file
  popoverWindow.on('blur', () => popoverWindow?.hide())
  popoverWindow.on('closed', () => { popoverWindow = null })
}

ipcMain.on('contextmenu:show', (_e, { items, x, y, width, height }) => {
  if (!popoverWindow) return
  popoverWindow.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
  popoverWindow.webContents.send('contextmenu:items', items)
  popoverWindow.show()
  popoverWindow.focus()
})

ipcMain.on('contextmenu:hide', () => popoverWindow?.hide())

ipcMain.on('contextmenu:action', (_e, { index }: { index: number }) => {
  mainWindow?.webContents.send('contextmenu:action', { index })
  popoverWindow?.hide()
})

// Fix window-all-closed — popoverWindow should not block quit
app.on('window-all-closed', () => {
  const userWindows = BrowserWindow.getAllWindows().filter(w => w !== popoverWindow)
  if (process.platform !== 'darwin' && userWindows.length === 0) app.quit()
})
```

**`src/preload.ts`** — add three methods to the `electronAPI` bridge:
```ts
showContextMenu: (items, x, y, width, height) =>
  ipcRenderer.send('contextmenu:show', { items, x, y, width, height }),
hideContextMenu: () => ipcRenderer.send('contextmenu:hide'),
onContextMenuAction: (cb) => {
  const h = (_, { index }) => cb(index)
  ipcRenderer.on('contextmenu:action', h)
  return () => ipcRenderer.removeListener('contextmenu:action', h)
},
```

**`src/app/views/LibraryView.tsx`** — replace the stateful `contextRect`/`contextTrack` + `<ContextMenu>` JSX approach with IPC dispatch:
- Remove: `contextRect` state, `contextTrack` state, `contextMenuItems` memo, `<ContextMenu>` JSX, `ContextMenu` import
- Add: `contextTrackRef = useRef<Track | null>(null)`, a `useEffect` that subscribes `bridge.onContextMenuAction` and dispatches by index, updated `handleContextMenu` that calls `bridge.showContextMenu` with screen coords and `SerializableMenuItem[]`
- Action index mapping: `0 → play`, `1 → add to playlist`, `2 → separator (skip)`, `3 → edit tags`

---

## Feature 2: Native Media Controls (MPRIS2, Linux)

### Architecture

All media control logic (global shortcuts + MPRIS2) lives in a single self-contained module `src/media-controls.ts`. `src/main.ts` calls `init(mainWindow)` on ready and `teardown()` on quit — nothing else leaks into main.

```
src/media-controls.ts
  ├── init(win)       — registers globalShortcuts + MPRIS player (Linux), wires events
  ├── updateState(s)  — called from IPC handler, updates MPRIS metadata/status
  └── teardown()      — unregisters shortcuts, closes MPRIS
```

The renderer pushes `MediaState` to the main process whenever track, play state, or position changes. MPRIS events from the OS (play, pause, next, previous, seek) are forwarded to the renderer through the `win` reference captured by `init`.

### New File: `src/media-controls.ts`

```ts
import { globalShortcut, BrowserWindow } from 'electron'
import type { MediaState } from './app/services/types'

// eslint-disable-next-line functional/no-let
let mprisPlayer: any = null  // eslint-disable-line @typescript-eslint/no-explicit-any

export function init (win: BrowserWindow): void {
  // Global media key shortcuts (all platforms)
  globalShortcut.register('MediaPlayPause', () => win.webContents.send('media:play-pause'))
  globalShortcut.register('MediaNextTrack', () => win.webContents.send('media:next'))
  globalShortcut.register('MediaPreviousTrack', () => win.webContents.send('media:prev'))

  // MPRIS2 D-Bus player (Linux only)
  if (process.platform !== 'linux') return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Player = require('mpris-service')
  mprisPlayer = Player({
    name: 'desktopAudio', identity: 'Desktop Audio',
    supportedUriSchemes: ['file'],
    supportedMimeTypes:  ['audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/x-wav'],
    supportedInterfaces: ['player'],
  })
  mprisPlayer.on('play',     () => win.webContents.send('media:play-pause'))
  mprisPlayer.on('pause',    () => win.webContents.send('media:play-pause'))
  mprisPlayer.on('next',     () => win.webContents.send('media:next'))
  mprisPlayer.on('previous', () => win.webContents.send('media:prev'))
  mprisPlayer.on('seek',     (delta: number) => win.webContents.send('media:seek', delta))
}

export function updateState (state: MediaState): void {
  if (!mprisPlayer) return
  mprisPlayer.metadata = {
    'mpris:trackid': mprisPlayer.objectPath('track/0'),
    'mpris:length':  state.duration * 1e6,
    'xesam:title':   state.title,
    'xesam:artist':  [state.artist],
    'xesam:album':   state.album,
    ...(!state.albumArt?.startsWith('data:') && state.albumArt
      ? { 'mpris:artUrl': state.albumArt } : {}),
  }
  mprisPlayer.playbackStatus = state.isPlaying ? 'Playing' : 'Paused'
  mprisPlayer.position = state.position * 1e6
}

export function teardown (): void {
  globalShortcut.unregisterAll()
  mprisPlayer = null
}
```

### Files to Modify

**`src/app/services/types.ts`** — add:
```ts
export interface MediaState {
  readonly title:     string
  readonly artist:    string
  readonly album:     string
  readonly albumArt?: string   // omit if starts with 'data:' — MPRIS needs file:// or http://
  readonly isPlaying: boolean
  readonly position:  number   // seconds
  readonly duration:  number   // seconds
}
```

**`package.json`** — add `"mpris-service": "^2.1.2"` to `dependencies`.

**`vite.main.config.ts`** — externalize `mpris-service`:
```ts
build: { rollupOptions: { external: ['better-sqlite3', 'mpris-service'] } }
```

**`src/main.ts`** — replace inline `globalShortcut` registration with the module. The diff is purely subtractive for the existing shortcut code, plus two additive calls:

```ts
import * as mediaControls from './media-controls'

// In app.on('ready'):
mediaControls.init(mainWindow)          // replaces the 3 globalShortcut.register() calls

// In app.on('will-quit'):
mediaControls.teardown()                // replaces globalShortcut.unregisterAll()

// New IPC handler:
ipcMain.on('media:state-update', (_e, state: MediaState) => mediaControls.updateState(state))
```

**`src/preload.ts`** — add:
```ts
updateMediaState: (state) => ipcRenderer.send('media:state-update', state),
onMediaSeek: (cb) => {
  const h = (_, delta) => cb(delta)
  ipcRenderer.on('media:seek', h)
  return () => ipcRenderer.removeListener('media:seek', h)
},
```

**`src/app/contexts/AudioContext.tsx`** — add a `useEffect` that watches `currentTrack`, `isPlaying`, `currentTime`, `duration` and calls `bridge.updateMediaState(...)` with 500ms debounce on position-only changes. Also subscribe `bridge.onMediaSeek` to handle MPRIS-initiated seeks.

---

## Implementation Order

1. `src/app/services/types.ts` — add `SerializableMenuItem`, `MediaState`
2. `src/media-controls.ts` — new self-contained module (global shortcuts + MPRIS)
3. `vite.context-menu.config.ts` — new file
4. `forge.config.ts` — add renderer + preload build entries
5. `src/context-menu-preload.ts` — new file
6. `src/app/context-menu/index.html`, `index.tsx`, `ContextMenuApp.tsx` — new files
7. `src/main.ts` — `popoverWindow`, contextmenu IPC handlers, media-controls integration, `window-all-closed` fix
8. `src/preload.ts` — `showContextMenu`, `hideContextMenu`, `onContextMenuAction`, `updateMediaState`, `onMediaSeek`
9. `src/app/views/LibraryView.tsx` — replace `<ContextMenu>` with IPC dispatch
10. `src/app/contexts/AudioContext.tsx` — add media state reporting
11. `package.json` + `vite.main.config.ts` — add `mpris-service` + externalize it

---

## Verification

1. `bun run typecheck` — should pass with zero errors after `global.d.ts` is updated
2. `bun run start` — open app, right-click a track row; the menu should appear in a separate OS window outside the main window bounds
3. Drag the main window partially off-screen; right-click a track — menu should appear fully visible beyond the main window edge
4. Click a menu item — action executes (play starts, tag editor opens, etc.)
5. Click outside the menu — it dismisses
6. On Linux: install `playerctl` (`apt install playerctl`) and run `playerctl metadata` while a track plays — should show title/artist/album
7. Press a hardware media key — playback responds; `playerctl status` should reflect play/pause state
