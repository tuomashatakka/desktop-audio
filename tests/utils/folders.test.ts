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

/*
 * The counts used to come from a `countUnder` helper called once per child —
 * O(children × tracks), and the memo it sits in is invalidated by every folder
 * selection. These pin the behaviour the single-pass rewrite has to preserve.
 */
describe('subfolderRows counting', () => {
  it('counts everything under a child, subfolders included', () => {
    const rows = subfolderRows(tree, '/music', tracks)

    expect(rows.map(row =>
      [ row.name, row.trackCount ])).toEqual([ [ 'Rock', 2 ], [ 'Jazz', 1 ] ])
  })

  // `/music/top.mp3` sits in the parent, not in any child.
  it('does not attribute a parent-level track to any child', () => {
    const total = subfolderRows(tree, '/music', tracks)
      .reduce((sum, row) =>
        sum + row.trackCount, 0)

    expect(total).toBe(tracks.length - 1)
  })

  it('reports zero for a folder holding nothing', () => {
    const rows = subfolderRows(tree, '/music', [ track('/music/rock/one.mp3') ])

    expect(rows.find(row =>
      row.name === 'Jazz')?.trackCount).toBe(0)
  })

  /*
   * One name being a prefix of another is what makes the separator part of the
   * comparison load-bearing: `/music/rock` alone would claim
   * `/music/rock-live/…`, and the single-pass version assigns each track to one
   * bucket and stops, so a wrong match is a lost track rather than a double
   * count.
   */
  it('does not let a shorter sibling name swallow a longer one', () => {
    const siblings = [
      folder('Music', '/music', [
        folder('Rock', '/music/rock'),
        folder('Rock Live', '/music/rock-live'),
      ]),
    ]

    const rows = subfolderRows(siblings, '/music', [
      track('/music/rock/a.mp3'),
      track('/music/rock-live/b.mp3'),
      track('/music/rock-live/c.mp3'),
    ])

    expect(rows.map(row =>
      [ row.name, row.trackCount ])).toEqual([ [ 'Rock', 1 ], [ 'Rock Live', 2 ] ])
  })

  it('counts the roots when nothing is selected', () => {
    expect(subfolderRows(tree, null, tracks)).toEqual([
      { path: '/music', name: 'Music', trackCount: 4 },
    ])
  })
})

