import { Model } from './Model'
import type { TrackDTO, TrackFields } from '../services/types'


/**
 * Every persisted field, in DTO order. The accessors below are generated from
 * this list rather than written out: with thirty-odd tag fields, hand-rolled
 * getter/setter pairs are a hundred lines of identical code and a guaranteed
 * place for a typo to hide.
 */
const FIELDS = [
  'path', 'title', 'artist', 'album', 'duration', 'format', 'size',
  'coverColor', 'albumArt', 'year', 'genre', 'trackNumber', 'rating',
  'albumArtist', 'composer', 'trackTotal', 'discNumber', 'discTotal', 'bpm',
  'comment', 'lyrics', 'publisher', 'copyright', 'isrc', 'encodedBy',
  'language', 'mood', 'grouping', 'bitrate', 'sampleRate', 'channels',
] as const satisfies readonly Exclude<keyof TrackFields, 'id'>[]

type Field = typeof FIELDS[number]

/**
 * Declares the generated accessors to the type system. See {@link FIELDS}.
 *
 * Merging an interface into the class is the point here, not an accident:
 * the accessors are installed on the prototype at module load, so this is the
 * only way to tell the compiler about properties it can't see being defined.
 */
/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Track extends Omit<TrackFields, 'id'> {}

/**
 * A single audio file in the library.
 *
 * Wraps the metadata stored in the DB (title, artist, album, duration, the
 * full tag set, etc.) with dirty-tracking setters and a lazy-loaded waveform
 * cache. Convert to/from the DTO used over IPC via {@link Track.fromDTO} and
 * {@link Track#toDTO}.
 *
 * Assigning any tag field marks the model dirty, which schedules a debounced
 * write through {@link Model#flush} — that is how the tag editor persists.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Track extends Model {
  // Lazy waveform property
  #waveform: Float32Array | null = null
  #waveformLoading = false

  get waveform (): Float32Array | null {
    return this.#waveform
  }

  set waveform (value: Float32Array | null) {
    this.#waveform = value
    this.dispatchEvent('waveform')
  }

  get waveformLoading (): boolean {
    return this.#waveformLoading
  }

  set waveformLoading (value: boolean) {
    this.#waveformLoading = value
    this.dispatchEvent('waveform')
  }

  /** Hydrates without marking dirty — a fresh read is not a pending write. */
  static fromDTO (dto: TrackDTO): Track {
    const track = new Track(dto.id)
    const store = track as unknown as Record<string, unknown>
    for (const field of FIELDS)
      store[`_${field}`] = dto[field]
    return track
  }

  toDTO (): TrackDTO {
    const source = this as unknown as Record<Field, unknown>
    const dto: Record<string, unknown> = { id: this.id }
    for (const field of FIELDS)
      dto[field] = source[field]
    return dto as unknown as TrackDTO
  }

  /**
   * The persisted payload is exactly the DTO. `Model#toJSON` would otherwise
   * reflect over *every* getter and sweep the decoded waveform into it, which
   * is neither a column nor something worth pushing across IPC on each edit.
   */
  override toJSON (): Record<string, unknown> {
    return this.toDTO() as unknown as Record<string, unknown>
  }
}

// Backing values live on `_`-prefixed own properties, which `Model#toJSON`
// skips — it serializes through the prototype getters instead, so the payload
// that reaches the database is the public shape and nothing else.
for (const field of FIELDS) {
  const backing = `_${field}`

  Object.defineProperty(Track.prototype, field, {
    configurable: true,
    enumerable:   false,

    get (this: Record<string, unknown>) {
      return this[backing]
    },

    set (this: Record<string, unknown> & { markDirty (): void }, value: unknown) {
      if (this[backing] === value)
        return
      this[backing] = value
      this.markDirty()
    },
  })
}
