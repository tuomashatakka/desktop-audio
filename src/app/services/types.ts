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

export interface FolderNode {
  readonly id:       string
  readonly name:     string
  readonly path:     string
  readonly children: readonly FolderNode[]
  readonly expanded: boolean
}

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
