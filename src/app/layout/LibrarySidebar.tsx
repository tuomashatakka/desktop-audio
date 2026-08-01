/**
 * LibrarySidebar — folder tree + playlists.
 *
 * Only mounted while the sidebar is open (see AppLayout), so there is no
 * internal open/closed state. Both sections are native `<details>`, so their
 * collapse is CSS/platform behaviour rather than React state.
 */
import { useLibrary, useUI } from '../contexts'
import { FolderTree } from '../components/composite/FolderTree'
import { useState, useCallback } from 'react'


const MIN_WIDTH = 180
const MAX_WIDTH = 400

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

  return (
    <nav className='library-sidebar' style={{ width }} aria-label='Library'>
      <span
        className='resize-handle'
        onMouseDown={handleResizeStart}
        role='separator'
        aria-orientation='vertical'
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
