/**
 * Shared data shapes that cross the host/renderer boundary.
 *
 * These are plain serializable interfaces — no methods, no class instances —
 * so they survive `structuredClone` over IPC. Domain behavior lives on the
 * model classes in `../models`.
 */

/**
 * Every tag field the app stores for a track, in mutable form.
 *
 * The field names are the camelCase of the `tracks` columns declared in
 * `src/track-schema.ts` — that file is the source of truth for the storage
 * side, this one for the type side. Adding a tag means touching both.
 *
 * Most consumers want the frozen view: see {@link Track}.
 */
export type IconName =
  | 'add' |
  'chevron-right' |
  'close' |
  'density-compact' |
  'density-normal' |
  'density-relaxed' |
  'edit' |
  'library' |
  'lyrics' |
  'maximize' |
  'menu' |
  'minimize' |
  'music' |
  'next' |
  'pause' |
  'play' |
  'previous' |
  'repeat' |
  'search' |
  'settings' |
  'shuffle' |
  'waveform'

export interface TrackFields {
  id:           string
  path:         string
  title:        string
  artist:       string
  album:        string
  duration:     number
  format:       string
  size:         number
  coverColor:   string
  albumArt?:    string
  year?:        number
  genre?:       string
  trackNumber?: number
  rating?:      number

  /* Extended tags — everything below is optional and often absent. */
  albumArtist?: string
  composer?:    string
  trackTotal?:  number
  discNumber?:  number
  discTotal?:   number
  bpm?:         number
  comment?:     string
  lyrics?:      string
  publisher?:   string
  copyright?:   string
  isrc?:        string
  encodedBy?:   string
  language?:    string
  mood?:        string
  grouping?:    string

  /* Technical properties, read from the stream rather than the tags. */
  bitrate?:    number
  sampleRate?: number
  channels?:   number
}

/** Serialized track metadata as it travels over IPC and persists in SQLite/IDB. */
export type Track = {readonly [K in keyof TrackFields]: TrackFields[K] }

export type TrackDTO = Track

/**
 * The editable subset of {@link TrackFields}, in display order.
 *
 * `primary` is what the tag editor shows up front; `extended` lives behind a
 * disclosure. Order here *is* the order on screen, so this list is the one
 * place to reorder or regroup the form.
 */
export const PRIMARY_TAG_FIELDS = [
  'title', 'artist', 'album', 'albumArtist', 'year', 'genre', 'trackNumber',
] as const

export const EXTENDED_TAG_FIELDS = [
  'composer', 'trackTotal', 'discNumber', 'discTotal', 'bpm', 'publisher',
  'copyright', 'isrc', 'encodedBy', 'language', 'mood', 'grouping',
  'comment', 'lyrics',
] as const

export type TagField = typeof PRIMARY_TAG_FIELDS[number] | typeof EXTENDED_TAG_FIELDS[number]

/** Serialized folder tree node returned by the scanner. */
export interface FolderNode {
  readonly id:       string
  readonly name:     string
  readonly path:     string
  readonly children: readonly FolderNode[]
  readonly expanded: boolean
}

/** A user-curated ordered list of tracks. */
export interface Playlist {
  readonly id:     string
  readonly name:   string
  readonly tracks: readonly Track[]
}

export interface AudioMetadata {
  readonly title?:    string
  readonly artist?:   string
  readonly album?:    string
  readonly duration?: number
  readonly format?:   string
  readonly albumArt?: string
  readonly year?:     number
  readonly genre?:    string
}

export interface ContextMenuPoint {
  readonly x: number
  readonly y: number
}

/** Plain-object form of a context-menu item that can ride IPC to the menu window. */
export interface SerializableMenuItem {
  readonly label?:     string
  readonly icon?:      IconName
  readonly danger?:    boolean
  readonly separator?: boolean
}

/**
 * What the standalone context-menu window receives when it is asked to show.
 *
 * It renders in a separate BrowserWindow with its own document, so it can't
 * inherit the app's `data-theme` or accent — both travel with the items.
 */
export interface ContextMenuPayload {
  readonly items:   readonly SerializableMenuItem[]
  readonly theme:   string
  readonly accent?: string
}

/** Snapshot pushed to the OS media session (MPRIS / SMTC / NowPlaying). */
export interface MediaState {
  readonly title:     string
  readonly artist:    string
  readonly album:     string
  readonly albumArt?: string
  readonly isPlaying: boolean
  readonly position:  number
  readonly duration:  number
}
