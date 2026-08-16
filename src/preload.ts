/**
 * Renderer preload — bridges main-process IPC into the browser context.
 *
 * Exposes a single `electronAPI` object on `window` via `contextBridge`,
 * keeping `nodeIntegration` off and locking the surface to a curated set
 * of `library:*`, `file:*`, `window:*`, and `media:*` channels. The
 * matching TypeScript type lives in `src/global.d.ts`.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { SerializableMenuItem, MediaState } from './app/services/types'


/** Which entry of the context menu the user picked. */
interface ContextMenuSelection {
  index: number
}


/**
 * Subscribes to a channel and hands back the unsubscribe, dropping Electron's
 * `IpcRendererEvent` first so renderer callbacks only see the payload.
 *
 * Every `on*` method below is this same four-line dance; `CLAUDE.md` requires
 * these to return unsubscribers for `useEffect` cleanup, so it is worth one
 * helper rather than a dozen copies.
 */
function subscribe<Args extends unknown[]> (
  channel: string,
  cb: (...args: Args) => void
): () => void {
  const handler = (_event: unknown, ...args: Args) =>
    cb(...args)

  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Library. Both `scanLibrary` and `loadLibrary` are fire-and-forget sends —
  // their results arrive as streamed batch/done events, not as return values.
  scanLibrary: (dirPaths: string[]) =>
    ipcRenderer.send('library:scan', dirPaths),
  loadLibrary: () =>
    ipcRenderer.send('library:load'),
  onLibraryBatch: (cb: (tracks: unknown[]) => void) =>
    subscribe('library:batch', cb),
  onLibraryDone: (cb: () => void) =>
    subscribe('library:done', cb),
  onLibraryHydrateBatch: (cb: (tracks: unknown[]) => void) =>
    subscribe('library:hydrate-batch', cb),
  onLibraryHydrateDone: (cb: () => void) =>
    subscribe('library:hydrate-done', cb),
  // A worker that failed to spawn still sends a terminal `done`, but silently —
  // this is how the renderer learns *why* the library came back empty.
  onLibraryError: (cb: (message: string) => void) =>
    subscribe('library:error', cb),

  /** Discard every persisted track under `roots` — a removed library folder. */
  forgetRoots: (roots: string[]) =>
    ipcRenderer.invoke('library:forget-roots', roots),

  /** Discard specific tracks — rows stranded by a root removed long ago. */
  forgetTracks: (trackIds: string[]) =>
    ipcRenderer.invoke('library:forget-tracks', trackIds),

  /** One track's album art. `size` is 'thumb' (64px) or 'full'. */
  getArtwork: (trackId: string, size?: 'thumb' | 'full') =>
    ipcRenderer.invoke('library:artwork', trackId, size),

  /** Background harmony resolution, cached in SQLite by source mtime. */
  analyzeTrack: (trackId: string, path: string) =>
    ipcRenderer.invoke('library:analysis', trackId, path),

  // Files
  selectDirectory: () =>
    ipcRenderer.invoke('file:select'),
  getMusicDir: () =>
    ipcRenderer.invoke('file:music-dir'),
  readFile: (path: string) =>
    ipcRenderer.invoke('file:read', path),
  getAudioMetadata: (path: string) =>
    ipcRenderer.invoke('file:metadata', path),

  // Window
  minimizeWindow: () =>
    ipcRenderer.send('window:minimize'),
  maximizeWindow: () =>
    ipcRenderer.send('window:maximize'),
  closeWindow: () =>
    ipcRenderer.send('window:close'),
  isMaximized: () =>
    ipcRenderer.invoke('window:is-maximized'),
  setWindowSize: (width: number, height: number) =>
    ipcRenderer.send('window:set-size', width, height),
  onMediaPlayPause: (cb: () => void) =>
    subscribe('media:play-pause', cb),
  onMediaNext: (cb: () => void) =>
    subscribe('media:next', cb),
  onMediaPrev: (cb: () => void) =>
    subscribe('media:prev', cb),

  // Context menu — `theme`/`accent` ride along so the separate menu window
  // can paint itself in the app's current theme instead of guessing.
  showContextMenu: (
    items: SerializableMenuItem[],
    x: number, y: number, width: number, height: number,
    theme?: string, accent?: string
  ) =>
    ipcRenderer.send('contextmenu:show', { items, x, y, width, height, theme, accent }),
  hideContextMenu: () =>
    ipcRenderer.send('contextmenu:hide'),
  onContextMenuAction: (cb: (index: number) => void) =>
    subscribe('contextmenu:action', ({ index }: ContextMenuSelection) =>
      cb(index)),

  // Media state
  updateMediaState: (state: MediaState) =>
    ipcRenderer.send('media:state-update', state),
  onMediaSeek: (cb: (delta: number) => void) =>
    subscribe('media:seek', cb),

  // Write IPC — `invoke`, not `send`: both channels are registered with
  // `ipcMain.handle`, so a fire-and-forget send never reaches a handler.
  upsertModel: (kind: string, payload: Record<string, unknown>) =>
    ipcRenderer.invoke('models:upsert', kind, payload),
  deleteModel: (kind: string, id: string) =>
    ipcRenderer.invoke('models:delete', kind, id),
})
