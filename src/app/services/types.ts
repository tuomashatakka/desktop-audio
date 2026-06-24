/**
 * Shared data shapes that cross the host/renderer boundary.
 *
 * These are plain serializable interfaces — no methods, no class instances —
 * so they survive `structuredClone` over IPC. Domain behavior lives on the
 * model classes in `../models`.
 */

/** Serialized track metadata as it travels over IPC and persists in SQLite/IDB. */
export interface Track {
  readonly id:           string
  readonly path:         string
  readonly title:        string
  readonly artist:       string
  readonly album:        string
  readonly duration:     number
  readonly format:       string
  readonly size:         number
  readonly coverColor:   string
  readonly albumArt?:    string
  readonly year?:        number
  readonly genre?:       string
  readonly trackNumber?: number
}

export type TrackDTO = Track

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

/** Plain-object form of a context-menu item that can ride IPC to the menu window. */
export interface SerializableMenuItem {
  readonly label?:     string
  readonly icon?:      string
  readonly danger?:    boolean
  readonly separator?: boolean
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
