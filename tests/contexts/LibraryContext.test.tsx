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

    const expandChild = await screen.findByRole('button', { name: 'Expand Child' })
    expect(screen.queryByRole('button', { name: 'Grandchild' })).not.toBeInTheDocument()

    fireEvent.click(expandChild)

    expect(screen.getByRole('button', { name: 'Grandchild' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Child' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse Music' })).toBeInTheDocument()
  })
})
