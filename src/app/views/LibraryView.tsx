import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track } from '../contexts'
import { useMemo, useEffect, useState } from 'react'
import { useLibraryScanner } from '../hooks'
import { scanDirectory } from '../services'
import { Input, PromptDialog } from '../components/atomic'
import { FolderTree } from '../components/composite/FolderTree'
import { TrackTable } from '../components/composite/TrackTable'
import { ContextMenu } from '../components/composite/ContextMenu'
import type { ContextMenuItem } from '../components/composite/ContextMenu'


// eslint-disable-next-line complexity
export function LibraryView () {
  const { selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist, sidebarOpen, toggleSidebar, setEditingTrack } = useUI()
  const { folders, filteredTracks, playlists, addPlaylist, searchQuery, setSearchQuery, selectTrack, setTracks, setLoading, isLoading, toggleFolder } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths } = useSettings()
  const { scanLibrary } = useLibraryScanner()

  const [ foldersCollapsed, setFoldersCollapsed ] = useState(false)
  const [ playlistsCollapsed, setPlaylistsCollapsed ] = useState(false)
  const [ promptOpen, setPromptOpen ] = useState(false)
  const [ contextRect, setContextRect ] = useState<DOMRect | null>(null)
  const [ contextTrack, setContextTrack ] = useState<Track | null>(null)

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

  const handleNewPlaylist = () =>
    setPromptOpen(true)

  const handleContextMenu = (track: Track, rect: DOMRect) => {
    setContextTrack(track)
    setContextRect(rect)
  }

  const contextMenuItems: readonly ContextMenuItem[] = contextTrack
    ? [
      { label:  'Play',
        icon:   '▶',
        action: () =>
          handleTrackPlay(contextTrack, 0) },
      { label:  'Add to Playlist',
        icon:   '♩',
        action: () =>
          setPromptOpen(true) },
      { separator: true },
      { label:  'Edit Tags',
        icon:   '✎',
        action: () =>
          setEditingTrack(contextTrack.id) },
    ]
    : []

  const displayTracks = useMemo(() => {
    if (selectedPlaylistId) {
      return playlists.find(p =>
        p.id === selectedPlaylistId)?.tracks ?? []
    }
    return filteredTracks
  }, [ selectedPlaylistId, playlists, filteredTracks ])

  return (
    <div className='library-view'>
      <aside className={`library-sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>

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
          <button
            className='sidebar-toggle-btn'
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={sidebarOpen}
          >
            <span className={`sidebar-toggle-chevron ${sidebarOpen ? 'open' : ''}`}>‹</span>
          </button>

          <h2>
            {selectedPlaylistId
              ? playlists.find(p =>
                p.id === selectedPlaylistId)?.name ?? 'Playlist'
              : 'Library'
            }
          </h2>

          <Input
            wrapperClass='search-input'
            type='search'
            placeholder='Search tracks...'
            value={searchQuery}
            onChange={e =>
              setSearchQuery(e.target.value)}
          />
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
              onContextMenu={handleContextMenu}
            />
          }
        </div>
      </section>

      <ContextMenu
        items={contextMenuItems}
        anchorRect={contextRect}
        onClose={() => {
          setContextRect(null); setContextTrack(null)
        }}
      />

      <PromptDialog
        open={promptOpen}
        title='New Playlist'
        placeholder='Playlist name...'
        onConfirm={name =>
          addPlaylist(name)}
        onClose={() =>
          setPromptOpen(false)}
      />
    </div>
  )
}
