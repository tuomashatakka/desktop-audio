import { describe, it, expect } from 'vitest'
import { Track } from '../../src/app/models/Track'
import { Album, AlbumIndex } from '../../src/app/models/Album'

describe('Album model', () => {
  it('creates with title and artist', () => {
    const album = new Album('Test Album', 'Test Artist', 2024, '#ff0000', 'art-url')
    expect(album.title).toBe('Test Album')
    expect(album.artist).toBe('Test Artist')
    expect(album.year).toBe(2024)
    expect(album.coverColor).toBe('#ff0000')
    expect(album.albumArt).toBe('art-url')
  })

  it('calculates duration from tracks', () => {
    const album = new Album('Test Album', 'Test Artist')
    const track1 = new Track('1')
    track1.duration = 180
    const track2 = new Track('2')
    track2.duration = 240

    album.tracks.push(track1, track2)
    expect(album.duration).toBe(420)
  })

  it('counts tracks', () => {
    const album = new Album('Test Album', 'Test Artist')
    expect(album.trackCount).toBe(0)

    album.tracks.push(new Track('1'), new Track('2'))
    expect(album.trackCount).toBe(2)
  })
})

describe('AlbumIndex', () => {
  it('adds tracks and groups by album+artist', () => {
    const index = new AlbumIndex()
    const track1 = new Track('1')
    track1.album = 'Album A'
    track1.artist = 'Artist X'

    const track2 = new Track('2')
    track2.album = 'Album A'
    track2.artist = 'Artist X'

    index.addTrack(track1)
    index.addTrack(track2)

    const albums = index.getAlbums()
    expect(albums).toHaveLength(1)
    expect(albums[0].trackCount).toBe(2)
  })

  it('separates different albums', () => {
    const index = new AlbumIndex()
    const track1 = new Track('1')
    track1.album = 'Album A'
    track1.artist = 'Artist X'

    const track2 = new Track('2')
    track2.album = 'Album B'
    track2.artist = 'Artist X'

    index.addTrack(track1)
    index.addTrack(track2)

    expect(index.getAlbums()).toHaveLength(2)
  })

  it('removes tracks', () => {
    const index = new AlbumIndex()
    const track1 = new Track('1')
    track1.album = 'Album A'
    track1.artist = 'Artist X'

    index.addTrack(track1)
    expect(index.getAlbums()[0]?.trackCount).toBe(1)

    index.removeTrack(track1)
    expect(index.getAlbums()).toHaveLength(0)
  })

  it('gets album by title and artist', () => {
    const index = new AlbumIndex()
    const track = new Track('1')
    track.album = 'My Album'
    track.artist = 'My Artist'

    index.addTrack(track)

    const album = index.getAlbum('My Album', 'My Artist')
    expect(album).toBeDefined()
    expect(album?.title).toBe('My Album')
  })
})
