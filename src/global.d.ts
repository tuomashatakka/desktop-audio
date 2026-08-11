import type { AudioMetadata, MediaState } from './app/services/types'


interface ElectronAPI {
  // Library. Results stream back as events; neither call returns data.
  scanLibrary:           (dirPaths: string[]) => void
  loadLibrary:           () => void
  onLibraryBatch:        (cb: (tracks: unknown[]) => void) => () => void
  onLibraryDone:         (cb: () => void) => () => void
  onLibraryHydrateBatch: (cb: (tracks: unknown[]) => void) => () => void
  onLibraryHydrateDone:  (cb: () => void) => () => void
  onLibraryError:        (cb: (message: string) => void) => () => void

  /** Discard every persisted track under `roots` — a removed library folder. */
  forgetRoots: (roots: string[]) => Promise<unknown>

  /** Discard specific tracks — rows stranded by a root removed long ago. */
  forgetTracks: (trackIds: string[]) => Promise<unknown>

  /** Album art, fetched per track — list rows never carry it. */
  getArtwork: (trackId: string, size?: 'thumb' | 'full') => Promise<string | null>

  // Files
  selectDirectory:  () => Promise<string | null>
  getMusicDir:      () => Promise<string | null>
  readFile:         (path: string) => Promise<ArrayBuffer>
  getAudioMetadata: (path: string) => Promise<AudioMetadata>

  // Window
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow:    () => void
  isMaximized:    () => Promise<boolean>
  setWindowSize:  (width: number, height: number) => void

  // Media keys
  onMediaPlayPause: (cb: () => void) => () => void
  onMediaNext:      (cb: () => void) => () => void
  onMediaPrev:      (cb: () => void) => () => void

  // Context menu
  showContextMenu:     (items: unknown[], x: number, y: number, w: number, h: number, theme?: string, accent?: string) => void
  hideContextMenu:     () => void
  onContextMenuAction: (cb: (index: number) => void) => () => void

  // Media state
  updateMediaState: (state: MediaState) => void
  onMediaSeek:      (cb: (delta: number) => void) => () => void

  // Model write operations
  upsertModel: (kind: string, payload: Record<string, unknown>) => Promise<unknown>
  deleteModel: (kind: string, id: string) => Promise<unknown>
}

declare global {
  interface Window {

    /**
     * Absent in the browser build (`VITE_BRIDGE=browser`), which is why every
     * caller reaches it through optional chaining.
     */
    electronAPI?: ElectronAPI
  }
}

export type { ElectronAPI }
