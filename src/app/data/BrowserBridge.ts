import type { Bridge } from './Bridge'
import type { SerializableMenuItem, MediaState, TrackDTO } from '../services/types'

export class BrowserBridge implements Bridge {
  private tracks: Map<string, TrackDTO> = new Map()

  scanLibrary(_paths: string[]): void {
    console.log('BrowserBridge: scanLibrary called (no-op in browser)')
  }

  async loadLibrary(): Promise<readonly TrackDTO[]> {
    return Array.from(this.tracks.values())
  }

  onLibraryBatch(_cb: (t: unknown[]) => void): () => void {
    return () => {}
  }

  onLibraryDone(_cb: () => void): () => void {
    return () => {}
  }

  async selectDirectory(): Promise<string | null> {
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const win = window as Window & { showDirectoryPicker?: () => Promise<unknown> }
        await win.showDirectoryPicker?.()
        return '/mock/path'
      } catch {
        return null
      }
    }
    return null
  }

  async getMusicDir(): Promise<string | null> {
    return null
  }

  async readFile(_path: string): Promise<ArrayBuffer> {
    return new ArrayBuffer(0)
  }

  async getAudioMetadata(_path: string): Promise<MediaState> {
    return { title: '', artist: '', album: '', isPlaying: false, position: 0, duration: 0 }
  }

  minimizeWindow(): void {}
  maximizeWindow(): void {}
  closeWindow(): void {}

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

  showContextMenu(_items: SerializableMenuItem[], _x: number, _y: number, _w: number, _h: number): void {}
  hideContextMenu(): void {}

  onContextMenuAction(_cb: (i: number) => void): () => void {
    return () => {}
  }

  updateMediaState(_s: MediaState): void {}
  onMediaSeek(_cb: (delta: number) => void): () => void {
    return () => {}
  }

  upsertModel(_kind: string, _payload: Record<string, unknown>): void {
    console.log('BrowserBridge: upsertModel called')
  }

  deleteModel(_kind: string, _id: string): void {
    console.log('BrowserBridge: deleteModel called')
  }
}
