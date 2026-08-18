/**
 * LibrarySidebar — playback lists, folder tree and playlists.
 *
 * Mounted once by AppLayout and hidden or revealed from shell state in CSS.
 * The sections are native `<details>`, so their collapse is platform behaviour
 * rather than duplicated React state.
 *
 * This is the app's drop destination. Tracks, library folders and albums all
 * arrive here as a {@link DragPayload}, get resolved against the library in
 * {@link handleDrop}, and land in a playlist — which is why the sidebar reads
 * the whole track list rather than the filtered one: what you dragged is what
 * you dropped, regardless of what the search box happens to be narrowing.
 */
import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  useAudio,
  useLibrary,
  useUI,
} from '../contexts'
import type { PlaybackList, Playlist, PlaylistFolder, PlaylistIcon } from '../contexts'
import { FolderTree } from '../components/composite/FolderTree'
import { PlaylistTree } from '../components/composite/PlaylistTree'
import type { PlaylistTarget } from '../components/composite/PlaylistTree'
import { PlaylistMenu } from '../components/composite/PlaylistMenu'
import type { PlaylistMenuSubject } from '../components/composite/PlaylistMenu'
import { Icon, PromptDialog } from '../components/atomic'
import type { PopoverPoint } from '../components/atomic/Popover'
import type { IconName } from '../services/types'
import { useCallback, useState } from 'react'
import { listenAll } from '../utils/events'
import { isMediaDrag, tracksForPayload } from '../utils/dnd'
import type { DragPayload, MediaDrag } from '../utils/dnd'


/** Pixels per arrow-key press on the resize handle. */
const RESIZE_STEP = 10

/** The two playback-derived lists, in the order the sidebar offers them. */
const PLAYBACK_LISTS: readonly { list: PlaybackList; label: string; icon: IconName }[] = [
  { list: 'queue', label: 'Playback queue', icon: 'queue' },
  { list: 'history', label: 'Last played', icon: 'clock' },
]

/**
 * Resolve the right-clicked row to what the menu has to render.
 *
 * A target whose row has since disappeared — deleted in another tick — simply
 * has no subject, and the menu stays closed rather than opening on nothing.
 */
function menuSubject (
  target: PlaylistTarget | null,
  playlists: readonly Playlist[],
  folders: readonly PlaylistFolder[]
): PlaylistMenuSubject | null {
  if (target === null)
    return null

  if (target.kind === 'playlist') {
    const playlist = playlists.find(candidate =>
      candidate.id === target.id)
    return playlist ? { kind: 'playlist', name: playlist.name, icon: playlist.icon } : null
  }

  const folder = folders.find(candidate =>
    candidate.id === target.id)
  return folder ? { kind: 'folder', name: folder.name, icon: folder.icon } : null
}

/** Which naming prompt is open, and what confirming it should create. */
type Prompt =
  { readonly kind: 'new-playlist'; readonly folderId: string | null } |
  { readonly kind: 'new-folder'; readonly parentId: string | null } |
  { readonly kind: 'rename'; readonly target: PlaylistTarget }

const PROMPT_TITLES: Record<Prompt['kind'], string> = {
  'new-playlist': 'New playlist',
  'new-folder':   'New playlist folder',
  'rename':       'Rename',
}

/** See module docstring. */
export function LibrarySidebar () {
  const {
    tracks, folders, playlists, playlistFolders,
    toggleFolder, addPlaylist, removePlaylist, renamePlaylist, setPlaylistIcon,
    movePlaylist, addTracksToPlaylist,
    addPlaylistFolder, removePlaylistFolder, renamePlaylistFolder,
    movePlaylistFolder, togglePlaylistFolder,
  }                        = useLibrary()
  const { queue, history } = useAudio()
  const {
    selectedFolderPath,
    selectedPlaylistId,
    selectedList,
    sidebarWidth,
    selectFolder,
    selectPlaylist,
    selectList,
    setSidebarWidth,
    openOverlay,
    setDspOpen,
  } = useUI()

  const [ menu, setMenu ]     = useState<{ target: PlaylistTarget; point: PopoverPoint } | null>(null)
  const [ prompt, setPrompt ] = useState<Prompt | null>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'

    // The drag listeners live for the length of the gesture only, so the
    // collection is disposed by the mouseup handler rather than by React.
    const drag = listenAll(document, {
      mousemove: event =>
        setSidebarWidth(clampSidebarWidth((event as MouseEvent).clientX)),
      mouseup: () => {
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
        drag.dispose()
      },
    })
  }, [ setSidebarWidth ])

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent) => {
    const delta = event.key === 'ArrowLeft'
      ? -RESIZE_STEP
      : event.key === 'ArrowRight'
        ? RESIZE_STEP
        : null
    if (delta === null)
      return

    event.preventDefault()
    setSidebarWidth(current =>
      clampSidebarWidth(current + delta))
  }, [ setSidebarWidth ])

  /**
   * Filing: a playlist or a folder dropped somewhere is a move, never a copy.
   * Dropping a folder onto itself is the gesture that misses;
   * `movePlaylistFolder` refuses the deeper version of the same mistake, its
   * own subtree.
   */
  const fileDrop = useCallback((
    target: PlaylistTarget | null,
    payload: Exclude<DragPayload, MediaDrag>
  ) => {
    // Dropped *on a playlist* means "file it where that one is", which is the
    // only reading under which the drop lands where the pointer is.
    const parentId = target === null || target.kind === 'folder'
      ? target?.id ?? null
      : playlists.find(playlist =>
        playlist.id === target.id)?.folderId ?? null

    if (payload.kind === 'playlist')
      movePlaylist(payload.id, parentId)
    else if (parentId !== payload.id)
      movePlaylistFolder(payload.id, parentId)
  }, [ playlists, movePlaylist, movePlaylistFolder ])

  /**
   * Media: dropped on a playlist it joins that list. Dropped on a folder — or
   * on the empty space below the tree — it has no list to join, so it becomes
   * one, named after what was dragged. That is the only reading of "drop an
   * album on a folder" that keeps both the album and the folder meaning what
   * they say.
   */
  const mediaDrop = useCallback((target: PlaylistTarget | null, payload: MediaDrag) => {
    const dropped = tracksForPayload(payload, tracks)
    if (dropped.length === 0)
      return

    if (target?.kind === 'playlist') {
      addTracksToPlaylist(target.id, dropped)
      return
    }

    selectPlaylist(addPlaylist(payload.label, {
      folderId: target?.kind === 'folder' ? target.id : null,
      tracks:   dropped,
    }))
  }, [ tracks, addTracksToPlaylist, addPlaylist, selectPlaylist ])

  const handleDrop = useCallback((target: PlaylistTarget | null, payload: DragPayload) => {
    if (isMediaDrag(payload))
      mediaDrop(target, payload)
    else
      fileDrop(target, payload)
  }, [ mediaDrop, fileDrop ])

  /** The folder tree accepts a drop only to lift a playlist back to the root. */
  const handleFolderTreeDrop = useCallback((payload: DragPayload) => {
    if (payload.kind === 'playlist')
      movePlaylist(payload.id, null)
    else if (payload.kind === 'playlist-folder')
      movePlaylistFolder(payload.id, null)
  }, [ movePlaylist, movePlaylistFolder ])

  const subject = menuSubject(menu?.target ?? null, playlists, playlistFolders)

  const handleIcon = useCallback((icon: PlaylistIcon) => {
    if (menu?.target.kind === 'playlist')
      setPlaylistIcon(menu.target.id, icon)
  }, [ menu, setPlaylistIcon ])

  const handleDelete = useCallback(() => {
    if (!menu)
      return

    if (menu.target.kind === 'playlist') {
      removePlaylist(menu.target.id)
      if (selectedPlaylistId === menu.target.id)
        selectPlaylist(null)
    }
    else
      removePlaylistFolder(menu.target.id)
  }, [ menu, removePlaylist, removePlaylistFolder, selectedPlaylistId, selectPlaylist ])

  /** Confirming the one prompt: whichever creation or rename opened it. */
  const handlePromptConfirm = useCallback((name: string) => {
    if (!prompt)
      return

    if (prompt.kind === 'new-playlist')
      selectPlaylist(addPlaylist(name, { folderId: prompt.folderId }))
    else if (prompt.kind === 'new-folder')
      addPlaylistFolder(name, prompt.parentId)
    else if (prompt.target.kind === 'playlist')
      renamePlaylist(prompt.target.id, name)
    else
      renamePlaylistFolder(prompt.target.id, name)

    setPrompt(null)
  }, [ prompt, addPlaylist, addPlaylistFolder, renamePlaylist, renamePlaylistFolder, selectPlaylist ])

  const listCounts: Record<PlaybackList, number> = { queue: queue.length, history: history.length }

  return <nav className='library-sidebar' aria-label='Library'>
    <span
      className='resize-handle'
      aria-label='Resize library sidebar'
      aria-orientation='vertical'
      aria-valuemin={ MIN_SIDEBAR_WIDTH }
      aria-valuemax={ MAX_SIDEBAR_WIDTH }
      aria-valuenow={ sidebarWidth }
      role='separator'
      tabIndex={ 0 }
      onMouseDown={ handleResizeStart }
      onKeyDown={ handleResizeKeyDown } />

    {/* The two lists playback itself produces. They sit above the folder tree
        because they answer "what am I listening to", which is a question one
        asks far more often than "where is this file". */}
    <details open>
      <summary>
        <Icon name='chevron-right' />
        Playback
      </summary>

      <ul className='playlist-list'>
        {PLAYBACK_LISTS.map(entry =>
          <li key={ entry.list }>
            <button
              className={ selectedList === entry.list ? 'active' : '' }
              aria-current={ selectedList === entry.list || undefined }
              type='button'
              onClick={ () =>
                selectList(entry.list) }>
              <Icon name={ entry.icon } />
              <span className='name'>{entry.label}</span>
              <small>{listCounts[entry.list]}</small>
            </button>
          </li>
        )}
      </ul>
    </details>

    <details open>
      <summary>
        <Icon name='chevron-right' />
        Folders
      </summary>

      <FolderTree
        folders={ folders }
        selectedPath={ selectedFolderPath }
        onSelect={ selectFolder }
        onToggle={ toggleFolder }
        onDrop={ handleFolderTreeDrop } />
    </details>

    <details open>
      {/* The "new playlist" controls are the last list items rather than
            buttons inside <summary> — nesting a button in a summary nests
            two buttons in the a11y tree. */}
      <summary>
        <Icon name='chevron-right' />
        Playlists
      </summary>

      <PlaylistTree
        playlists={ playlists }
        folders={ playlistFolders }
        selectedId={ selectedPlaylistId }
        onSelect={ selectPlaylist }
        onToggle={ togglePlaylistFolder }
        onDrop={ handleDrop }
        onContextMenu={ (target, point) =>
          setMenu({ target, point }) } />

      <ul className='playlist-list'>
        <li>
          <button
            className='add-playlist'
            type='button'
            onClick={ () =>
              setPrompt({ kind: 'new-playlist', folderId: null }) }>
            <Icon name='add' />
            <span className='name'>New playlist</span>
          </button>
        </li>

        <li>
          <button
            className='add-playlist'
            type='button'
            onClick={ () =>
              setPrompt({ kind: 'new-folder', parentId: null }) }>
            <Icon name='folder' />
            <span className='name'>New folder</span>
          </button>
        </li>
      </ul>
    </details>

    {/* Settings used to be a titlebar tab. It sits here now because it is the
        one destination left, and this is where the rest of the library's
        navigation already lives. */}
    <footer className='sidebar-footer'>
      {/* The one door to the DSP page that does not require a track: the
          player bar's own promote button is disabled when nothing is playing,
          and an EQ curve is worth editing in silence. Opening the layer first
          means the overlay arrives with it already showing — both are plain
          setters, so React batches them into one commit. It is `setDspOpen`
          rather than a toggle because this entry has to *arrive* on the page
          whatever state the overlay was last left in. */}
      <button
        className='sidebar-action'
        type='button'
        onClick={ () => {
          setDspOpen(true)
          openOverlay('player')
        } }>
        <Icon name='dsp' />
        <span className='name'>DSP Processing</span>
      </button>

      <button
        className='sidebar-action settings-toggle'
        type='button'
        onClick={ () =>
          openOverlay('settings') }>
        <Icon name='settings' />
        <span className='name'>Settings</span>
      </button>
    </footer>

    <PlaylistMenu
      point={ subject ? menu?.point ?? null : null }
      subject={ subject }
      onIcon={ handleIcon }
      onRename={ () =>
        menu && setPrompt({ kind: 'rename', target: menu.target }) }
      onNewPlaylist={ () =>
        menu && setPrompt({ kind: 'new-playlist', folderId: menu.target.id }) }
      onNewFolder={ () =>
        menu && setPrompt({ kind: 'new-folder', parentId: menu.target.id }) }
      onDelete={ handleDelete }
      onClose={ () =>
        setMenu(null) } />

    <PromptDialog
      open={ prompt !== null }
      title={ prompt ? PROMPT_TITLES[prompt.kind] : '' }
      placeholder='Name…'
      onConfirm={ handlePromptConfirm }
      onClose={ () =>
        setPrompt(null) } />
  </nav>
}
