import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track, Grouping, Density } from '../contexts'
import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useLibraryScanner } from '../hooks'
import { Input, PromptDialog, Popover } from '../components/atomic'
import { TrackTable } from '../components/composite/TrackTable'
import { Breadcrumbs } from '../components/composite/Breadcrumbs'
import { useHost } from '../data'
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

/** Scroll depth before the view header starts collapsing. */
const HEADER_HIDE_AFTER = 48

const DENSITIES: readonly Density[] = [ 'compact', 'normal', 'relaxed' ]
const DENSITY_GLYPH: Record<Density, string> = { compact: '≡', normal: '≢', relaxed: '=' }

const GROUPINGS: readonly Grouping[] = [ 'none', 'album', 'artist', 'path' ]
const GROUPING_LABEL: Record<Grouping, string> = {
  none:   'None',
  album:  'By Album',
  artist: 'By Artist',
  path:   'By Path',
}


export function LibraryView () {
  const { sidebarOpen, toggleSidebar, setEditingTrack, selectedFolderPath, selectedPlaylistId, selectFolder, density, setDensity, grouping, setGrouping } = useUI()
  const { filteredTracks, playlists, addPlaylist, searchQuery, setSearchQuery, selectTrack, isLoading } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths } = useSettings()
  const host = useHost()

  // Mounted for its side effects: cache hydration + background rescan.
  useLibraryScanner()

  const [ promptOpen, setPromptOpen ] = useState(false)
  const [ configOpen, setConfigOpen ] = useState(false)
  const [ headerHidden, setHeaderHidden ] = useState(false)
  const lastScrollY     = useRef(0)
  const contextTrackRef = useRef<Track | null>(null)
  const configBtnRef    = useRef<HTMLButtonElement>(null)

  const activePlaylist = selectedPlaylistId
    ? playlists.find(p =>
      p.id === selectedPlaylistId)
    : undefined

  /**
   * Collapse the view header on the way down, bring it back on the way up.
   * The column header is sticky inside the same scroller, so it simply rides
   * up into the vacated space and pins there.
   */
  const handleScroll = useCallback((e: Event) => {
    const y = (e.target as HTMLElement).scrollTop
    const goingDown = y > lastScrollY.current
    lastScrollY.current = y
    setHeaderHidden(goingDown && y > HEADER_HIDE_AFTER)
  }, [])

  const handleTrackPlay = useCallback((track: Track, index: number) => {
    selectTrack(index)
    play(track)
  }, [ selectTrack, play ])

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
    if (activePlaylist)
      return activePlaylist.tracks
    if (selectedFolderPath)
      return filteredTracks.filter(t =>
        t.path.startsWith(selectedFolderPath))
    return filteredTracks
  }, [ activePlaylist, selectedFolderPath, filteredTracks ])

  const scanning = isLoading && displayTracks.length > 0

  return (
    <section className='library' data-header-hidden={headerHidden || undefined}>

      {/* Grid wrapper purely so the header can animate to a zero height
          without hard-coding what that height is (1fr -> 0fr). */}
      <div className='view-header-slot'>
        <header className='view-header'>
          <button
            type='button'
            className='menu-toggle'
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={sidebarOpen}
          >
            <span aria-hidden='true' />
            <span aria-hidden='true' />
            <span aria-hidden='true' />
          </button>

          {activePlaylist
            ? <h2>{activePlaylist.name}</h2>
            : <Breadcrumbs
              path={selectedFolderPath}
              roots={libraryPaths}
              onNavigate={selectFolder}
            />
          }

          {scanning && <small className='scan-status' role='status'>Scanning…</small>}

          <div className='view-controls'>
            <Input
              wrapperClass='search-input'
              type='search'
              placeholder='Search tracks...'
              value={searchQuery}
              onChange={e =>
                setSearchQuery(e.target.value)}
            />

            <fieldset className='density-toggle'>
              <legend>Row density</legend>

              {DENSITIES.map(d =>
                <label key={d} title={`${d} density`}>
                  <input
                    type='radio'
                    name='density'
                    value={d}
                    aria-label={`${d} density`}
                    checked={density === d}
                    onChange={() =>
                      setDensity(d)}
                  />

                  <span aria-hidden='true'>{DENSITY_GLYPH[d]}</span>
                </label>
              )}
            </fieldset>

            <button
              type='button'
              ref={configBtnRef}
              className='config-toggle'
              onClick={() =>
                setConfigOpen(o =>
                  !o)}
              aria-label='View options'
              aria-expanded={configOpen}
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
              <fieldset className='config-menu'>
                <legend>Grouping</legend>

                {GROUPINGS.map(g =>
                  <label key={g}>
                    <input
                      type='radio'
                      name='grouping'
                      value={g}
                      checked={grouping === g}
                      onChange={() =>
                        setGrouping(g)}
                    />

                    {GROUPING_LABEL[g]}
                  </label>
                )}
              </fieldset>
            </Popover>
            }
          </div>
        </header>
      </div>

      {displayTracks.length === 0 && !isLoading
        ? <p className='status-message'>
          No tracks found

          <small>
            {activePlaylist
              ? 'This playlist is empty'
              : 'Select a folder or add library paths in Settings'}
          </small>
        </p>
        : <TrackTable
          tracks={displayTracks}
          isLoading={isLoading}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlay={handleTrackPlay}
          onContextMenu={handleContextMenu}
          onNavigate={selectFolder}
          roots={libraryPaths}
          onScroll={handleScroll}
        />
      }

      <PromptDialog
        open={promptOpen}
        title='New Playlist'
        placeholder='Playlist name...'
        onConfirm={name =>
          addPlaylist(name)}
        onClose={() =>
          setPromptOpen(false)}
      />
    </section>
  )
}
