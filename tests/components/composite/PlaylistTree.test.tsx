import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlaylistTree } from '../../../src/app/components/composite/PlaylistTree'
import { DND_MIME, readDragPayload } from '../../../src/app/utils/dnd'
import type { DragPayload } from '../../../src/app/utils/dnd'
import type { Playlist, PlaylistFolder } from '../../../src/app/contexts'
import { noop } from '../../../src/app/utils/noop'


/** jsdom has no DataTransfer, and a drag is all DataTransfer. */
function fakeTransfer (payload?: DragPayload) {
  const data = new Map<string, string>()
  if (payload)
    data.set(DND_MIME, JSON.stringify(payload))

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

const folders: PlaylistFolder[] = [
  { id: 'f1', name: 'Sets', icon: 'folder', parentId: null, expanded: true },
]

const playlists: Playlist[] = [
  { id: 'p1', name: 'Morning', icon: 'music', folderId: null, trackIds: [], tracks: []},
  { id: 'p2', name: 'Filed', icon: 'heart', folderId: 'f1', trackIds: [ 'x' ], tracks: []},
]

const dropped: DragPayload = { kind: 'tracks', trackIds: [ 'a' ], label: 'One' }

function renderTree (onDrop = vi.fn()) {
  render(
    <PlaylistTree
      playlists={ playlists }
      folders={ folders }
      selectedId={ null }
      onSelect={ noop }
      onToggle={ noop }
      onDrop={ onDrop }
      onContextMenu={ noop } />
  )
  return onDrop
}

describe('PlaylistTree', () => {
  it('nests a filed playlist under its folder', () => {
    renderTree()

    const folder = screen.getByRole('button', { name: /Sets/ })
    expect(folder).toHaveAttribute('aria-expanded', 'true')
    // The filed playlist renders inside the folder's list item, not beside it.
    expect(folder.closest('li')).toContainElement(screen.getByRole('button', { name: /Filed/ }))
  })

  it('reports a drop on a playlist as that playlist', () => {
    const onDrop = renderTree()
    const transfer = fakeTransfer(dropped)

    fireEvent.drop(screen.getByRole('button', { name: /Morning/ }), { dataTransfer: transfer })

    expect(onDrop).toHaveBeenCalledWith({ kind: 'playlist', id: 'p1' }, dropped)
  })

  it('reports a drop on a folder as that folder', () => {
    const onDrop = renderTree()

    fireEvent.drop(screen.getByRole('button', { name: /Sets/ }), {
      dataTransfer: fakeTransfer(dropped),
    })

    expect(onDrop).toHaveBeenCalledWith({ kind: 'folder', id: 'f1' }, dropped)
  })

  it('reports a drop on the empty space below the tree as the root', () => {
    const onDrop = renderTree()

    fireEvent.drop(screen.getByRole('region', { name: 'Playlists' }), {
      dataTransfer: fakeTransfer(dropped),
    })

    expect(onDrop).toHaveBeenCalledWith(null, dropped)
  })

  it('ignores a drag that is not one of ours', () => {
    const onDrop = renderTree()

    fireEvent.drop(screen.getByRole('button', { name: /Morning/ }), {
      dataTransfer: fakeTransfer(),
    })

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('marks the row a drag is over, and unmarks it on leaving', () => {
    renderTree()

    const row = screen.getByRole('button', { name: /Morning/ })
    fireEvent.dragOver(row, { dataTransfer: fakeTransfer(dropped) })
    expect(row).toHaveAttribute('data-drop-target')

    fireEvent.dragLeave(row)
    expect(row).not.toHaveAttribute('data-drop-target')
  })

  it('drags a playlist as a filing move, carrying only its id', () => {
    renderTree()
    const transfer = fakeTransfer()

    fireEvent.dragStart(screen.getByRole('button', { name: /Morning/ }), { dataTransfer: transfer })

    expect(readDragPayload(transfer)).toEqual({ kind: 'playlist', id: 'p1', label: 'Morning' })
    expect(transfer.effectAllowed).toBe('move')
  })

  it('drags a folder as a filing move too', () => {
    renderTree()
    const transfer = fakeTransfer()

    fireEvent.dragStart(screen.getByRole('button', { name: /Sets/ }), { dataTransfer: transfer })

    expect(readDragPayload(transfer)).toEqual({ kind: 'playlist-folder', id: 'f1', label: 'Sets' })
  })
})
