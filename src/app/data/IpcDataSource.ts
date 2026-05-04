// IpcDataSource.ts - DataSource adapter that wraps window.electronAPI calls
// Preserves current Electron behaviour exactly

import type { DataSource, DataEvent, DataListener, LibraryRoot, AudioMetadata, TrackDTO } from './DataSource'


export class IpcDataSource implements DataSource {
  private readonly _ipc = window.electronAPI
  private trackIdToPath = new Map<string, string>()

  async addRoot (): Promise<string | null> {
    const path = await (this._ipc?.selectDirectory() as Promise<string | null> ?? Promise.resolve(null))
    if (!path)
      return null
    return path
  }

  async removeRoot (rootId: string): Promise<void> {
    // IPC doesn't have a removeRoot method yet - this would need to be added
    console.log('IpcDataSource: removeRoot called with', rootId)
  }

  async listRoots (): Promise<readonly LibraryRoot[]> {
    // For now, return empty - this would need IPC method to list roots
    return []
  }

  scan (rootIds: readonly string[]): void {
    // Fire and forget - results come via subscribe()
    this._ipc?.scanLibrary([ ...rootIds ])
  }

  async load (): Promise<readonly TrackDTO[]> {
    return (this._ipc?.loadLibrary() as Promise<readonly TrackDTO[]>) ?? Promise.resolve([])
  }

  subscribe (l: DataListener): () => void {
    const unsubBatch = this._ipc?.onLibraryBatch((batch: unknown[]) => {
      const tracks = batch as TrackDTO[]
      // Store path mappings for readBytes
      for (const t of tracks) {
        this.trackIdToPath.set(t.id, t.path)
      }
      l({ type: 'batch', tracks })
    }) ?? (() => {})

    const unsubDone = this._ipc?.onLibraryDone(() => {
      l({ type: 'done', totalCount: this.trackIdToPath.size })
    }) ?? (() => {})

    return () => {
      unsubBatch()
      unsubDone()
    }
  }

  async readBytes (trackId: string): Promise<ArrayBuffer> {
    const path = this.trackIdToPath.get(trackId)
    if (!path) {
      throw new Error(`No path found for trackId: ${trackId}`)
    }
    return (this._ipc?.readFile(path) as Promise<ArrayBuffer>) ?? Promise.resolve(new ArrayBuffer(0))
  }

  async readMetadata (trackId: string): Promise<AudioMetadata> {
    const path = this.trackIdToPath.get(trackId)
    if (!path) {
      throw new Error(`No path found for trackId: ${trackId}`)
    }
    return (this._ipc?.getAudioMetadata(path) as Promise<AudioMetadata>) ??
      Promise.resolve({ duration: 0 })
  }

  async upsertTrack (track: TrackDTO): Promise<void> {
    this._ipc?.upsertModel?.('track', track as unknown as Record<string, unknown>)
  }

  async deleteTrack (trackId: string): Promise<void> {
    this._ipc?.deleteModel?.('track', trackId)
  }
}
