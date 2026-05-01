import { Track } from './Track'
import { Album } from './Album'


export class Artist {
  readonly name: string
  albums:        Album[] = []
  tracks:        Track[] = []

  constructor (name: string) {
    this.name = name
  }

  get trackCount (): number {
    return this.tracks.length
  }
}

export class ArtistIndex {
  readonly #artists = new Map<string, Artist>()

  addTrack (track: Track): void {
    const artist = this.#artists.get(track.artist)
    if (!artist) {
      const newArtist = new Artist(track.artist)
      this.#artists.set(track.artist, newArtist)
    }
    if (!artist.tracks.includes(track))
      artist.tracks.push(track)
  }

  removeTrack (track: Track): void {
    const artist = this.#artists.get(track.artist)
    if (artist) {
      artist.tracks = artist.tracks.filter(t =>
        t.id !== track.id)
      if (artist.tracks.length === 0)
        this.#artists.delete(track.artist)
    }
  }

  getArtists (): Artist[] {
    return Array.from(this.#artists.values()).sort((a, b) =>
      a.name.localeCompare(b.name))
  }

  getArtist (name: string): Artist | undefined {
    return this.#artists.get(name)
  }

  clear (): void {
    this.#artists.clear()
  }
}
