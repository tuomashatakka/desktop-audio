import { describe, expect, it } from 'vitest'
import {
  DND_MIME,
  hasDragPayload,
  isMediaDrag,
  readDragPayload,
  setDragPayload,
  tracksForPayload,
} from '../../src/app/utils/dnd'
import type { DragPayload } from '../../src/app/utils/dnd'
import { Track } from '../../src/app/models'


/** The `DataTransfer` half of a drag, without jsdom's partial implementation. */
function fakeTransfer () {
  const data = new Map<string, string>()
  return {
    effectAllowed: 'none',
    dropEffect:    'none',
    get types () {
      return [ ...data.keys() ]
    },
    setData (type: string, value: string) {
      data.set(type, value)
    },
    getData (type: string) {
      return data.get(type) ?? ''
    },
  } as unknown as DataTransfer
}

function track (id: string, path: string, artist = 'Artist', album = 'Album'): Track {
  return Track.fromDTO({
    id,
    path,
    title:      id,
    artist,
    album,
    duration:   100,
    format:     'mp3',
    size:       1,
    coverColor: '#000',
  })
}

const library = [
  track('a', '/music/rock/one.mp3', 'Xylo', 'Loud'),
  track('b', '/music/rock/live/two.mp3', 'Xylo', 'Loud'),
  track('c', '/music/jazz/three.mp3', 'Yarrow', 'Quiet'),
  track('d', '/music/rock-b-sides/four.mp3', 'Xylo', 'Quiet'),
]

describe('drag payloads', () => {
  it('round-trips through a DataTransfer under its own MIME type', () => {
    const transfer = fakeTransfer()
    const payload: DragPayload = { kind: 'tracks', trackIds: [ 'a', 'b' ], label: '2 tracks' }

    setDragPayload(transfer, payload)

    expect(hasDragPayload(transfer)).toBe(true)
    expect(transfer.types).toContain(DND_MIME)
    expect(readDragPayload(transfer)).toEqual(payload)

    // The plain-text copy is what a drop outside the app receives.
    expect(transfer.getData('text/plain')).toBe('2 tracks')
  })

  it('does not claim a foreign drag', () => {
    const transfer = fakeTransfer()
    transfer.setData('text/plain', 'hello')

    expect(hasDragPayload(transfer)).toBe(false)
    expect(readDragPayload(transfer)).toBeNull()
  })

  it('survives a payload that is not JSON', () => {
    const transfer = fakeTransfer()
    transfer.setData(DND_MIME, '{ not json')

    expect(readDragPayload(transfer)).toBeNull()
  })

  it('separates the kinds that resolve to tracks from the filing moves', () => {
    expect(isMediaDrag({ kind: 'folder', path: '/music', label: 'music' })).toBe(true)
    expect(isMediaDrag({ kind: 'playlist', id: 'p1', label: 'Mix' })).toBe(false)
    expect(isMediaDrag({ kind: 'playlist-folder', id: 'f1', label: 'Sets' })).toBe(false)
  })
})

describe('tracksForPayload', () => {
  it('resolves ids in library order, not in the order they were dragged', () => {
    const resolved = tracksForPayload(
      { kind: 'tracks', trackIds: [ 'c', 'a' ], label: '2 tracks' },
      library
    )

    expect(resolved.map(t =>
      t.id)).toEqual([ 'a', 'c' ])
  })

  it('takes a folder with its subfolders, and not its prefix-sharing sibling', () => {
    const resolved = tracksForPayload(
      { kind: 'folder', path: '/music/rock', label: 'rock' },
      library
    )

    // '/music/rock-b-sides' shares the prefix but is a different folder.
    expect(resolved.map(t =>
      t.id)).toEqual([ 'a', 'b' ])
  })

  it('matches a folder written with the other separator', () => {
    const resolved = tracksForPayload(
      { kind: 'folder', path: '\\music\\jazz', label: 'jazz' },
      library
    )

    expect(resolved.map(t =>
      t.id)).toEqual([ 'c' ])
  })

  it('resolves a bucket by the same key the grid drilled in with', () => {
    const resolved = tracksForPayload(
      { kind: 'group', grouping: 'artist', key: 'Yarrow', label: 'Yarrow' },
      library
    )

    expect(resolved.map(t =>
      t.id)).toEqual([ 'c' ])
  })

  it('resolves nothing for a filing move', () => {
    expect(tracksForPayload({ kind: 'playlist', id: 'p1', label: 'Mix' }, library)).toEqual([])
  })
})
