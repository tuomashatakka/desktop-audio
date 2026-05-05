/**
 * Data access abstraction.
 *
 * `DataSource` describes everything the renderer needs to manage library
 * roots, scan for tracks, and read/write track data. Implementations exist
 * for Electron (IPC + SQLite, see {@link IpcDataSource}) and the browser
 * (File System Access API + IndexedDB, see {@link WebFsDataSource}). Host
 * concerns (window controls, media keys) live separately on
 * {@link HostBridge}.
 */
import type { TrackDTO } from '../models'


/** Top-level scannable folder registered by the user. */
export interface LibraryRoot {
  readonly id:    string
  readonly label: string
}

/** Streaming events emitted while a scan runs. */
export type DataEvent =
  | { readonly type: 'batch'; readonly tracks: readonly TrackDTO[] } |
  { readonly type: 'done'; readonly totalCount: number } |
  { readonly type: 'error'; readonly message: string }

/** Subscriber for {@link DataEvent}s. Subscribe via {@link DataSource.subscribe}. */
export type DataListener = (e: DataEvent) => void

/** See module docstring. */
export interface DataSource {
  readonly addRoot:      () => Promise<string | null>
  readonly removeRoot:   (rootId: string) => Promise<void>
  readonly listRoots:    () => Promise<readonly LibraryRoot[]>
  readonly scan:         (rootIds: readonly string[]) => void
  readonly load:         () => Promise<readonly TrackDTO[]>
  readonly subscribe:    (l: DataListener) => () => void
  readonly readBytes:    (trackId: string) => Promise<ArrayBuffer>
  readonly readMetadata: (trackId: string) => Promise<AudioMetadata>
  readonly upsertTrack:  (track: TrackDTO) => Promise<void>
  readonly deleteTrack:  (trackId: string) => Promise<void>
}

export type { TrackDTO }

/** Audio file tags + technical metadata extracted on the host side. */
export interface AudioMetadata {
  title?:       string
  artist?:      string
  album?:       string
  year?:        number
  genre?:       string
  trackNumber?: number
  duration:     number
  format?:      string
  bitrate?:     number
  sampleRate?:  number
  channels?:    number
}
