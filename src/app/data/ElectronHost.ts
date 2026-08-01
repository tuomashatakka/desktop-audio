// ElectronHost.ts - Electron host adapter (window controls, media keys, context menu)
// Data methods removed - now in IpcDataSource

import type { HostBridge } from './HostBridge'
import type { SerializableMenuItem, MediaState } from '../services/types'
import { noop } from '../utils/noop'


export class ElectronHost implements HostBridge {
  private readonly _ipc = window.electronAPI

  minimizeWindow (): void {
    this._ipc?.minimizeWindow()
  }

  maximizeWindow (): void {
    this._ipc?.maximizeWindow()
  }

  closeWindow (): void {
    this._ipc?.closeWindow()
  }

  async isMaximized (): Promise<boolean> {
    return (this._ipc?.isMaximized() as Promise<boolean>) ?? Promise.resolve(false)
  }

  /** Resizes the BrowserWindow content area via IPC. */
  setWindowSize (width: number, height: number): void {
    this._ipc?.setWindowSize(width, height)
  }

  /** Subscribes to the OS play/pause media key; returns an unsubscribe. */
  onMediaPlayPause (cb: () => void): () => void {
    return this._ipc?.onMediaPlayPause(cb) ?? noop
  }

  onMediaNext (cb: () => void): () => void {
    return this._ipc?.onMediaNext(cb) ?? noop
  }

  onMediaPrev (cb: () => void): () => void {
    return this._ipc?.onMediaPrev(cb) ?? noop
  }

  showContextMenu (items: SerializableMenuItem[], x: number, y: number, w: number, h: number): void {
    this._ipc?.showContextMenu(items, x, y, w, h)
  }

  hideContextMenu (): void {
    this._ipc?.hideContextMenu()
  }

  onContextMenuAction (cb: (i: number) => void): () => void {
    return this._ipc?.onContextMenuAction(cb) ?? noop
  }

  updateMediaState (s: MediaState): void {
    this._ipc?.updateMediaState(s)
  }

  onMediaSeek (cb: (delta: number) => void): () => void {
    return this._ipc?.onMediaSeek(cb) ?? noop
  }

  async selectDirectory (): Promise<string | null> {
    return (this._ipc?.selectDirectory() as Promise<string | null>) ?? Promise.resolve(null)
  }

  async getMusicDir (): Promise<string | null> {
    return (this._ipc?.getMusicDir() as Promise<string | null>) ?? Promise.resolve(null)
  }
}
