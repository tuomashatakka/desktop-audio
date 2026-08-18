import type { FolderRow } from '../../utils/folders'
import { setDragPayload } from '../../utils/dnd'
import { Icon } from '../atomic/Icon'


interface FolderRowsProps {
  readonly folders:      readonly FolderRow[] | undefined
  readonly selectedPath: string | null
  readonly onSelect:     (path: string) => void
  readonly onOpen:       (path: string) => void
}

/**
 * The current location's immediate subfolders, above the tracks.
 *
 * They follow the same two-gesture rule as the track rows — click selects,
 * double click opens — and are drag sources, so a folder can be dropped on a
 * playlist without first being browsed into. A folder row is not part of the
 * table's grid: it spans the full width, because none of the track columns
 * describe a folder.
 */
export function FolderRows ({ folders, selectedPath, onSelect, onOpen }: FolderRowsProps) {
  if (!folders || folders.length === 0)
    return null

  return <ul className='folder-rows' aria-label='Folders'>
    {folders.map(folder =>
      <li key={ folder.path }>
        <button
          className='track-row folder-entry'
          data-selected={ selectedPath === folder.path || undefined }
          draggable
          type='button'
          onClick={ () =>
            onSelect(folder.path) }
          onDoubleClick={ () =>
            onOpen(folder.path) }
          onKeyDown={ event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(folder.path)
            }
          } }
          onDragStart={ event =>
            setDragPayload(event.dataTransfer, {
              kind:  'folder',
              path:  folder.path,
              label: folder.name,
            }) }>
          <Icon name='folder' />
          <span className='folder-entry-name'>{folder.name}</span>

          <small>
            {folder.trackCount}
            {folder.trackCount === 1 ? ' track' : ' tracks'}
          </small>
        </button>
      </li>
    )}
  </ul>
}
