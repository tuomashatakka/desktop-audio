import { Track } from './Track'


export class Album {
  readonly title:       string
  readonly artist:      string
  readonly year?:       number
  readonly coverColor?: string
  readonly albumArt?:   string
  tracks:               Track[] = []

  constructor (title: string, artist: string, year?: number, coverColor?: string, albumArt?: string) {
    this.title = title
    this.artist = artist
    this.year = year
    this.coverColor = coverColor
    this.albumArt = albumArt
  }

  get duration (): number {
    return this.tracks.reduce((sum, t) =>
      sum + t.duration, 0)
  }

  get trackCount (): number {
    return this.tracks.length
  }
}

export class AlbumIndex {
  readonly #albums = new Map<string, Album>()

  addTrack (track: Track): void {
    const key = `${track.album}\x00${track.artist}`
    const album = this.#albums.get(key)
    if (!album) {
      const newAlbum = new Album(track.album, track.artist, track.year, track.coverColor, track.albumArt)
      this.#albums.set(key, newAlbum)
    }
    if (!album.tracks.includes(track))
      album.tracks.push(track)
  }

  removeTrack (track: Track): void {
    const key = `${track.album}\x00${track.artist}`
    const album = this.#albums.get(key)
    if (album) {
      album.tracks = album.tracks.filter(t =>
        t.id !== track.id)
      if (album.tracks.length === 0)
        this.#albums.delete(key)
    }
  }

  getAlbums (): Album[] {
    return Array.from(this.#albums.values()).sort((a, b) =>
      a.title.localeCompare(b.title))
  }

  getAlbum (title: string, artist: string): Album | undefined {
    return this.#albums.get(`${title}\x00${artist}`)
  }

  clear (): void {
    this.#albums.clear()
  }
}
