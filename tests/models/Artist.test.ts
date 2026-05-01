import { describe, it, expect } from 'vitest'
import { Track } from '../../src/app/models/Track'
import { Artist, ArtistIndex } from '../../src/app/models/Artist'

describe('Artist model', () => {
  it('creates with name', () => {
    const artist = new Artist('Test Artist')
    expect(artist.name).toBe('Test Artist')
    expect(artist.trackCount).toBe(0)
  })

  it('counts tracks', () => {
    const artist = new Artist('Test Artist')
    artist.tracks.push(new Track('1'), new Track('2'))
    expect(artist.trackCount).toBe(2)
  })
})

describe('ArtistIndex', () => {
  it('adds tracks and groups by artist', () => {
    const index = new ArtistIndex()
    const track1 = new Track('1')
    track1.artist = 'Artist X'

    const track2 = new Track('2')
    track2.artist = 'Artist X'

    index.addTrack(track1)
    index.addTrack(track2)

    const artists = index.getArtists()
    expect(artists).toHaveLength(1)
    expect(artists[0].trackCount).toBe(2)
  })

  it('separates different artists', () => {
    const index = new ArtistIndex()
    const track1 = new Track('1')
    track1.artist = 'Artist A'

    const track2 = new Track('2')
    track2.artist = 'Artist B'

    index.addTrack(track1)
    index.addTrack(track2)

    expect(index.getArtists()).toHaveLength(2)
  })

  it('removes tracks', () => {
    const index = new ArtistIndex()
    const track = new Track('1')
    track.artist = 'Test Artist'

    index.addTrack(track)
    expect(index.getArtists()[0]?.trackCount).toBe(1)

    index.removeTrack(track)
    expect(index.getArtists()).toHaveLength(0)
  })

  it('gets artist by name', () => {
    const index = new ArtistIndex()
    const track = new Track('1')
    track.artist = 'My Artist'

    index.addTrack(track)

    const artist = index.getArtist('My Artist')
    expect(artist).toBeDefined()
    expect(artist?.name).toBe('My Artist')
  })

  it('sorts artists alphabetically', () => {
    const index = new ArtistIndex()
    const artists = ['Zebra', 'Artist', 'Bob']

    for (const name of artists) {
      const track = new Track(`track-${name}`)
      track.artist = name
      index.addTrack(track)
    }

    const sorted = index.getArtists()
    expect(sorted[0].name).toBe('Artist')
    expect(sorted[1].name).toBe('Bob')
    expect(sorted[2].name).toBe('Zebra')
  })
})
