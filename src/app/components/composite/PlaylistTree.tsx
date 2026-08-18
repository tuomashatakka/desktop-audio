import type { CSSProperties } from 'react'
import { useState } from 'react'
import type { Playlist, PlaylistFolder } from '../../contexts'
import type { DragPayload } from '../../utils/dnd'
import { hasDragPayload, readDragPayload, setDragPayload } from '../../utils/dnd'
import type { PopoverPoint } from '../atomic/Popover'
import { Icon } from '../atomic/Icon'


/**
 * The key the root drop zone answers to, distinct from `null`, which is "no
 * drag is over anything".
 */
const ROOT_DROP_ZONE = ''

/** What a context menu was opened on. `null` folder id means the root. */
export type PlaylistTarget =
  | { readonly kind: 'playlist'; readonly id: string } |
  { readonly kind: 'folder'; readonly id: string }

interface PlaylistTreeProps {
  readonly playlists:  readonly Playlist[]
  readonly folders:    readonly PlaylistFolder[]
  readonly selectedId: string | null
  readonly onSelect:   (id: string) => void
  readonly onToggle:   (folderId: string) => void

  /** A media drop onto a playlist, or a playlist dropped onto a folder. */
  readonly onDrop:        (target: PlaylistTarget | null, payload: DragPayload) => void
  readonly onContextMenu: (target: PlaylistTarget, point: PopoverPoint) => void
}

/**
 * The sidebar's playlists, filed into folders.
 *
 * Every row is both a drag source and a drop target, and which of the two it
 * is doing is decided by the payload rather than by the row — see `utils/dnd`.
 * Dropping *media* (rows, a library folder, an album) onto a playlist adds
 * those tracks to it; dropping it onto a folder starts a new playlist there,
 * because a folder holds playlists and not tracks. Dropping a *playlist* onto
 * a folder files it.
 *
 * It is a nested list of buttons rather than the ARIA tree pattern on purpose.
 * A tree owes the user arrow-key roaming and a single tab stop; these rows are
 * a handful of ordinary navigation controls, and claiming the stricter pattern
 * without implementing it reads worse to a screen reader than not claiming it.
 */
export function PlaylistTree ({
  playlists, folders, selectedId, onSelect, onToggle, onDrop, onContextMenu,
}: PlaylistTreeProps) {
  const [ dropTarget, setDropTarget ] = useState<string | null>(null)

  const handleDrop = (target: PlaylistTarget | null, event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(null)

    const payload = readDragPayload(event.dataTransfer)
    if (payload)
      onDrop(target, payload)
  }

  /** Only ours, and never a playlist dropped onto itself. */
  const handleDragOver = (key: string, event: React.DragEvent) => {
    if (!hasDragPayload(event.dataTransfer))
      return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDropTarget(key)
  }

  const renderPlaylist = (playlist: Playlist, level: number) =>
    <li key={ playlist.id }>
      <button
        className={ `playlist-row ${selectedId === playlist.id ? 'active' : ''}` }
        style={{ '--level': level } as CSSProperties}
        aria-current={ selectedId === playlist.id || undefined }
        data-drop-target={ dropTarget === playlist.id || undefined }
        draggable
        type='button'
        onClick={ () =>
          onSelect(playlist.id) }
        onContextMenu={ event => {
          event.preventDefault()
          onContextMenu({ kind: 'playlist', id: playlist.id }, { x: event.clientX, y: event.clientY })
        } }
        onDragStart={ event =>
          setDragPayload(event.dataTransfer, {
            kind:  'playlist',
            id:    playlist.id,
            label: playlist.name,
          }) }
        onDragOver={ event =>
          handleDragOver(playlist.id, event) }
        onDragLeave={ () =>
          setDropTarget(current =>
            current === playlist.id ? null : current) }
        onDrop={ event =>
          handleDrop({ kind: 'playlist', id: playlist.id }, event) }>
        <Icon name={ playlist.icon } />
        <span className='name'>{playlist.name}</span>
        <small>{playlist.tracks.length}</small>
      </button>
    </li>

  const renderFolder = (folder: PlaylistFolder, level: number) =>
    <li key={ folder.id }>
      <button
        className='playlist-row folder'
        style={{ '--level': level } as CSSProperties}
        aria-expanded={ folder.expanded }
        data-drop-target={ dropTarget === folder.id || undefined }
        draggable
        type='button'
        onClick={ () =>
          onToggle(folder.id) }
        onDragStart={ event =>
          setDragPayload(event.dataTransfer, {
            kind:  'playlist-folder',
            id:    folder.id,
            label: folder.name,
          }) }
        onContextMenu={ event => {
          event.preventDefault()
          onContextMenu({ kind: 'folder', id: folder.id }, { x: event.clientX, y: event.clientY })
        } }
        onDragOver={ event =>
          handleDragOver(folder.id, event) }
        onDragLeave={ () =>
          setDropTarget(current =>
            current === folder.id ? null : current) }
        onDrop={ event =>
          handleDrop({ kind: 'folder', id: folder.id }, event) }>
        <Icon className={ folder.expanded ? 'disclosure open' : 'disclosure' } name='chevron-right' />
        <Icon name={ folder.icon } />
        <span className='name'>{folder.name}</span>
      </button>

      {folder.expanded && renderLevel(folder.id, level + 1)}
    </li>

  /** One folder's children — its subfolders first, then its playlists. */
  function renderLevel (parentId: string | null, level: number) {
    const childFolders = folders.filter(folder =>
      folder.parentId === parentId)
    const childPlaylists = playlists.filter(playlist =>
      playlist.folderId === parentId)

    if (childFolders.length === 0 && childPlaylists.length === 0)
      return null

    return <ul className='playlist-level'>
      {childFolders.map(folder =>
        renderFolder(folder, level))}

      {childPlaylists.map(playlist =>
        renderPlaylist(playlist, level))}
    </ul>
  }

  return <section
    className='playlist-tree'
    aria-label='Playlists'
    data-drop-target={ dropTarget === ROOT_DROP_ZONE || undefined }
    onDragOver={ event =>
      handleDragOver(ROOT_DROP_ZONE, event) }
    onDragLeave={ () =>
      setDropTarget(current =>
        current === ROOT_DROP_ZONE ? null : current) }
    onDrop={ event =>
      handleDrop(null, event) }>
    {renderLevel(null, 0)}
  </section>
}
