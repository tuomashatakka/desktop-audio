// IpcDataSource.ts - DataSource adapter that wraps window.electronAPI calls
// Preserves current Electron behaviour exactly

import type { DisposableCollection } from 'disposable-events'
import type { DataSource, DataEvent, DataListener, AudioMetadata, TrackDTO, ArtworkSize } from './DataSource'
import { collectUnsubscribes } from '../utils/events'
import { noop } from '../utils/noop'
import type { TrackAnalysis } from '../services/types'


export class IpcDataSource implements DataSource {
  private readonly _ipc = window.electronAPI
  private trackIdToPath = new Map<string, string>()

  async addRoot (): Promise<string | null> {
    const path = await (this._ipc?.selectDirectory() as Promise<string | null> ?? Promise.resolve(null))
    if (!path)
      return null
    return path
  }

  scan (rootIds: readonly string[]): void {
    // Fire and forget - results come via subscribe()
    this._ipc?.scanLibrary([ ...rootIds ])
  }

  /**
   * readBytes/readMetadata resolve a trackId through this map, so every path
   * tracks enter the renderer by has to index them — not just live scans.
   * Tracks restored from SQLite on startup come through load(), which used to
   * skip this, leaving playback broken until the user triggered a rescan.
   */
  private indexPaths (tracks: readonly TrackDTO[]): void {
    for (const t of tracks)
      this.trackIdToPath.set(t.id, t.path)
  }

  /**
   * Asks the main process to stream the cached library out of SQLite. Rows
   * arrive on the hydrate channels wired up in {@link IpcDataSource.subscribe},
   * so this returns nothing.
   */
  load (): void {
    this._ipc?.loadLibrary()
  }

  /** See {@link DataSource.forgetRoots}. Deletes the rows on the writer thread. */
  async forgetRoots (roots: readonly string[]): Promise<void> {
    if (roots.length === 0)
      return
    await this._ipc?.forgetRoots([ ...roots ])
  }

  /** See {@link DataSource.forgetTracks}. */
  async forgetTracks (trackIds: readonly string[]): Promise<void> {
    if (trackIds.length === 0)
      return
    await this._ipc?.forgetTracks([ ...trackIds ])
  }

  /**
   * Relays scan and hydrate events. The four channel unsubscribes are gathered
   * into one {@link DisposableCollection}, so the caller drops all of them
   * with a single `dispose()` and cannot leak one by forgetting it.
   */
  subscribe (l: DataListener): DisposableCollection {
    const relayTracks = (type: 'batch' | 'hydrate-batch') =>
      (batch: unknown[]) => {
        const tracks = batch as TrackDTO[]
        this.indexPaths(tracks)
        l({ type, tracks })
      }

    const unsubscribes = [
      this._ipc?.onLibraryBatch(relayTracks('batch')) ?? noop,
      this._ipc?.onLibraryDone(() =>
        l({ type: 'done', totalCount: this.trackIdToPath.size })) ?? noop,
      this._ipc?.onLibraryHydrateBatch(relayTracks('hydrate-batch')) ?? noop,
      this._ipc?.onLibraryHydrateDone(() =>
        l({ type: 'hydrate-done', totalCount: this.trackIdToPath.size })) ?? noop,
      // Without this the `error` branch of every listener was unreachable under
      // Electron: a worker that failed to spawn produced silence, not a fault.
      this._ipc?.onLibraryError?.((message: string) =>
        l({ type: 'error', message })) ?? noop,
    ]

    return collectUnsubscribes(...unsubscribes)
  }

  /** See {@link DataSource.readArtwork}. Cached main-side, per track and size. */
  async readArtwork (trackId: string, size: ArtworkSize = 'thumb'): Promise<string | null> {
    return await this._ipc?.getArtwork?.(trackId, size) ?? null
  }

  async readBytes (trackId: string): Promise<ArrayBuffer> {
    const path = this.trackIdToPath.get(trackId)
    if (!path)
      throw new Error(`No path found for trackId: ${trackId}`)
    return (this._ipc?.readFile(path) as Promise<ArrayBuffer>) ?? Promise.resolve(new ArrayBuffer(0))
  }

  async readMetadata (trackId: string): Promise<AudioMetadata> {
    const path = this.trackIdToPath.get(trackId)
    if (!path)
      throw new Error(`No path found for trackId: ${trackId}`)
    return (this._ipc?.getAudioMetadata(path) as Promise<AudioMetadata>) ??
      Promise.resolve({ duration: 0 })
  }

  async analyzeTrack (trackId: string): Promise<TrackAnalysis | null> {
    const path = this.trackIdToPath.get(trackId)
    if (!path)
      throw new Error(`No path found for trackId: ${trackId}`)

    return await this._ipc?.analyzeTrack?.(trackId, path) ?? null
  }

  /** Awaits the write, so a failed save is a rejected promise and not silence. */
  async upsertTrack (track: TrackDTO): Promise<void> {
    await this._ipc?.upsertModel?.('track', track as unknown as Record<string, unknown>)
  }

  async deleteTrack (trackId: string): Promise<void> {
    await this._ipc?.deleteModel?.('track', trackId)
  }
}
