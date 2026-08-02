/**
 * Platform/host integration surface.
 *
 * Covers everything that depends on the embedding shell rather than data:
 * window chrome (minimize/maximize/close), system media keys, native
 * context menus, and OS media-session updates (MPRIS / SMTC / NowPlaying).
 * Each implementation lives next to its host: {@link ElectronHost},
 * {@link BrowserHost}. Data access lives on {@link DataSource}.
 */
import type { SerializableMenuItem, MediaState } from '../services/types'


/** See module docstring. */
export interface HostBridge {
  // Window
  minimizeWindow(): void
  maximizeWindow(): void
  closeWindow(): void
  isMaximized(): Promise<boolean>

  /** Resize the window's content area (matches `window.innerWidth/innerHeight`). */
  setWindowSize(width: number, height: number): void

  // Media keys
  onMediaPlayPause(cb: () => void): () => void
  onMediaNext(cb: () => void): () => void
  onMediaPrev(cb: () => void): () => void

  // Context menu
  showContextMenu(items: SerializableMenuItem[], x: number, y: number, w: number, h: number, theme?: string, accent?: string): void
  hideContextMenu(): void
  onContextMenuAction(cb: (i: number) => void): () => void

  // Media state
  updateMediaState(s: MediaState): void
  onMediaSeek(cb: (delta: number) => void): () => void

  // Directory/File system
  selectDirectory(): Promise<string | null>
  getMusicDir(): Promise<string | null>
}
