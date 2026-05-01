import { Model } from './Model'
import { Track } from './Track'
import { FolderEntry } from './FolderEntry'
import { AlbumIndex, Album } from './Album'
import { ArtistIndex, Artist } from './Artist'

export class ModelRegistry {
  readonly tracks = new Map<string, Track>()
  readonly folders = new Map<string, FolderEntry>()
  readonly albums = new AlbumIndex()
  readonly artists = new ArtistIndex()

  addTrack(track: Track): void {
    this.tracks.set(track.id, track)
    this.albums.addTrack(track)
    this.artists.addTrack(track)
  }

  removeTrack(id: string): void {
    const track = this.tracks.get(id)
    if (track) {
      this.albums.removeTrack(track)
      this.artists.removeTrack(track)
      this.tracks.delete(id)
    }
  }

  getTrack(id: string): Track | undefined {
    return this.tracks.get(id)
  }

  getAllTracks(): Track[] {
    return Array.from(this.tracks.values())
  }

  addFolder(entry: FolderEntry): void {
    this.folders.set(entry.id, entry)
  }

  removeFolder(id: string): void {
    this.folders.delete(id)
  }

  getFolder(id: string): FolderEntry | undefined {
    return this.folders.get(id)
  }

  getAlbums(): Album[] {
    return this.albums.getAlbums()
  }

  getArtists(): Artist[] {
    return this.artists.getArtists()
  }

  clear(): void {
    this.tracks.clear()
    this.folders.clear()
    this.albums.clear()
    this.artists.clear()
  }

  static fromDTOs(trackDTOs: { id: string; title: string; artist: string; album: string; duration: number; format: string; size: number; coverColor: string; albumArt?: string; year?: number; genre?: string; trackNumber?: number; path: string }[]): ModelRegistry {
    const registry = new ModelRegistry()
    for (const dto of trackDTOs) {
      const track = Track.fromDTO(dto)
      registry.addTrack(track)
    }
    return registry
  }
}
