import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
