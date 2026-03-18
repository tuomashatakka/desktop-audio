import type { FolderNode } from '../../contexts'


interface FolderTreeProps {
  readonly folders:      ReadonlyArray<FolderNode>
  readonly selectedPath: string | null
  readonly onSelect:     (path: string) => void
  readonly onToggle:     (path: string) => void
  readonly level?:       number
}

export function FolderTree ({ folders, selectedPath, onSelect, onToggle, level = 0 }: FolderTreeProps) {
  return (
    <nav className='folder-tree'>
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
            >
              {folder.children.length > 0
                ? (folder.expanded ? '⌄' : '›')
                : <span style={{ width: 16, display: 'inline-block' }} />
              }
            </span>

            <span className='folder-icon'>
              {folder.children.length > 0
                ? folder.expanded ? '📂' : '📁'
                : '🎵'
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
    </nav>
  )
}
