/**
 * Browser host adapter for non-Electron environments.
 *
 * A null object: the browser has no window chrome, media keys or native
 * context menus, so almost every member is a deliberate no-op and the
 * subscription methods hand back {@link noop} as their unsubscribe.
 * Directory selection is the one real capability, via the File System
 * Access API.
 *
 * Because these are stubs, none of them touch `this` — but they cannot be
 * `static` either, since they satisfy the {@link HostBridge} instance
 * contract. Hence the `skipcq: JS-0105` markers.
 */
import type { HostBridge } from './HostBridge'
import type { SerializableMenuItem, MediaState } from '../services/types'
import { noop } from '../utils/noop'


export class BrowserHost implements HostBridge {
  // `padded-blocks: never` forbids the blank line that
  // `lines-around-comment` wants before the first member's doc comment, so the
  // two rules cannot both be satisfied at the start of a class body.

  /** No-op: the browser tab has no window chrome to minimize. */
  // skipcq: JS-0105
  minimizeWindow (): void {
    console.log('BrowserHost: minimizeWindow called (no-op in browser)')
  }

  /** No-op: the browser tab has no window chrome to maximize. */
  // skipcq: JS-0105
  maximizeWindow (): void {
    console.log('BrowserHost: maximizeWindow called (no-op in browser)')
  }

  /** No-op: a page cannot close its own tab reliably. */
  // skipcq: JS-0105
  closeWindow (): void {
    console.log('BrowserHost: closeWindow called (no-op in browser)')
  }

  /** Always `false` — there is no maximized state to report. */
  // skipcq: JS-0105
  async isMaximized (): Promise<boolean> {
    return false
  }

  /** No-op: pages may not resize their own viewport. */
  // skipcq: JS-0105
  setWindowSize (width: number, height: number): void {
    console.log('BrowserHost: setWindowSize called (no-op in browser)', width, height)
  }

  /** No media-key access in the browser; returns a no-op unsubscribe. */
  // skipcq: JS-0105
  onMediaPlayPause (_cb: () => void): () => void {
    return noop
  }

  /** No media-key access in the browser; returns a no-op unsubscribe. */
  // skipcq: JS-0105
  onMediaNext (_cb: () => void): () => void {
    return noop
  }

  /** No media-key access in the browser; returns a no-op unsubscribe. */
  // skipcq: JS-0105
  onMediaPrev (_cb: () => void): () => void {
    return noop
  }

  /** No-op: native context menus are not available to a page. */
  // skipcq: JS-0105
  showContextMenu (_items: SerializableMenuItem[], _x: number, _y: number, _w: number, _h: number): void {
    console.log('BrowserHost: showContextMenu called (no-op in browser)')
  }

  /** No-op counterpart to {@link showContextMenu}. */
  // skipcq: JS-0105
  hideContextMenu (): void {
    console.log('BrowserHost: hideContextMenu called (no-op in browser)')
  }

  /** Nothing can fire; returns a no-op unsubscribe. */
  // skipcq: JS-0105
  onContextMenuAction (_cb: (i: number) => void): () => void {
    return noop
  }

  /** No-op: OS media-session updates are Electron-only here. */
  // skipcq: JS-0105
  updateMediaState (_s: MediaState): void {
    console.log('BrowserHost: updateMediaState called (no-op in browser)')
  }

  /** Nothing can fire; returns a no-op unsubscribe. */
  // skipcq: JS-0105
  onMediaSeek (_cb: (delta: number) => void): () => void {
    return noop
  }

  async selectDirectory (): Promise<string | null> {
    try {
      // Use File System Access API if available (Chromium 86+)
      const win = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      if (win.showDirectoryPicker) {
        const handle = await win.showDirectoryPicker()
        return handle.name
      }
      console.log('BrowserHost: showDirectoryPicker not available')
      return null
    }
    catch (error) {
      // User cancelled or API not available
      if (error instanceof DOMException && error.name === 'AbortError')
        return null
      console.log('BrowserHost: selectDirectory cancelled or failed', error)
      return null
    }
  }

  async getMusicDir (): Promise<string | null> {
    // Try to get music directory (not directly possible in browsers)
    console.log('BrowserHost: getMusicDir called (not available in browser)')
    return null
  }
}
