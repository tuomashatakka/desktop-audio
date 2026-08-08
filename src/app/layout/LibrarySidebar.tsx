/**
 * LibrarySidebar — folder tree + playlists.
 *
 * Mounted once by AppLayout and hidden or revealed from shell state in CSS.
 * Both sections are native `<details>`, so their collapse is platform
 * behaviour rather than duplicated React state.
 */
import { useLibrary, useUI } from '../contexts'
import { FolderTree } from '../components/composite/FolderTree'
import { useState, useCallback } from 'react'


const MIN_WIDTH = 180
const MAX_WIDTH = 400
const RESIZE_STEP = 10

/** See module docstring. */
export function LibrarySidebar () {
  const { registry, playlists, toggleFolder, addPlaylist } = useLibrary()
  const { selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist, setView } = useUI()

  const [ width, setWidth ] = useState(220)

  const folders = Array.from(registry.folders.values())

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) =>
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, ev.clientX)))

    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent) => {
    const delta = event.key === 'ArrowLeft'
      ? -RESIZE_STEP
      : event.key === 'ArrowRight'
        ? RESIZE_STEP
        : null
    if (delta === null)
      return

    event.preventDefault()
    setWidth(current =>
      Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, current + delta)))
  }, [])

  return (
    <nav className='library-sidebar' style={{ width }} aria-label='Library'>
      <span
        className='resize-handle'
        onMouseDown={handleResizeStart}
        role='separator'
        tabIndex={0}
        aria-label='Resize library sidebar'
        aria-orientation='vertical'
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        onKeyDown={handleResizeKeyDown}
      />

      <details open>
        <summary>Folders</summary>

        <FolderTree
          folders={folders}
          selectedPath={selectedFolderPath}
          onSelect={path => {
            selectFolder(path)
            setView('library')
          }}
          onToggle={toggleFolder}
        />
      </details>

      <details open>
        {/* The "new playlist" control is the last list item rather than a
            button inside <summary> — nesting a button in a summary nests
            two buttons in the a11y tree. */}
        <summary>Playlists</summary>

        <ul className='playlist-list'>
          {playlists.map(playlist =>
            <li key={playlist.id}>
              <button
                type='button'
                className={selectedPlaylistId === playlist.id ? 'active' : ''}
                aria-current={selectedPlaylistId === playlist.id || undefined}
                onClick={() => {
                  selectPlaylist(playlist.id)
                  setView('library')
                }}
              >
                <span aria-hidden='true'>♩</span>
                <span className='name'>{playlist.name}</span>
                <small>{playlist.tracks.length}</small>
              </button>
            </li>
          )}

          <li>
            <button type='button'
              className='add-playlist'
              onClick={() =>
                addPlaylist('New Playlist')}>
              <span aria-hidden='true'>+</span>
              <span className='name'>New playlist</span>
            </button>
          </li>
        </ul>
      </details>
    </nav>
  )
}
