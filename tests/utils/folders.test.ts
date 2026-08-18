import { describe, expect, it } from 'vitest'
import { findFolder, subfolderRows } from '../../src/app/utils/folders'
import { FolderEntry, Track } from '../../src/app/models'


function folder (name: string, path: string, children: FolderEntry[] = []): FolderEntry {
  return FolderEntry.fromFolderNode({ id: path, name, path, children, expanded: true })
}

function track (path: string): Track {
  return Track.fromDTO({
    id:         path,
    path,
    title:      path,
    artist:     'Artist',
    album:      'Album',
    duration:   1,
    format:     'mp3',
    size:       1,
    coverColor: '#000',
  })
}

const tree = [
  folder('Music', '/music', [
    folder('Rock', '/music/rock', [ folder('Live', '/music/rock/live') ]),
    folder('Jazz', '/music/jazz'),
  ]),
]

const tracks = [
  track('/music/top.mp3'),
  track('/music/rock/one.mp3'),
  track('/music/rock/live/two.mp3'),
  track('/music/jazz/three.mp3'),
]

describe('findFolder', () => {
  it('finds a node at any depth', () => {
    expect(findFolder(tree, '/music/rock/live')?.name).toBe('Live')
  })

  it('is null for a path the scan never produced', () => {
    expect(findFolder(tree, '/elsewhere')).toBeNull()
  })
})

describe('subfolderRows', () => {
  it('lists the roots when nothing is selected', () => {
    expect(subfolderRows(tree, null, tracks)).toEqual([
      { path: '/music', name: 'Music', trackCount: 4 },
    ])
  })

  it('lists the selected folder\'s immediate children', () => {
    expect(subfolderRows(tree, '/music', tracks)).toEqual([
      { path: '/music/rock', name: 'Rock', trackCount: 2 },
      { path: '/music/jazz', name: 'Jazz', trackCount: 1 },
    ])
  })

  it('counts everything under a child, subfolders included', () => {
    // '/music/rock' holds one file directly and one inside 'Live'.
    const [ rock ] = subfolderRows(tree, '/music', tracks)
    expect(rock.trackCount).toBe(2)
  })

  it('has no rows for a leaf folder', () => {
    expect(subfolderRows(tree, '/music/jazz', tracks)).toEqual([])
  })

  it('has no rows for a location that is not in the tree', () => {
    expect(subfolderRows(tree, '/elsewhere', tracks)).toEqual([])
  })
})
