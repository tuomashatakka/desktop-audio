/**
 * LibrarySidebar — folder tree + playlists.
 *
 * Mounted once by AppLayout and hidden or revealed from shell state in CSS.
 * Both sections are native `<details>`, so their collapse is platform
 * behaviour rather than duplicated React state.
 */
import {
  clampSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  useLibrary,
  useUI,
} from '../contexts'
import { FolderTree } from '../components/composite/FolderTree'
import { Icon } from '../components/atomic'
import { useCallback } from 'react'
import { listenAll } from '../utils/events'


/** Pixels per arrow-key press on the resize handle. */
const RESIZE_STEP = 10

/** See module docstring. */
export function LibrarySidebar () {
  const { registry, playlists, toggleFolder, addPlaylist } = useLibrary()
  const {
    selectedFolderPath,
    selectedPlaylistId,
    sidebarWidth,
    selectFolder,
    selectPlaylist,
    setSidebarWidth,
    openOverlay,
    setPlayerMode,
  } = useUI()

  const folders = Array.from(registry.folders.values())

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

    <details open>
      <summary>
        <Icon name='chevron-right' />
        Folders
      </summary>

      <FolderTree
        folders={ folders }
        selectedPath={ selectedFolderPath }
        onSelect={ selectFolder }
        onToggle={ toggleFolder } />
    </details>

    <details open>
      {/* The "new playlist" control is the last list item rather than a
            button inside <summary> — nesting a button in a summary nests
            two buttons in the a11y tree. */}
      <summary>
        <Icon name='chevron-right' />
        Playlists
      </summary>

      <ul className='playlist-list'>
        {playlists.map(playlist =>
          <li key={ playlist.id }>
            <button
              className={ selectedPlaylistId === playlist.id ? 'active' : '' }
              aria-current={ selectedPlaylistId === playlist.id || undefined }
              type='button'
              onClick={ () =>
                selectPlaylist(playlist.id) }>
              <Icon name='music' />
              <span className='name'>{playlist.name}</span>
              <small>{playlist.tracks.length}</small>
            </button>
          </li>
        )}

        <li>
          <button
            className='add-playlist'
            type='button'
            onClick={ () =>
              addPlaylist('New Playlist') }>
            <Icon name='add' />
            <span className='name'>New playlist</span>
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
          and an EQ curve is worth editing in silence. Setting the mode first
          means the overlay opens straight onto it — both are plain setters, so
          React batches them into one commit. */}
      <button
        className='sidebar-action'
        type='button'
        onClick={ () => {
          setPlayerMode('dsp')
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
  </nav>
}
