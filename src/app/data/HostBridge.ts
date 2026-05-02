// HostBridge.ts - Window/media-keys/context-menu/MPRIS methods only
// Data methods moved to DataSource interface

import type { SerializableMenuItem, MediaState } from '../services/types'

export interface HostBridge {
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

  // Directory/File system
  selectDirectory(): Promise<string | null>
  getMusicDir(): Promise<string | null>
}
