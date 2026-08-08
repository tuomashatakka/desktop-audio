import { describe, it, expect, vi } from 'vitest'
import { Track } from '../../src/app/models/Track'
import type { TrackDTO } from '../../src/app/services/types'

describe('Track model', () => {
  it('creates from DTO', () => {
    const dto: TrackDTO = {
      id: 'track-1',
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 180,
      format: 'mp3',
      size: 5000000,
      coverColor: '#ff0000',
    }

    const track = Track.fromDTO(dto)

    expect(track.id).toBe('track-1')
    expect(track.title).toBe('Test Track')
    expect(track.artist).toBe('Test Artist')
    expect(track.album).toBe('Test Album')
    expect(track.duration).toBe(180)
  })

  it('converts to DTO', () => {
    const track = new Track('track-1')
    track.title = 'Test Track'
    track.artist = 'Test Artist'
    track.album = 'Test Album'
    track.duration = 180
    track.format = 'mp3'
    track.size = 5000000
    track.coverColor = '#ff0000'

    const dto = track.toDTO()

    expect(dto.id).toBe('track-1')
    expect(dto.title).toBe('Test Track')
    expect(dto.artist).toBe('Test Artist')
  })

  it('marks dirty when property changes', () => {
    const track = new Track('track-1')
    track.title = 'Initial'

    expect(track.dirty).toBe(true)

    track.flush()

    expect(track.dirty).toBe(false)

    track.title = 'Changed'
    expect(track.dirty).toBe(true)
  })

  it('has lazy waveform property', () => {
    const track = new Track('track-1')
    expect(track.waveform).toBeNull()
    expect(track.waveformLoading).toBe(false)

    const waveform = new Float32Array([0.1, 0.2, 0.3])
    track.waveform = waveform
    expect(track.waveform).toBe(waveform)
  })

  it('emits waveform event on change', () => {
    const track = new Track('track-1')
    const handler = vi.fn()
    track.addEventListener('waveform', handler)

    track.waveform = new Float32Array([0.1])
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('marks dirty when property changes', () => {
    const track = new Track('track-1')
    const dirtyHandler = vi.fn()
    track.addEventListener('dirty', dirtyHandler)

    track.title = 'Initial'

    expect(track.dirty).toBe(true)
    expect(dirtyHandler).toHaveBeenCalledWith('dirty')

    track.flush()

    expect(track.dirty).toBe(false)

    track.title = 'Changed'
    expect(track.dirty).toBe(true)
  })

  /*
   * The renderer's half of the "never write a column you did not carry" rule.
   * Track lists arrive without `albumArt` — it is fetched per track — so a
   * `toDTO()` that emitted every field would send `albumArt: undefined` on
   * every save and the writer would dutifully NULL the column.
   */
  describe('round-tripping a DTO that omits fields', () => {
    const listDto = {
      id:         'track-1',
      title:      'Test Track',
      artist:     'Test Artist',
      album:      'Test Album',
      duration:   180,
      format:     'mp3',
      size:       5000000,
      coverColor: '#ff0000',
    } as TrackDTO

    it('does not invent fields the DTO never carried', () => {
      const dto = Track.fromDTO(listDto).toDTO()

      expect(Object.hasOwn(dto, 'albumArt')).toBe(false)
      expect(Object.hasOwn(dto, 'genre')).toBe(false)
      expect(dto.title).toBe('Test Track')
    })

    it('carries a field once it is assigned', () => {
      const track = Track.fromDTO(listDto)
      track.albumArt = 'data:image/png;base64,x'

      expect(Object.hasOwn(track.toDTO(), 'albumArt')).toBe(true)
    })

    it('reports a cleared field, but not a clear of something never held', () => {
      const carried = Track.fromDTO({ ...listDto, genre: 'Jazz' } as TrackDTO)
      carried.genre = undefined
      // Present-and-undefined: the writer turns this into `genre = NULL`.
      expect(Object.hasOwn(carried.toDTO(), 'genre')).toBe(true)

      const absent = Track.fromDTO(listDto)
      absent.genre = undefined
      expect(Object.hasOwn(absent.toDTO(), 'genre')).toBe(false)
    })
  })
})
