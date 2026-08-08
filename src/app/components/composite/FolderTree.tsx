/* eslint-disable react-strict/no-style-prop -- `--level` is the node's depth
   in an arbitrarily deep tree, which no fixed set of classes can express. */
import type { CSSProperties } from 'react'
import type { FolderNode } from '../../contexts'
import { useTreeNavigation } from '../../hooks/useTreeNavigation'
import type { FlatNode } from '../../hooks/useTreeNavigation'
import { Icon } from '../atomic'


/**
 * The sidebar folder tree, as the WAI-ARIA tree pattern.
 *
 * It used to be a nested list of buttons, deliberately *not* a tree, because
 * a tree owes the user arrow-key roaming and a single tab stop and that was
 * not implemented. It is now: `useTreeNavigation` owns the key handling, and
 * exactly one row carries `tabIndex={0}`.
 *
 * Rendering is flat rather than recursive. The hook already flattens the
 * visible nodes to do index arithmetic on them, and reusing that list keeps
 * the DOM order identical to the traversal order — which is the whole
 * contract Up/Down depends on. Depth is expressed by `--level`, not nesting.
 *
 * The disclosure chevron is no longer a nested `<button>`: `aria-expanded`
 * belongs on the treeitem, and a button inside a treeitem would put a second
 * interactive node in the accessibility tree for the same job.
 */
interface FolderTreeProps {
  readonly folders:      ReadonlyArray<FolderNode>
  readonly selectedPath: string | null
  readonly onSelect:     (path: string) => void
  readonly onToggle:     (path: string) => void
}

interface FolderTreeItemProps {
  readonly entry:    FlatNode
  readonly selected: boolean
  readonly focused:  boolean
  readonly onSelect: (path: string) => void
  readonly onToggle: (path: string) => void
  readonly onFocus:  (path: string) => void
}

/** One row: a treeitem carrying its own expanded/selected state. */
function FolderTreeItem ({ entry, selected, focused, onSelect, onToggle, onFocus }: FolderTreeItemProps) {
  const { node, level } = entry
  const hasChildren     = node.children.length > 0

  return <li
    className={ `folder-row ${selected ? 'active' : ''}` }
    style={{ '--level': level } as CSSProperties}
    data-tree-path={ node.path }
    aria-level={ level + 1 }
    aria-selected={ selected }
    aria-expanded={ hasChildren ? node.expanded : undefined }
    role='treeitem'
    tabIndex={ focused ? 0 : -1 }
    onClick={ () =>
      onSelect(node.path) }
    onFocus={ () =>
      onFocus(node.path) }>
    {hasChildren
      ? <span
        className={ `disclosure ${node.expanded ? 'open' : ''}` }
        aria-hidden='true'
        onClick={ event => {
          // The row's own click selects; the chevron only ever toggles.
          event.stopPropagation()
          onToggle(node.path)
        } }>
        <Icon name='chevron-right' />
      </span>
      : <span className='disclosure' aria-hidden='true' />
    }

    <span className='folder-name'>{node.name}</span>
  </li>
}

/** See module docstring. */
export function FolderTree ({ folders, selectedPath, onSelect, onToggle }: FolderTreeProps) {
  const { visible, focusedPath, setFocused, onKeyDown } = useTreeNavigation({ folders, onSelect, onToggle })

  return <ul className='folder-tree' aria-label='Folders' role='tree' onKeyDown={ onKeyDown }>
    {visible.map(entry =>
      <FolderTreeItem
        key={ entry.node.id }
        entry={ entry }
        selected={ selectedPath === entry.node.path }
        focused={ focusedPath === entry.node.path }
        onSelect={ onSelect }
        onToggle={ onToggle }
        onFocus={ setFocused } />
    )}
  </ul>
}
