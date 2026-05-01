import type { Bridge } from './Bridge'
import type { SerializableMenuItem, MediaState, TrackDTO } from '../services/types'


export class ElectronBridge implements Bridge {
  private readonly _ipc = window.electronAPI

  scanLibrary (paths: string[]): void {
    this._ipc?.scanLibrary(paths)
  }

  loadLibrary (): Promise<readonly TrackDTO[]> {
    return (this._ipc?.loadLibrary() as Promise<readonly TrackDTO[]>) ?? Promise.resolve([])
  }

  onLibraryBatch (cb: (t: unknown[]) => void): () => void {
    return this._ipc?.onLibraryBatch(cb as any) ?? (() => {})
  }

  onLibraryDone (cb: () => void): () => void {
    return this._ipc?.onLibraryDone(cb) ?? (() => {})
  }

  selectDirectory (): Promise<string | null> {
    return (this._ipc?.selectDirectory() as Promise<string | null>) ?? Promise.resolve(null)
  }

  getMusicDir (): Promise<string | null> {
    return (this._ipc?.getMusicDir() as Promise<string | null>) ?? Promise.resolve(null)
  }

  readFile (path: string): Promise<ArrayBuffer> {
    return (this._ipc?.readFile(path) as Promise<ArrayBuffer>) ?? Promise.resolve(new ArrayBuffer(0))
  }

  getAudioMetadata (path: string): Promise<MediaState> {
    return (this._ipc?.getAudioMetadata(path) as Promise<MediaState>) ??
      Promise.resolve({ title: '', artist: '', album: '', isPlaying: false, position: 0, duration: 0 })
  }

  minimizeWindow (): void {
    this._ipc?.minimizeWindow()
  }

  maximizeWindow (): void {
    this._ipc?.maximizeWindow()
  }

  closeWindow (): void {
    this._ipc?.closeWindow()
  }

  isMaximized (): Promise<boolean> {
    return (this._ipc?.isMaximized() as Promise<boolean>) ?? Promise.resolve(false)
  }

  onMediaPlayPause (cb: () => void): () => void {
    return this._ipc?.onMediaPlayPause(cb) ?? (() => {})
  }

  onMediaNext (cb: () => void): () => void {
    return this._ipc?.onMediaNext(cb) ?? (() => {})
  }

  onMediaPrev (cb: () => void): () => void {
    return this._ipc?.onMediaPrev(cb) ?? (() => {})
  }

  showContextMenu (items: SerializableMenuItem[], x: number, y: number, w: number, h: number): void {
    this._ipc?.showContextMenu(items, x, y, w, h)
  }

  hideContextMenu (): void {
    this._ipc?.hideContextMenu()
  }

  onContextMenuAction (cb: (i: number) => void): () => void {
    return this._ipc?.onContextMenuAction(cb) ?? (() => {})
  }

  updateMediaState (s: MediaState): void {
    this._ipc?.updateMediaState(s)
  }

  onMediaSeek (cb: (delta: number) => void): () => void {
    return this._ipc?.onMediaSeek(cb) ?? (() => {})
  }

  upsertModel (kind: string, payload: Record<string, unknown>): void {
    this._ipc?.upsertModel?.(kind, payload)
  }

  deleteModel (kind: string, id: string): void {
    this._ipc?.deleteModel?.(kind, id)
  }
}
