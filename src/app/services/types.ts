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
  'bolt' |
  'chevron-right' |
  'clock' |
  'close' |
  'density-compact' |
  'density-normal' |
  'density-relaxed' |
  'disc' |
  'dsp' |
  'edit' |
  'folder' |
  'grid-lg' |
  'grid-sm' |
  'headphones' |
  'heart' |
  'library' |
  'list' |
  'lyrics' |
  'maximize' |
  'menu' |
  'microphone' |
  'minimize' |
  'music' |
  'next' |
  'pause' |
  'play' |
  'previous' |
  'queue' |
  'repeat' |
  'search' |
  'settings' |
  'shuffle' |
  'spectrum' |
  'star' |
  'trash' |
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

/** One fitted pulse on the analyzer's steady musical grid. */
export interface BeatMarker {
  readonly time:     number
  readonly strength: number
  readonly source:   'section' | 'beat' | 'transient'
  readonly downbeat: boolean
  readonly bar:      number
  readonly beat:     number
}

/** A contiguous beat-synchronous chord region. */
export interface ChordSegment {
  readonly start:      number
  readonly end:        number
  readonly label:      string
  readonly confidence: number
  readonly notes:      readonly number[]
}

export interface TempoEstimate {
  readonly bpm:        number
  readonly confidence: number
}

export interface KeyEstimate {
  readonly tonic:      string
  readonly scale:      'major' | 'minor' | 'unknown'
  readonly label:      string
  readonly confidence: number
}

/** Compact result persisted by the background harmony analyzer. */
export interface TrackAnalysis {
  readonly version:  number
  readonly duration: number
  readonly tempo:    TempoEstimate
  readonly key:      KeyEstimate
  readonly beats:    readonly BeatMarker[]
  readonly chords:   readonly ChordSegment[]
  readonly engine?:  {
    readonly audio?:           string
    readonly theory?:          string
    readonly analysisSeconds?: number
  }
  readonly warnings: readonly string[]
}

/**
 * The editable subset of {@link TrackFields}, in display order.
 *
 * `primary` is what the tag editor shows up front; `extended` lives behind a
 * disclosure. Order here *is* the order on screen, so this list is the one
 * place to reorder or regroup the form.
 */
export const PRIMARY_TAG_FIELDS = [
  'title', 'artist', 'album', 'albumArtist', 'year', 'genre', 'trackNumber',
  'rating',
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

/**
 * The icons a playlist may be given, in the order the picker offers them.
 *
 * A closed set rather than the whole {@link IconName} vocabulary: most of that
 * vocabulary names a control (`pause`, `minimize`, `settings`), and a playlist
 * wearing one of those reads as a button rather than as a list.
 */
export const PLAYLIST_ICONS = [
  'music', 'heart', 'star', 'disc', 'list', 'headphones', 'microphone',
  'bolt', 'clock', 'folder',
] as const

export type PlaylistIcon = typeof PLAYLIST_ICONS[number]

export const DEFAULT_PLAYLIST_ICON: PlaylistIcon = 'music'

/**
 * A user-curated ordered list of tracks.
 *
 * `trackIds` is the stored membership — a track's id is its path, so it
 * survives a rescan — and `tracks` is that list resolved against the library
 * currently in memory. A playlist entry whose file is no longer scanned simply
 * does not resolve; the id stays, so re-adding the folder brings it back.
 */
export interface StoredPlaylist {
  readonly id:   string
  readonly name: string
  readonly icon: PlaylistIcon

  /** The {@link PlaylistFolder} this playlist sits in; `null` at the root. */
  readonly folderId: string | null
  readonly trackIds: readonly string[]
}

export interface Playlist extends StoredPlaylist {
  readonly tracks: readonly Track[]
}

/** A container for playlists in the sidebar. Folders may nest. */
export interface PlaylistFolder {
  readonly id:       string
  readonly name:     string
  readonly icon:     PlaylistIcon
  readonly parentId: string | null
  readonly expanded: boolean
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
