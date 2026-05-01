import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track } from '../contexts'
import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useLibraryScanner } from '../hooks'
import { Input, PromptDialog } from '../components/atomic'
import { FolderTree } from '../components/composite/FolderTree'
import { TrackTable } from '../components/composite/TrackTable'
import { useBridge } from '../data'
import type { SerializableMenuItem } from '../services/types'


const CONTEXT_MENU_ITEMS: SerializableMenuItem[] = [
  { label: 'Play', icon: '▶' },
  { label: 'Add to Playlist', icon: '♩' },
  { separator: true },
  { label: 'Edit Tags', icon: '✎' },
]

const ITEM_HEIGHT      = 32
const SEPARATOR_HEIGHT = 9
const PADDING          = 8
const MENU_WIDTH       = 200
const MENU_HEIGHT      = CONTEXT_MENU_ITEMS.filter(i =>
  !i.separator).length * ITEM_HEIGHT +
                       CONTEXT_MENU_ITEMS.filter(i =>
                         i.separator).length * SEPARATOR_HEIGHT +
                       PADDING * 2

// eslint-disable-next-line complexity
export function LibraryView () {
  const { sidebarOpen, toggleSidebar, setEditingTrack, selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist } = useUI()
  const { registry, filteredTracks, playlists, addPlaylist, searchQuery, setSearchQuery, selectTrack, isLoading, toggleFolder } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths } = useSettings()
  const { scanLibrary } = useLibraryScanner()
  const bridge = useBridge()

  const folders = registry.folders

  const [ foldersCollapsed, setFoldersCollapsed ] = useState(false)
  const [ playlistsCollapsed, setPlaylistsCollapsed ] = useState(false)
  const [ promptOpen, setPromptOpen ] = useState(false)
  const [ headerVisible, setHeaderVisible ] = useState(true)
  const lastScrollY      = useRef(0)
  const contextTrackRef  = useRef<Track | null>(null)

  const handleScroll = useCallback((e: Event) => {
    const el = e.target as HTMLElement
    const dir = el.scrollTop > lastScrollY.current ? 'down' : 'up'
    lastScrollY.current = el.scrollTop
    if (dir === 'down' && el.scrollTop > 40)
      setHeaderVisible(false)
    else
      setHeaderVisible(true)
  }, [])

  const headerTitle = selectedPlaylistId
    ? playlists.find(p =>
      p.id === selectedPlaylistId)?.name ?? 'Library'
    : selectedFolderPath
      ? selectedFolderPath.split('/').filter(Boolean)
        .at(-1) ?? 'Library'
      : 'Library'

  useEffect(() => {
    if (libraryPaths.length > 0) {
      scanLibrary()
    }
  }, [ libraryPaths, scanLibrary ])

  const handleFolderSelect = (path: string) => {
    selectFolder(path)
  }

  const handleFolderToggle = (path: string) => {
    toggleFolder(path)
  }

  const handleTrackPlay = useCallback((track: Track, index: number) => {
    selectTrack(index)
    play(track)
  }, [ selectTrack, play ])

  const handleNewPlaylist = () =>
    setPromptOpen(true)

  const handleContextMenu = useCallback((track: Track, rect: DOMRect) => {
    contextTrackRef.current = track
    bridge.showContextMenu(
      CONTEXT_MENU_ITEMS,
      window.screenX + rect.left,
      window.screenY + rect.bottom + 4,
      MENU_WIDTH,
      MENU_HEIGHT,
    )
  }, [ bridge ])

  useEffect(() =>
    bridge.onContextMenuAction((index: number) => {
      const track = contextTrackRef.current
      if (!track)
        return
      switch (index) {
        case 0: handleTrackPlay(track, 0); break
        case 1: setPromptOpen(true); break
        // index 2 is the separator — no action
        case 3: setEditingTrack(track.id); break
      }
      contextTrackRef.current = null
    }), [ handleTrackPlay, setEditingTrack, bridge ])

  const displayTracks = useMemo(() => {
    if (selectedPlaylistId) {
      return playlists.find(p =>
        p.id === selectedPlaylistId)?.tracks ?? []
    }
    if (selectedFolderPath) {
      return filteredTracks.filter(t =>
        t.path.startsWith(selectedFolderPath))
    }
    return filteredTracks
  }, [ selectedPlaylistId, selectedFolderPath, playlists, filteredTracks ])

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
              folders={Array.from(registry.folders.values()) as unknown as { id: string; name: string; path: string; children: readonly { id: string; name: string; path: string; children: readonly any[]; expanded: boolean }[]; expanded: boolean }[]}
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
        <header className={`view-header ${headerVisible ? '' : 'header-hidden'}`}>
          <button
            className='sidebar-toggle-btn'
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={sidebarOpen}
          >
            <span className={`sidebar-toggle-chevron ${sidebarOpen ? 'open' : ''}`}>‹</span>
          </button>

          <h2>{headerTitle}</h2>

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
              onScroll={handleScroll}
            />
          }
        </div>
      </section>

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
