// BrowserHost.ts - Browser host adapter for non-Electron environments
// Uses File System Access API for directory selection

import type { HostBridge } from './HostBridge'
import type { SerializableMenuItem, MediaState } from '../services/types'

export class BrowserHost implements HostBridge {
  minimizeWindow(): void {
    console.log('BrowserHost: minimizeWindow called (no-op in browser)')
  }

  maximizeWindow(): void {
    console.log('BrowserHost: maximizeWindow called (no-op in browser)')
  }

  closeWindow(): void {
    console.log('BrowserHost: closeWindow called (no-op in browser)')
  }

  async isMaximized(): Promise<boolean> {
    return false
  }

  onMediaPlayPause(_cb: () => void): () => void {
    return () => {}
  }

  onMediaNext(_cb: () => void): () => void {
    return () => {}
  }

  onMediaPrev(_cb: () => void): () => void {
    return () => {}
  }

  showContextMenu(_items: SerializableMenuItem[], _x: number, _y: number, _w: number, _h: number): void {
    console.log('BrowserHost: showContextMenu called (no-op in browser)')
  }

  hideContextMenu(): void {
    console.log('BrowserHost: hideContextMenu called (no-op in browser)')
  }

  onContextMenuAction(_cb: (i: number) => void): () => void {
    return () => {}
  }

  updateMediaState(_s: MediaState): void {
    console.log('BrowserHost: updateMediaState called (no-op in browser)')
  }

  onMediaSeek(_cb: (delta: number) => void): () => void {
    return () => {}
  }

  async selectDirectory(): Promise<string | null> {
    try {
      // Use File System Access API if available (Chromium 86+)
      const win = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      if (win.showDirectoryPicker) {
        const handle = await win.showDirectoryPicker()
        return handle.name
      }
      console.log('BrowserHost: showDirectoryPicker not available')
      return null
    } catch (error) {
      // User cancelled or API not available
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null
      }
      console.log('BrowserHost: selectDirectory cancelled or failed', error)
      return null
    }
  }

  async getMusicDir(): Promise<string | null> {
    // Try to get music directory (not directly possible in browsers)
    console.log('BrowserHost: getMusicDir called (not available in browser)')
    return null
  }
}
