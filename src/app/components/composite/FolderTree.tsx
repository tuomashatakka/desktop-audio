import type { FolderNode } from '../../contexts'


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

export function FolderTree ({ folders, selectedPath, onSelect, onToggle, level = 0 }: FolderTreeProps) {
  return (
    <ul className='folder-tree' style={{ '--level': level } as React.CSSProperties}>
      {folders.map(folder => {
        const hasChildren = folder.children.length > 0
        const selected = selectedPath === folder.path

        return (
          <li key={folder.id}>
            <div className={`folder-row ${selected ? 'active' : ''}`}>
              {hasChildren
                ? <button
                  type='button'
                  className={`disclosure ${folder.expanded ? 'open' : ''}`}
                  onClick={() =>
                    onToggle(folder.path)}
                  aria-expanded={folder.expanded}
                  aria-label={`${folder.expanded ? 'Collapse' : 'Expand'} ${folder.name}`}
                >
                  ›
                </button>
                : <span className='disclosure' aria-hidden='true' />
              }

              <button
                type='button'
                className='folder-name'
                aria-current={selected || undefined}
                onClick={() =>
                  onSelect(folder.path)}
              >
                {folder.name}
              </button>
            </div>

            {folder.expanded && hasChildren &&
              <FolderTree
                folders={folder.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onToggle={onToggle}
                level={level + 1}
              />
            }
          </li>
        )
      })}
    </ul>
  )
}
