import type { AudioMetadata, MediaState } from './app/services/types'


interface ElectronAPI {
  // Library
  scanLibrary:    (dirPaths: string[]) => void
  loadLibrary:    () => Promise<unknown[]>
  onLibraryBatch: (cb: (tracks: unknown[]) => void) => () => void
  onLibraryDone:  (cb: () => void) => () => void

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
  showContextMenu:     (items: unknown[], x: number, y: number, w: number, h: number) => void
  hideContextMenu:     () => void
  onContextMenuAction: (cb: (index: number) => void) => () => void

  // Media state
  updateMediaState: (state: MediaState) => void
  onMediaSeek:      (cb: (delta: number) => void) => () => void

  // Model write operations
  upsertModel: (kind: string, payload: Record<string, unknown>) => Promise<unknown>
  deleteModel: (kind: string, id: string) => Promise<unknown>
}

declare interface Window {
  electronAPI?: ElectronAPI
}
