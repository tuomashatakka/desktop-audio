import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FolderTree } from '../../src/app/components/composite/FolderTree'
import { LibraryProvider, useLibrary } from '../../src/app/contexts/LibraryContext'
import { FolderEntry, Track } from '../../src/app/models'


function folder (
  id: string,
  name: string,
  path: string,
  children: FolderEntry[] = [],
  expanded = false
): FolderEntry {
  return FolderEntry.fromFolderNode({ id, name, path, children, expanded })
}

const grandchild = folder('grandchild', 'Grandchild', '/music/child/grandchild')
const child = folder('child', 'Child', '/music/child', [ grandchild ])
const root = folder('root', 'Music', '/music', [ child ], true)

function FolderHarness () {
  const { folders, setFolders, toggleFolder } = useLibrary()

  useEffect(() => {
    setFolders([ root ])
  }, [ setFolders ])

  return (
    <FolderTree
      folders={folders}
      selectedPath={null}
      onSelect={() => {}}
      onToggle={toggleFolder}
    />
  )
}

const track = Track.fromDTO({
  id:         'track-1',
  title:      'Original title',
  artist:     'Artist',
  album:      'Album',
  duration:   180,
  format:     'mp3',
  size:       1024,
  coverColor: '#123456',
  path:       '/music/track.mp3',
})

function SnapshotHarness () {
  const { tracks, folders, setTracks, setFolders } = useLibrary()

  useEffect(() => {
    setTracks([ track ])
    setFolders([ root ])
  }, [ setFolders, setTracks ])

  return <>
    <output data-testid='track-title'>{tracks[0]?.title}</output>
    <output data-testid='folder-count'>{folders.length}</output>

    <button type='button' onClick={ () =>
      setTracks([ ...tracks ]) }>
      Republish tracks
    </button>
    <button type='button' onClick={ () =>
      setFolders([]) }>
      Clear folders
    </button>
  </>
}

describe('LibraryContext folder tree', () => {
  it('replaces track and folder snapshots independently', async () => {
    render(
      <LibraryProvider>
        <SnapshotHarness />
      </LibraryProvider>
    )

    expect(await screen.findByTestId('track-title')).toHaveTextContent('Original title')
    expect(screen.getByTestId('folder-count')).toHaveTextContent('1')

    track.title = 'Edited in place'
    fireEvent.click(screen.getByRole('button', { name: 'Republish tracks' }))
    expect(screen.getByTestId('track-title')).toHaveTextContent('Edited in place')
    expect(screen.getByTestId('folder-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'Clear folders' }))
    expect(screen.getByTestId('folder-count')).toHaveTextContent('0')
    expect(screen.getByTestId('track-title')).toHaveTextContent('Edited in place')
  })

  it('toggles nested folders without mutating or losing the root branch', async () => {
    render(
      <LibraryProvider>
        <FolderHarness />
      </LibraryProvider>
    )

    const tree = await screen.findByRole('tree')
    expect(screen.queryByRole('treeitem', { name: /Grandchild/ })).not.toBeInTheDocument()

    // Focus starts on the first node; walk down to Child, then open it.
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    fireEvent.keyDown(tree, { key: 'ArrowRight' })

    expect(screen.getByRole('treeitem', { name: /Grandchild/ })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: /Child/ })).toHaveAttribute('aria-expanded', 'true')
    // The root branch survives a nested toggle rather than being replaced.
    expect(screen.getByRole('treeitem', { name: /Music/ })).toHaveAttribute('aria-expanded', 'true')
  })
})

/*
 * Playlists store *ids* and resolve them against the library on read, which is
 * what makes membership survive a rescan and a tag edit. These exercise that
 * resolution, the folder filing, and the localStorage round trip.
 */
const playlistTracks = [
  Track.fromDTO({
    id:         '/music/one.mp3',
    title:      'One',
    artist:     'Artist',
    album:      'Album',
    duration:   100,
    format:     'mp3',
    size:       1,
    coverColor: '#000',
    path:       '/music/one.mp3',
  }),
  Track.fromDTO({
    id:         '/music/two.mp3',
    title:      'Two',
    artist:     'Artist',
    album:      'Album',
    duration:   100,
    format:     'mp3',
    size:       1,
    coverColor: '#000',
    path:       '/music/two.mp3',
  }),
]

type LibraryApi = ReturnType<typeof useLibrary>

function PlaylistHarness ({ onReady }: { onReady: (api: LibraryApi) => void }) {
  const api = useLibrary()

  useEffect(() => {
    api.setTracks(playlistTracks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ api.setTracks ])

  onReady(api)

  return <ul>
    {api.playlists.map(playlist =>
      <li key={ playlist.id } data-testid='playlist'>
        {`${playlist.name} · ${playlist.icon} · ${playlist.folderId ?? 'root'} · ${playlist.tracks.length}`}
      </li>
    )}
  </ul>
}

function renderPlaylists () {
  let api: LibraryApi = null as unknown as LibraryApi
  render(
    <LibraryProvider>
      <PlaylistHarness onReady={ next => {
        api = next
      } } />
    </LibraryProvider>
  )
  return () => api
}

describe('LibraryContext playlists', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resolves stored ids against the library, in the order they were added', async () => {
    const api = renderPlaylists()

    await act(async () => {
      api().addPlaylist('Mix', { tracks: [ playlistTracks[1] ]})
    })
    await act(async () => {
      api().addTracksToPlaylist(api().playlists[0].id, [ playlistTracks[0] ])
    })

    expect(api().playlists[0].tracks.map(t => t.title)).toEqual([ 'Two', 'One' ])
    expect(screen.getByTestId('playlist')).toHaveTextContent('Mix · music · root · 2')
  })

  it('ignores a track the playlist already holds', async () => {
    const api = renderPlaylists()

    await act(async () => {
      api().addPlaylist('Mix', { tracks: [ playlistTracks[0] ]})
    })
    await act(async () => {
      api().addTracksToPlaylist(api().playlists[0].id, playlistTracks)
    })

    expect(api().playlists[0].trackIds).toEqual([ '/music/one.mp3', '/music/two.mp3' ])
  })

  it('keeps an id whose file is no longer scanned, but does not show it', async () => {
    const api = renderPlaylists()

    await act(async () => {
      api().addPlaylist('Mix', { tracks: [ playlistTracks[0], { id: '/music/gone.mp3' }]})
    })

    expect(api().playlists[0].trackIds).toHaveLength(2)
    expect(api().playlists[0].tracks).toHaveLength(1)
  })

  it('renames, re-icons and files a playlist', async () => {
    const api = renderPlaylists()
    let id = ''
    let folderId = ''

    await act(async () => {
      id = api().addPlaylist('Mix')
    })
    await act(async () => {
      folderId = api().addPlaylistFolder('Sets')
    })
    await act(async () => {
      api().renamePlaylist(id, 'Evening')
      api().setPlaylistIcon(id, 'heart')
      api().movePlaylist(id, folderId)
    })

    expect(screen.getByTestId('playlist')).toHaveTextContent(`Evening · heart · ${folderId} · 0`)
  })

  it('lifts a deleted folder\'s playlists back to the root rather than deleting them', async () => {
    const api = renderPlaylists()
    let folderId = ''

    await act(async () => {
      folderId = api().addPlaylistFolder('Sets')
    })
    await act(async () => {
      api().addPlaylist('Mix', { folderId })
    })
    await act(async () => {
      api().removePlaylistFolder(folderId)
    })

    expect(api().playlistFolders).toHaveLength(0)
    expect(api().playlists).toHaveLength(1)
    expect(api().playlists[0].folderId).toBeNull()
  })

  it('refuses to file a folder inside its own subtree', async () => {
    const api = renderPlaylists()
    let outer = ''
    let inner = ''

    await act(async () => {
      outer = api().addPlaylistFolder('Outer')
    })
    await act(async () => {
      inner = api().addPlaylistFolder('Inner', outer)
    })
    await act(async () => {
      api().movePlaylistFolder(outer, inner)
    })

    expect(api().playlistFolders.find(f => f.id === outer)?.parentId).toBeNull()
  })

  it('persists across a remount', async () => {
    const first = renderPlaylists()

    await act(async () => {
      first().addPlaylist('Mix', { icon: 'star', tracks: [ playlistTracks[0] ]})
    })

    cleanup()
    const second = renderPlaylists()

    await waitFor(() =>
      expect(second().playlists).toHaveLength(1))
    expect(second().playlists[0]).toMatchObject({ name: 'Mix', icon: 'star' })
    expect(second().playlists[0].tracks).toHaveLength(1)
  })
})
