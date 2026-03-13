export interface Track {
  readonly id:       string
  readonly path:     string
  readonly title:    string
  readonly artist:   string
  readonly album:    string
  readonly duration: number
  readonly format:   string
  readonly albumArt?: string
  readonly year?:    number
  readonly genre?:   string
}

export interface FolderNode {
  readonly id:       string
  readonly name:     string
  readonly path:     string
  readonly children: readonly FolderNode[]
  readonly expanded: boolean
}

export interface AudioMetadata {
  readonly title?:    string
  readonly artist?:   string
  readonly album?:    string
  readonly duration?: number
  readonly format?:   string
  readonly albumArt?: string
  readonly year?:    number
  readonly genre?:   string
}
