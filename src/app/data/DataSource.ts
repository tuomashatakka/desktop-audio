// DataSource.ts - Interface for data access layer
// Separates data operations from host operations (window controls, media keys, etc.)

import type { TrackDTO } from '../models'

export interface LibraryRoot {
  readonly id: string
  readonly label: string
}

export type DataEvent =
  | { readonly type: 'batch'; readonly tracks: readonly TrackDTO[] }
  | { readonly type: 'done'; readonly totalCount: number }
  | { readonly type: 'error'; readonly message: string }

export type DataListener = (e: DataEvent) => void

export interface DataSource {
  readonly addRoot:       () => Promise<string | null>
  readonly removeRoot:    (rootId: string) => Promise<void>
  readonly listRoots:     () => Promise<readonly LibraryRoot[]>
  readonly scan:          (rootIds: readonly string[]) => void
  readonly load:          () => Promise<readonly TrackDTO[]>
  readonly subscribe:     (l: DataListener) => () => void
  readonly readBytes:     (trackId: string) => Promise<ArrayBuffer>
  readonly readMetadata:  (trackId: string) => Promise<AudioMetadata>
  readonly upsertTrack:   (track: TrackDTO) => Promise<void>
  readonly deleteTrack:   (trackId: string) => Promise<void>
}

export type { TrackDTO }

export interface AudioMetadata {
  title?:     string
  artist?:    string
  album?:     string
  year?:      number
  genre?:     string
  trackNumber?: number
  duration:   number
  format?:    string
  bitrate?:   number
  sampleRate?: number
  channels?:  number
}
