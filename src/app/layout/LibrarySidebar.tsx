import { useLibrary, useUI } from '../contexts'
import { FolderTree } from '../components/composite/FolderTree'
import type { FolderEntry } from '../models'
import { useState } from 'react'

export function LibrarySidebar () {
  const { registry, playlists, toggleFolder, addPlaylist } = useLibrary()
  const { selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist } = useUI()

  const [ foldersCollapsed, setFoldersCollapsed ] = useState(false)
  const [ playlistsCollapsed, setPlaylistsCollapsed ] = useState(false)

  const folders = Array.from(registry.folders.values())

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
    <div className='library-sidebar'>
      {/* ─── Folders section ───────────────────── */}
      <div className='sidebar-section'>
        <button
          className='sidebar-section-header'
          onClick={() => setFoldersCollapsed(c => !c)}
          aria-expanded={!foldersCollapsed}
        >
          <span className={`section-chevron ${foldersCollapsed ? '' : 'open'}`}>›</span>
          <span>Folders</span>
        </button>

        {!foldersCollapsed &&
          <FolderTree
            folders={folders as unknown as { id: string; name: string; path: string; children: readonly { id: string; name: string; path: string; children: readonly any[]; expanded: boolean }[]; expanded: boolean }[]}
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
          onClick={() => setPlaylistsCollapsed(c => !c)}
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
                  onClick={() => selectPlaylist(playlist.id)}
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
    </div>
  )
}
