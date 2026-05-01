import type { SerializableMenuItem, MediaState, TrackDTO } from '../services/types'

export interface Bridge {
  // Library
  scanLibrary(paths: string[]): void
  loadLibrary(): Promise<readonly TrackDTO[]>
  onLibraryBatch(cb: (t: unknown[]) => void): () => void
  onLibraryDone(cb: () => void): () => void

  // Files
  selectDirectory(): Promise<string | null>
  getMusicDir(): Promise<string | null>
  readFile(path: string): Promise<ArrayBuffer>
  getAudioMetadata(path: string): Promise<MediaState>

  // Window
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  isMaximized(): Promise<boolean>

  // Media keys
  onMediaPlayPause(cb: () => void): () => void
  onMediaNext(cb: () => void): () => void
  onMediaPrev(cb: () => void): () => void

  // Context menu
  showContextMenu(items: SerializableMenuItem[], x: number, y: number, w: number, h: number): void
  hideContextMenu(): void
  onContextMenuAction(cb: (i: number) => void): () => void

  // Media state
  updateMediaState(s: MediaState): void
  onMediaSeek(cb: (delta: number) => void): () => void

  // Write IPC (new)
  upsertModel(kind: string, payload: Record<string, unknown>): void
  deleteModel(kind: string, id: string): void
}
