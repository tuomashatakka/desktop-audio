/* eslint-disable react-strict/no-style-prop -- `--level` is the node's depth
   in an arbitrarily deep tree, which no fixed set of classes can express. */
import type { FolderNode } from '../../contexts'
import { Icon } from '../atomic'


/**
 * Recursively rendered folder tree for the sidebar. Selection and
 * expand/collapse are controlled by the caller via `onSelect` / `onToggle`.
 *
 * Nested `<ul>`/`<li>` rather than `role="tree"`: a real tree widget owes the
 * user arrow-key roaming and a single tab stop, which this doesn't implement.
 * A nested list of buttons is honest about what it is and is keyboard-usable
 * out of the box. Disclosure and selection are two sibling buttons — never a
 * click handler on a `<span>` inside a `<button>`.
 */
interface FolderTreeProps {
  readonly folders:      ReadonlyArray<FolderNode>
  readonly selectedPath: string | null
  readonly onSelect:     (path: string) => void
  readonly onToggle:     (path: string) => void
  readonly level?:       number
}

/** See the interface docs above; recurses one level per nested folder. */
export function FolderTree ({ folders, selectedPath, onSelect, onToggle, level = 0 }: FolderTreeProps) {
  return <ul className='folder-tree' style={{ '--level': level } as React.CSSProperties}>
    {folders.map(folder => {
      const hasChildren = folder.children.length > 0
      const selected    = selectedPath === folder.path

      return <li key={ folder.id }>
        <div className={ `folder-row ${selected ? 'active' : ''}` }>
          {hasChildren
            ? <button
              className={ `disclosure ${folder.expanded ? 'open' : ''}` }
              aria-expanded={ folder.expanded }
              aria-label={ `${folder.expanded ? 'Collapse' : 'Expand'} ${folder.name}` }
              type='button'
              onClick={ () =>
                onToggle(folder.path) }>
              <Icon name='chevron-right' />
            </button>
            : null
          }

          <button
            className='folder-name'
            aria-current={ selected || undefined }
            type='button'
            onClick={ () =>
              onSelect(folder.path) }>
            {folder.name}
          </button>
        </div>

        {folder.expanded && hasChildren &&
              <FolderTree
                folders={ folder.children }
                selectedPath={ selectedPath }
                level={ level + 1 }
                onSelect={ onSelect }
                onToggle={ onToggle } />
        }
      </li>
    })}
  </ul>
}
