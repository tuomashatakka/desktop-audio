import { Model } from './Model'
import type { TrackDTO } from '../services/types'

export class Track extends Model {
  private _title!: string
  private _artist!: string
  private _album!: string
  private _duration!: number
  private _format!: string
  private _size!: number
  private _coverColor!: string
  private _albumArt?: string
  private _year?: number
  private _genre?: string
  private _trackNumber?: number
  private _path!: string

  // Lazy waveform property
  #waveform: Float32Array | null = null
  #waveformLoading = false

  get title(): string { return this._title }
  set title(v: string) { if (this._title !== v) { this._title = v; this.markDirty() } }

  get artist(): string { return this._artist }
  set artist(v: string) { if (this._artist !== v) { this._artist = v; this.markDirty() } }

  get album(): string { return this._album }
  set album(v: string) { if (this._album !== v) { this._album = v; this.markDirty() } }

  get duration(): number { return this._duration }
  set duration(v: number) { if (this._duration !== v) { this._duration = v; this.markDirty() } }

  get format(): string { return this._format }
  set format(v: string) { if (this._format !== v) { this._format = v; this.markDirty() } }

  get size(): number { return this._size }
  set size(v: number) { if (this._size !== v) { this._size = v; this.markDirty() } }

  get coverColor(): string { return this._coverColor }
  set coverColor(v: string) { if (this._coverColor !== v) { this._coverColor = v; this.markDirty() } }

  get albumArt(): string | undefined { return this._albumArt }
  set albumArt(v: string | undefined) { if (this._albumArt !== v) { this._albumArt = v; this.markDirty() } }

  get year(): number | undefined { return this._year }
  set year(v: number | undefined) { if (this._year !== v) { this._year = v; this.markDirty() } }

  get genre(): string | undefined { return this._genre }
  set genre(v: string | undefined) { if (this._genre !== v) { this._genre = v; this.markDirty() } }

  get trackNumber(): number | undefined { return this._trackNumber }
  set trackNumber(v: number | undefined) { if (this._trackNumber !== v) { this._trackNumber = v; this.markDirty() } }

  get path(): string { return this._path }
  set path(v: string) { if (this._path !== v) { this._path = v; this.markDirty() } }

  get waveform(): Float32Array | null { return this.#waveform }
  set waveform(value: Float32Array | null) {
    this.#waveform = value
    this.dispatchEvent(new Event('waveform'))
  }

  get waveformLoading(): boolean { return this.#waveformLoading }
  set waveformLoading(value: boolean) {
    this.#waveformLoading = value
    this.dispatchEvent(new Event('waveform'))
  }

  static fromDTO(dto: TrackDTO): Track {
    const track = new Track(dto.id)
    track._title = dto.title
    track._artist = dto.artist
    track._album = dto.album
    track._duration = dto.duration
    track._format = dto.format
    track._size = dto.size
    track._coverColor = dto.coverColor
    track._albumArt = dto.albumArt
    track._year = dto.year
    track._genre = dto.genre
    track._trackNumber = dto.trackNumber
    track._path = dto.path
    return track
  }

  toDTO(): TrackDTO {
    return {
      id: this.id,
      title: this._title,
      artist: this._artist,
      album: this._album,
      duration: this._duration,
      format: this._format,
      size: this._size,
      coverColor: this._coverColor,
      albumArt: this._albumArt,
      year: this._year,
      genre: this._genre,
      trackNumber: this._trackNumber,
      path: this._path,
    }
  }
}
