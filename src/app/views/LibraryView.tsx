import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track } from '../contexts'
import { useMemo, useEffect, useState } from 'react'
import { useLibraryScanner } from '../hooks'
import { scanDirectory } from '../services'
import { Input } from '../components/atomic'
import { FolderTree } from '../components/composite/FolderTree'
import { TrackTable } from '../components/composite/TrackTable'
import './LibraryView.css'


export function LibraryView () {
  const { selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist } = useUI()
  const { folders, filteredTracks, playlists, addPlaylist, searchQuery, setSearchQuery, selectTrack, setTracks, setLoading, isLoading, toggleFolder } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths } = useSettings()
  const { scanLibrary } = useLibraryScanner()

  const [ foldersCollapsed, setFoldersCollapsed ] = useState(false)
  const [ playlistsCollapsed, setPlaylistsCollapsed ] = useState(false)

  useEffect(() => {
    if (libraryPaths.length > 0 && folders.length === 0) {
      scanLibrary()
    }
  }, [ libraryPaths, folders.length, scanLibrary ])

  const handleFolderSelect = async (path: string) => {
    selectFolder(path)
    setLoading(true)

    const { tracks } = await scanDirectory(path)
    setTracks(tracks)
    setLoading(false)
  }

  const handleFolderToggle = (path: string) => {
    toggleFolder(path)
  }

  const handleTrackPlay = (track: Track, index: number) => {
    selectTrack(index)
    play(track)
  }

  const handleNewPlaylist = () => {
    const name = window.prompt('Playlist name:')
    if (name?.trim()) {
      addPlaylist(name.trim())
    }
  }

  const displayTracks = useMemo(() => {
    if (selectedPlaylistId) {
      return playlists.find(p =>
        p.id === selectedPlaylistId)?.tracks ?? []
    }
    return filteredTracks
  }, [ selectedPlaylistId, playlists, filteredTracks ])

  return (
    <div className='library-view'>
      <aside className='library-sidebar'>

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

      </aside>

      <section className='library-main'>
        <header className='view-header'>
          <h2>
            {selectedPlaylistId
              ? (playlists.find(p =>
                p.id === selectedPlaylistId)?.name ?? 'Playlist')
              : 'Library'
            }
          </h2>

          <div className='search-container'>
            <Input
              type='search'
              placeholder='Search tracks...'
              value={searchQuery}
              onChange={e =>
                setSearchQuery(e.target.value)}
            />
          </div>
        </header>

        <div className='tracks-container'>
          {displayTracks.length === 0 && !isLoading
            ? <div className='status-message'>
              <p>No tracks found</p>
              <small>
                {selectedPlaylistId
                  ? 'This playlist is empty'
                  : 'Select a folder or add library paths in Settings'
                }
              </small>
            </div>
            : <TrackTable
              tracks={displayTracks}
              isLoading={isLoading}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handleTrackPlay}
            />
          }
        </div>
      </section>
    </div>
  )
}
