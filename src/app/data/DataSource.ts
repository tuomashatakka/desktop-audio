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
import type { TrackAnalysis } from '../services/types'


/** Top-level scannable folder registered by the user. */
export interface LibraryRoot {
  readonly id:    string
  readonly label: string
}

/**
 * Streaming events emitted while a scan or a hydrate runs.
 *
 * `batch`/`done` belong to {@link DataSource.scan}; `hydrate-batch`/
 * `hydrate-done` to {@link DataSource.load}. They are deliberately distinct:
 * a scan's `done` prunes rows it did not rediscover, and a hydrate must never
 * feed that bookkeeping.
 */
export type DataEvent =
  | { readonly type: 'batch'; readonly tracks: readonly TrackDTO[] } |
  { readonly type: 'done'; readonly totalCount: number } |
  { readonly type: 'hydrate-batch'; readonly tracks: readonly TrackDTO[] } |
  { readonly type: 'hydrate-done'; readonly totalCount: number } |
  { readonly type: 'error'; readonly message: string }

/** Subscriber for {@link DataEvent}s. Subscribe via {@link DataSource.subscribe}. */
export type DataListener = (e: DataEvent) => void

/**
 * The disposal half of a subscription.
 *
 * Structural rather than `Disposable` from `disposable-events`, because
 * `DisposableCollection` carries the same `dispose()` contract without
 * extending `Disposable` — an implementation returns whichever fits.
 */
export interface Subscription {
  dispose (): void
}

/** See module docstring. */
export interface DataSource {
  readonly addRoot: () => Promise<string | null>
  readonly scan:    (rootIds: readonly string[]) => void

  /** Fire-and-forget, like {@link DataSource.scan}: rows arrive as events. */
  readonly load: () => void

  /**
   * Discard every persisted track under `roots` — folders the user removed.
   *
   * Phrased as "forget these roots" rather than "keep only the configured
   * ones" on purpose: the caller passes the roots it just saw *disappear*, so
   * an empty list is a no-op. The inverse phrasing reads current settings,
   * which hydrate asynchronously, and would wipe the library if it lost that
   * race.
   */
  readonly forgetRoots: (roots: readonly string[]) => Promise<void>

  /**
   * Discard an explicit set of tracks.
   *
   * The reconciliation half of {@link DataSource.forgetRoots}, for rows left
   * behind by a root removed before removal cleaned up after itself. Named ids
   * rather than "everything outside the configured roots", so no hydration
   * ordering can widen it.
   */
  readonly forgetTracks: (trackIds: readonly string[]) => Promise<void>

  /** Dispose the returned handle to unsubscribe — safe to call more than once. */
  readonly subscribe:    (l: DataListener) => Subscription
  readonly readBytes:    (trackId: string) => Promise<ArrayBuffer>
  readonly readMetadata: (trackId: string) => Promise<AudioMetadata>

  /** Resolve or read the persisted harmony analysis for one track. */
  readonly analyzeTrack: (trackId: string) => Promise<TrackAnalysis | null>

  readonly upsertTrack: (track: TrackDTO) => Promise<void>
  readonly deleteTrack: (trackId: string) => Promise<void>

  /**
   * One track's album art as a data URL, or `null` if it has none.
   *
   * Art is *not* part of {@link TrackDTO} on the streaming paths — the blobs
   * run to megabytes each and relaying them inline is what made a scan
   * unsurvivable. `'thumb'` is a downscale suitable for a list row; `'full'`
   * is the stored image, for the player and the tag editor.
   */
  readonly readArtwork: (trackId: string, size?: ArtworkSize) => Promise<string | null>
}

/** See {@link DataSource.readArtwork}. */
export type ArtworkSize = 'thumb' | 'full'

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
