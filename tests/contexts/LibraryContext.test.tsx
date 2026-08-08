import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FolderTree } from '../../src/app/components/composite/FolderTree'
import { LibraryProvider, useLibrary } from '../../src/app/contexts/LibraryContext'
import { FolderEntry } from '../../src/app/models'


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
  const { registry, setFolders, toggleFolder } = useLibrary()

  useEffect(() => {
    setFolders([ root ])
  }, [ setFolders ])

  return (
    <FolderTree
      folders={Array.from(registry.folders.values())}
      selectedPath={null}
      onSelect={() => {}}
      onToggle={toggleFolder}
    />
  )
}

describe('LibraryContext folder tree', () => {
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
