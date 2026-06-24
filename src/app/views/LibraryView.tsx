import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track } from '../contexts'
import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useLibraryScanner } from '../hooks'
import { Input, PromptDialog, Popover } from '../components/atomic'
import { FolderTree } from '../components/composite/FolderTree'
import { TrackTable } from '../components/composite/TrackTable'
import { useHost } from '../data'
import type { SerializableMenuItem } from '../services/types'
import type { Grouping, Density } from '../contexts'


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


export function LibraryView () {
  const { sidebarOpen, toggleSidebar, setEditingTrack, selectedFolderPath, selectedPlaylistId, selectFolder, selectPlaylist, density, setDensity, grouping, setGrouping } = useUI()
  const { registry, filteredTracks, playlists, addPlaylist, searchQuery, setSearchQuery, selectTrack, isLoading, toggleFolder } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths } = useSettings()
  const { scanLibrary } = useLibraryScanner()
  const host = useHost()

  const folders = registry.folders

  const [ foldersCollapsed, setFoldersCollapsed ] = useState(false)
  const [ playlistsCollapsed, setPlaylistsCollapsed ] = useState(false)
  const [ promptOpen, setPromptOpen ] = useState(false)
  const [ headerVisible, setHeaderVisible ] = useState(true)
  const lastScrollY      = useRef(0)
  const contextTrackRef  = useRef<Track | null>(null)
  const [ configOpen, setConfigOpen ] = useState(false)
  const configBtnRef     = useRef<HTMLButtonElement>(null)

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
    host.showContextMenu(
      CONTEXT_MENU_ITEMS,
      window.screenX + rect.left,
      window.screenY + rect.bottom + 4,
      MENU_WIDTH,
      MENU_HEIGHT,
    )
  }, [ host ])

  useEffect(() =>
    host.onContextMenuAction((index: number) => {
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
    }), [ handleTrackPlay, setEditingTrack, host ])

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

  const noTracksFound = <div className='status-message'>
    <p>No tracks found</p>

    <small>
      {selectedPlaylistId
        ? 'This playlist is empty'
        : 'Select a folder or add library paths in Settings'}
    </small>
  </div>

  return (
    <div className='library-view'>

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

          <div className='header-controls cluster'>
            <Input
              wrapperClass='search-input'
              type='search'
              placeholder='Search tracks...'
              value={searchQuery}
              onChange={e =>
                setSearchQuery(e.target.value)}
            />

            {/* Density toggle buttons */}
            <div className='density-toggle' role='radiogroup' aria-label='Row density'>
              {([ 'compact', 'normal', 'relaxed' ] as Density[]).map(d =>
                <button
                  key={d}
                  role='radio'
                  aria-checked={density === d}
                  className={density === d ? 'active' : ''}
                  onClick={() =>
                    setDensity(d)}
                  title={`${d} density`}
                >
                  {d === 'compact' ? '≡' : d === 'normal' ? '≢' : '='}
                </button>
              )}
            </div>

            {/* Config caret button */}
            <button
              ref={configBtnRef}
              className='config-caret-btn'
              onClick={() =>
                setConfigOpen(o =>
                  !o)}
              aria-label='View options'
              title='View options'
            >
              ⌄
            </button>

            {configBtnRef.current &&
              <Popover
                open={configOpen}
                anchorRect={configBtnRef.current.getBoundingClientRect()}
                onClose={() =>
                  setConfigOpen(false)}
                placement='bottom'
              >
                <div className='config-dropdown'>
                  <fieldset>
                    <legend>Grouping</legend>

                    {([ 'none', 'album', 'artist', 'path' ] as Grouping[]).map(g =>
                      <label key={g}>
                        <input
                          type='radio'
                          name='grouping'
                          value={g}
                          checked={grouping === g}
                          onChange={() =>
                            setGrouping(g)}
                        />

                        {g === 'none' ? 'None' : g === 'album' ? 'By Album' : g === 'artist' ? 'By Artist' : 'By Path'}
                      </label>
                    )}
                  </fieldset>
                </div>
              </Popover>
            }
          </div>
        </header>

        <div className='tracks-container'>
          {displayTracks.length === 0 && !isLoading
            ? noTracksFound
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
