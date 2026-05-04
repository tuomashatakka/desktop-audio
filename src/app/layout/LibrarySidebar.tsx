import { useLibrary, useUI } from '../contexts'
import { FolderTree } from '../components/composite/FolderTree'
import type { FolderEntry } from '../models'
import { useState, useCallback, useRef } from 'react'


export function LibrarySidebar () {
  const { registry, playlists, toggleFolder, addPlaylist } = useLibrary()
  const { selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist, sidebarOpen } = useUI()

  const [ foldersCollapsed, setFoldersCollapsed ] = useState(false)
  const [ playlistsCollapsed, setPlaylistsCollapsed ] = useState(false)
  const [ sidebarWidth, setSidebarWidth ] = useState(220)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)

  const folders = Array.from(registry.folders.values())

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current)
        return

      const newWidth = Math.max(180, Math.min(400, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleFolderSelect = (path: string) => {
    selectFolder(path)
  }

  const handleFolderToggle = (path: string) => {
    toggleFolder(path)
  }

  const handleNewPlaylist = () => {
    addPlaylist('New Playlist')
  }

  return (
    <div
      ref={sidebarRef}
      className='library-sidebar'
      style={{
        width:    sidebarOpen ? sidebarWidth : 0,
        minWidth: sidebarOpen ? 180 : 0,
        overflow: sidebarOpen ? 'auto' : 'hidden',
      }}
    >
      {sidebarOpen &&
        <>
          <div
            className='sidebar-resize-handle'
            onMouseDown={handleMouseDown}
          />

          {/* ─── Folders section ───────────────────── */}
          <div className='sidebar-section'>
            <button
              className='sidebar-section-header'
              onClick={() =>
                setFoldersCollapsed(c =>
                  !c)}
              aria-expanded={!foldersCollapsed}
            >
              <span className={`section-chevron ${foldersCollapsed ? '' : 'open'}`}>›</span>
              <span>Folders</span>
            </button>

            {!foldersCollapsed &&
        <FolderTree
          folders={folders}
          selectedPath={selectedFolderPath}
          onSelect={handleFolderSelect}
          onToggle={handleFolderToggle}
        />
            }
          </div>

          {/* ─── Playlists section ─────────────────── */}
          <div className='sidebar-section'>
            <button
              className='sidebar-section-header'
              onClick={() =>
                setPlaylistsCollapsed(c =>
                  !c)}
              aria-expanded={!playlistsCollapsed}
            >
              <span className={`section-chevron ${playlistsCollapsed ? '' : 'open'}`}>›</span>
              <span>Playlists</span>

              <button
                className='playlist-new-btn'
                onClick={e => {
                  e.stopPropagation()
                  handleNewPlaylist()
                }}
                title='New playlist'
                aria-label='New playlist'
              >
                +
              </button>
            </button>

            {!playlistsCollapsed &&
          <nav className='playlist-list'>
            {playlists.length === 0
              ? <span className='playlist-empty'>No playlists yet</span>
              : playlists.map(playlist =>
                <button
                  key={playlist.id}
                  className={`playlist-item ${selectedPlaylistId === playlist.id ? 'active' : ''}`}
                  onClick={() =>
                    selectPlaylist(playlist.id)}
                >
                  <span className='playlist-icon' aria-hidden='true'>♩</span>
                  <span className='playlist-name'>{playlist.name}</span>
                  <span className='playlist-count'>{playlist.tracks.length}</span>
                </button>
              )
            }
          </nav>
            }
          </div>
        </>
      }
    </div>
  )
}
