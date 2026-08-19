/**
 * Arrow-key browsing in the sidebar tree.
 *
 * The tree was previously a nested list of buttons with no key handling at
 * all, so every behaviour here is new and worth pinning: one tab stop,
 * Up/Down over the *visible* nodes only, Right to open then descend, Left to
 * close then climb.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FolderTree } from '../../../src/app/components/composite/FolderTree'
import type { FolderNode } from '../../../src/app/contexts'


function node (
  name: string,
  path: string,
  children: FolderNode[] = [],
  expanded = false
): FolderNode {
  return { id: path, name, path, children, expanded }
}

/** music ▸ { rock ▸ { live }, jazz }, with `rock` closed to start with. */
const live = node('Live', '/music/rock/live')
const rock = node('Rock', '/music/rock', [ live ])
const jazz = node('Jazz', '/music/jazz')
const music = node('Music', '/music', [ rock, jazz ], true)

function toggleIn (folders: FolderNode[], path: string): FolderNode[] {
  return folders.map(folder =>
    folder.path === path
      ? { ...folder, expanded: !folder.expanded }
      : { ...folder, children: toggleIn(folder.children as FolderNode[], path) })
}

function Harness ({ onSelect = vi.fn() }: { onSelect?: (path: string) => void }) {
  const [ folders, setFolders ] = useState<FolderNode[]>([ music ])

  return <FolderTree
    folders={ folders }
    selectedPath={ null }
    onSelect={ onSelect }
    onToggle={ path =>
      setFolders(current =>
        toggleIn(current, path)) } />
}

const tree = () =>
  screen.getByRole('tree')

const item = (name: string | RegExp) =>
  screen.getByRole('treeitem', { name })

const names = () =>
  screen.getAllByRole('treeitem').map(el =>
    el.textContent)

const focusedName = () =>
  screen.getAllByRole('treeitem').find(el =>
    el.getAttribute('tabindex') === '0')?.textContent

describe('FolderTree keyboard navigation', () => {
  it('renders only the visible nodes — a closed branch contributes none', () => {
    render(<Harness />)

    expect(names()).toEqual([ 'Music', 'Rock', 'Jazz' ])
    expect(screen.queryByRole('treeitem', { name: /Live/ })).not.toBeInTheDocument()
  })

  it('is a single tab stop', () => {
    render(<Harness />)

    const stops = screen.getAllByRole('treeitem').filter(el =>
      el.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
  })

  it('moves focus down and up the visible nodes', () => {
    render(<Harness />)

    expect(focusedName()).toBe('Music')

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(focusedName()).toBe('Rock')

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(focusedName()).toBe('Jazz')

    fireEvent.keyDown(tree(), { key: 'ArrowUp' })
    expect(focusedName()).toBe('Rock')
  })

  it('stops at the ends rather than wrapping', () => {
    render(<Harness />)

    fireEvent.keyDown(tree(), { key: 'ArrowUp' })
    expect(focusedName()).toBe('Music')

    fireEvent.keyDown(tree(), { key: 'End' })
    expect(focusedName()).toBe('Jazz')

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(focusedName()).toBe('Jazz')
  })

  it('Home and End jump to the first and last visible node', () => {
    render(<Harness />)

    fireEvent.keyDown(tree(), { key: 'End' })
    expect(focusedName()).toBe('Jazz')

    fireEvent.keyDown(tree(), { key: 'Home' })
    expect(focusedName()).toBe('Music')
  })

  it('ArrowRight opens a closed node, then descends into it', () => {
    render(<Harness />)

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(tree(), { key: 'ArrowRight' })
    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'true')
    expect(focusedName()).toBe('Rock')

    // Second press descends rather than toggling back.
    fireEvent.keyDown(tree(), { key: 'ArrowRight' })
    expect(focusedName()).toBe('Live')
    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('ArrowLeft closes an open node', () => {
    render(<Harness />)

    expect(item(/Music/)).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(tree(), { key: 'ArrowLeft' })
    expect(item(/Music/)).toHaveAttribute('aria-expanded', 'false')
    expect(names()).toEqual([ 'Music' ])
  })

  it('ArrowLeft on a leaf climbs to the parent — closing the current parent', () => {
    render(<Harness />)

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    fireEvent.keyDown(tree(), { key: 'ArrowRight' })
    fireEvent.keyDown(tree(), { key: 'ArrowRight' })
    expect(focusedName()).toBe('Live')

    // Live is a leaf, so Left moves up to Rock...
    fireEvent.keyDown(tree(), { key: 'ArrowLeft' })
    expect(focusedName()).toBe('Rock')
    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'true')

    // ...and from Rock it closes it.
    fireEvent.keyDown(tree(), { key: 'ArrowLeft' })
    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('ArrowRight on a leaf does nothing', () => {
    render(<Harness />)

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    expect(focusedName()).toBe('Jazz')

    fireEvent.keyDown(tree(), { key: 'ArrowRight' })
    expect(focusedName()).toBe('Jazz')
    expect(names()).toEqual([ 'Music', 'Rock', 'Jazz' ])
  })

  it('Enter selects the focused node', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={ onSelect } />)

    fireEvent.keyDown(tree(), { key: 'ArrowDown' })
    fireEvent.keyDown(tree(), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('/music/rock')
  })

  it('clicking the chevron toggles without selecting', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={ onSelect } />)

    const chevron = item(/Rock/).querySelector('.disclosure')!
    fireEvent.click(chevron)

    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'true')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('clicking the row selects it', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={ onSelect } />)

    fireEvent.click(item(/Jazz/))

    expect(onSelect).toHaveBeenCalledWith('/music/jazz')
  })

  // Selecting a folder and looking inside it are the same intent, so one click
  // does both — the chevron above stays the way to open a branch *without*
  // moving the selection.
  it('clicking a row with children also expands it', () => {
    const onSelect = vi.fn()
    render(<Harness onSelect={ onSelect } />)

    fireEvent.click(item(/Rock/))

    expect(onSelect).toHaveBeenCalledWith('/music/rock')
    expect(item(/Rock/)).toHaveAttribute('aria-expanded', 'true')
    expect(names()).toContain('Live')
  })

  it('clicking a leaf selects it without toggling anything', () => {
    render(<Harness />)

    fireEvent.click(item(/Jazz/))

    expect(item(/Jazz/)).not.toHaveAttribute('aria-expanded')
    expect(names()).not.toContain('Live')
  })
})
