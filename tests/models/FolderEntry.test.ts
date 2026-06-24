import { describe, it, expect, vi } from 'vitest'
import { FolderEntry } from '../../src/app/models/FolderEntry'

describe('FolderEntry model', () => {
  it('creates from folder node', () => {
    const node = {
      id: 'folder-1',
      name: 'Music',
      path: '/music',
      children: [],
      expanded: false,
    }
    const entry = FolderEntry.fromFolderNode(node)

    expect(entry.id).toBe('folder-1')
    expect(entry.name).toBe('Music')
    expect(entry.path).toBe('/music')
    expect(entry.expanded).toBe(false)
  })

  it('marks dirty when name changes', () => {
    const entry = new FolderEntry('folder-1')
    entry['_name'] = 'Initial'

    const dirtyHandler = vi.fn()
    entry.addEventListener('dirty', dirtyHandler)

    entry.name = 'Changed'

    expect(dirtyHandler).toHaveBeenCalledTimes(1)
    expect(entry.dirty).toBe(true)
  })

  it('supports children array', () => {
    const entry = new FolderEntry('folder-1')
    const child = new FolderEntry('child-1')
    child.name = 'Child'
    child.path = '/music/child'

    entry.children = [child]
    expect(entry.children).toHaveLength(1)
    expect(entry.children[0].name).toBe('Child')
  })

  it('has expanded property', () => {
    const entry = new FolderEntry('folder-1')
    entry.expanded = false
    expect(entry.expanded).toBe(false)

    entry.expanded = true
    expect(entry.expanded).toBe(true)
  })

  it('marks dirty when children change', () => {
    const entry = new FolderEntry('folder-1')

    const dirtyHandler = vi.fn()
    entry.addEventListener('dirty', dirtyHandler)

    entry.children = [new FolderEntry('child-1')]

    expect(dirtyHandler).toHaveBeenCalled()
  })
})
