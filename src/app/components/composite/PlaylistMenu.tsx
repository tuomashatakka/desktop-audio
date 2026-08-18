import { PLAYLIST_ICONS } from '../../contexts'
import type { PlaylistIcon } from '../../contexts'
import { Popover } from '../atomic/Popover'
import type { PopoverPoint } from '../atomic/Popover'
import { Icon } from '../atomic/Icon'
import { MenuList } from './ContextMenu'
import type { MenuEntry } from './ContextMenu'


/** Which row the menu was opened on; a folder offers one action more. */
export type PlaylistMenuKind = 'playlist' | 'folder'

/** The row the menu is about: what to title it with, and what to preselect. */
export interface PlaylistMenuSubject {
  readonly kind: PlaylistMenuKind
  readonly name: string
  readonly icon: PlaylistIcon
}

interface PlaylistMenuProps {
  readonly point:   PopoverPoint | null
  readonly subject: PlaylistMenuSubject | null
  readonly onIcon:  (icon: PlaylistIcon) => void

  /** In folder order: rename, new playlist here, new folder here, delete. */
  readonly onRename:      () => void
  readonly onNewPlaylist: () => void
  readonly onNewFolder:   () => void
  readonly onDelete:      () => void
  readonly onClose:       () => void
}

const PLAYLIST_ACTIONS: readonly MenuEntry[] = [
  { label: 'Rename', icon: 'edit' },
  { separator: true },
  { label: 'Delete', icon: 'trash', danger: true },
]

const FOLDER_ACTIONS: readonly MenuEntry[] = [
  { label: 'Rename', icon: 'edit' },
  { label: 'New playlist here', icon: 'add' },
  { label: 'New folder here', icon: 'folder' },
  { separator: true },
  { label: 'Delete', icon: 'trash', danger: true },
]

/**
 * The right-click menu for a playlist or a playlist folder.
 *
 * The icon picker rides above the actions rather than behind a submenu: it is
 * the one property of a playlist that is worth changing often, and a menu that
 * has to be reopened to try a second icon makes choosing one a chore.
 *
 * It renders in-process through {@link Popover}, unlike the track menu, which
 * goes out to a real OS window. A native menu cannot host a grid of swatches,
 * and these actions are all renderer-side anyway.
 */
export function PlaylistMenu ({
  point, subject, onIcon,
  onRename, onNewPlaylist, onNewFolder, onDelete, onClose,
}: PlaylistMenuProps) {
  const isFolder = subject?.kind === 'folder'
  const actions  = isFolder ? FOLDER_ACTIONS : PLAYLIST_ACTIONS

  const handleSelect = (index: number) => {
    onClose()

    if (!isFolder) {
      if (index === 0)
        onRename()
      // index 1 is the separator — no action
      else if (index === 2)
        onDelete()
      return
    }

    switch (index) {
      case 0: onRename(); break
      case 1: onNewPlaylist(); break
      case 2: onNewFolder(); break
      // index 3 is the separator — no action
      case 4: onDelete(); break
    }
  }

  return <Popover open={ point !== null } point={ point } onClose={ onClose }>
    <fieldset className='icon-picker'>
      <legend>{subject?.name}</legend>

      {PLAYLIST_ICONS.map(candidate =>
        <button
          key={ candidate }
          className={ candidate === subject?.icon ? 'active' : '' }
          aria-label={ `Use the ${candidate} icon` }
          aria-pressed={ candidate === subject?.icon }
          type='button'
          onClick={ () =>
            onIcon(candidate) }>
          <Icon name={ candidate } />
        </button>
      )}
    </fieldset>

    <MenuList items={ actions } onSelect={ handleSelect } />
  </Popover>
}
