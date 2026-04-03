import type { FolderNode } from '../../contexts'


interface FolderTreeProps {
  readonly folders:      ReadonlyArray<FolderNode>
  readonly selectedPath: string | null
  readonly onSelect:     (path: string) => void
  readonly onToggle:     (path: string) => void
  readonly level?:       number
}

export function FolderTree ({ folders, selectedPath, onSelect, onToggle, level = 0 }: FolderTreeProps) {
  const Wrapper = level === 0 ? 'nav' : 'div'

  return (
    <Wrapper className='folder-tree'>
      {folders.map(folder =>
        <div key={folder.id} className='folder-tree-node'>
          <button
            className={`folder-row ${selectedPath === folder.path ? 'active' : ''}`}
            onClick={() =>
              onSelect(folder.path)}
            style={{ paddingLeft: `calc(var(--sp-3) + ${level * 12}px)` }}
          >
            <span
              className='folder-toggle'
              onClick={e => {
                e.stopPropagation()
                onToggle(folder.path)
              }}
              aria-hidden='true'
            >
              {folder.children.length > 0
                ? <span className={`folder-chevron ${folder.expanded ? 'open' : ''}`}>›</span>
                : <span className='folder-chevron-spacer' />
              }
            </span>

            <span className='folder-icon' aria-hidden='true'>
              {folder.children.length > 0
                ? folder.expanded ? '⊟' : '⊞'
                : '▸'
              }
            </span>

            <span className='folder-name'>{folder.name}</span>
          </button>

          {folder.expanded && folder.children.length > 0 &&
            <FolderTree
              folders={folder.children}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
              level={level + 1}
            />
          }
        </div>
      )}
    </Wrapper>
  )
}
