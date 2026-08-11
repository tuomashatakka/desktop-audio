import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useUI, useLibrary, useAudio, useSettings, isGridDensity } from '../contexts'
import type { GroupScope, Track } from '../contexts'
import { useLibraryScanner } from '../hooks'
import { Button, PromptDialog } from '../components/atomic'
import { TrackTable } from '../components/composite/TrackTable'
import { LibraryGrid } from '../components/composite/LibraryGrid'
import { LibraryToolbar } from './LibraryToolbar'
import { bucketKey } from '../utils/grouping'
import { useHost } from '../data'
import type { ContextMenuPoint, SerializableMenuItem } from '../services/types'


const CONTEXT_MENU_ITEMS: SerializableMenuItem[] = [
  { label: 'Play', icon: 'play' },
  { label: 'Add to Playlist', icon: 'music' },
  { separator: true },
  { label: 'Edit Tags', icon: 'edit' },
]

const ITEM_HEIGHT      = 32
const SEPARATOR_HEIGHT = 9
const PADDING          = 8
const MENU_WIDTH       = 200
const MENU_HEIGHT      = CONTEXT_MENU_ITEMS.filter(item =>
  !item.separator).length * ITEM_HEIGHT +
                       CONTEXT_MENU_ITEMS.filter(item =>
                         item.separator).length * SEPARATOR_HEIGHT +
                       PADDING * 2

/**
 * The library: its toolbar, and the collection as either a list or a grid.
 *
 * Which one is a function of density — the two `grid-*` values *are* the grid
 * — except that a drilled-into scope always renders as a list, since drilling
 * in is how you ask to see the tracks. Density is deliberately left alone
 * while that is true, so backing out restores the card size you chose.
 */
export function LibraryView () {
  const {
    setEditingTrack, selectedFolderPath, selectedPlaylistId, selectedGroup,
    selectFolder, selectGroup, density, grouping, openOverlay,
  }                                                                        = useUI()
  const { filteredTracks, playlists, addPlaylist, selectTrack, isLoading } = useLibrary()
  const { playQueue, currentTrack, isPlaying }                             = useAudio()
  const { libraryPaths, theme }                                            = useSettings()
  const host                                                               = useHost()

  const { isInitialLoading } = useLibraryScanner()

  const [ promptOpen, setPromptOpen ] = useState(false)
  const contextTrackRef               = useRef<Track | null>(null)

  const goToLibrarySettings = useCallback(() => {
    openOverlay('settings')
    location.hash = '#settings-library'
  }, [ openOverlay ])

  const activePlaylist = selectedPlaylistId
    ? playlists.find(playlist =>
      playlist.id === selectedPlaylistId)
    : undefined

  /**
   * A playlist is its own list. Otherwise the folder and the drilled-into
   * group are *both* applied — a card counted inside a folder has to open the
   * same set it advertised.
   */
  const displayTracks = useMemo(() => {
    if (activePlaylist)
      return activePlaylist.tracks

    let tracks = filteredTracks
    if (selectedFolderPath)
      tracks = tracks.filter(track =>
        track.path.startsWith(selectedFolderPath))
    if (selectedGroup)
      tracks = tracks.filter(track =>
        bucketKey(track, selectedGroup.grouping) === selectedGroup.key)
    return tracks
  }, [ activePlaylist, selectedGroup, selectedFolderPath, filteredTracks ])

  /**
   * Starting a track queues the list it came from, not the whole library.
   *
   * `index` is the row's position in the table's *sorted* order, which is not
   * necessarily its position in `displayTracks` — the queue has to be built
   * from the latter, so the track is looked up rather than trusted.
   */
  const handleTrackPlay = useCallback((track: Track, index: number) => {
    selectTrack(index)

    const queueIndex = displayTracks.findIndex(candidate =>
      candidate.id === track.id)
    playQueue(displayTracks, queueIndex >= 0 ? queueIndex : 0)
  }, [ selectTrack, playQueue, displayTracks ])

  const handleQueue = useCallback((tracks: readonly Track[], startIndex: number) => {
    playQueue(tracks, startIndex)
  }, [ playQueue ])

  const handleOpenGroup = useCallback((scope: GroupScope) => {
    selectGroup(scope)
  }, [ selectGroup ])

  const handleContextMenu = useCallback((track: Track, point: ContextMenuPoint) => {
    contextTrackRef.current = track

    // The menu renders in its own window with its own document, so the theme
    // has to be handed to it. The accent is read back off the root rather
    // than from settings: that way a custom theme's accent comes along too.
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim()

    host.showContextMenu(
      CONTEXT_MENU_ITEMS,
      point.x,
      point.y,
      MENU_WIDTH,
      MENU_HEIGHT,
      theme,
      accent || undefined,
    )
  }, [ host, theme ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Subscribes to the host's context-menu action channel.
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

  const scoped   = Boolean(selectedGroup || activePlaylist)
  const showGrid = isGridDensity(density) && !scoped

  const collection = showGrid
    ? <LibraryGrid
      tracks={ displayTracks }
      grouping={ grouping }
      density={ density }
      onOpen={ handleOpenGroup }
      onPlay={ handleQueue } />
    : <TrackTable
      tracks={ displayTracks }
      isLoading={ isLoading }
      currentTrack={ currentTrack }
      isPlaying={ isPlaying }
      roots={ libraryPaths }
      onPlay={ handleTrackPlay }
      onPlayGroup={ tracks =>
        handleQueue(tracks, 0) }
      onContextMenu={ handleContextMenu }
      onNavigate={ selectFolder } />

  return <section className='library' aria-label='Library'>
    {libraryPaths.length > 0 && <LibraryToolbar />}

    {libraryPaths.length === 0
      ? <div className='library-empty'>
        <article className='library-empty-card'>
          <h3>No library folder yet</h3>
          <p>Add a folder in Settings to start scanning for music.</p>

          <Button type='button' variant='secondary' onClick={ goToLibrarySettings }>
            Open Settings
          </Button>
        </article>
      </div>
      : isInitialLoading && displayTracks.length === 0
        ? <div className='library-empty'>
          <output className='spinner' aria-label='Loading library' />
        </div>
        : displayTracks.length === 0 && !isLoading
          ? <p className='status-message'>
            No tracks found
            <small>
              {activePlaylist
                ? 'This playlist is empty'
                : 'Select a folder or add library paths in Settings'}
            </small>
          </p>
          : collection
    }

    <PromptDialog
      open={ promptOpen }
      title='New Playlist'
      placeholder='Playlist name...'
      onConfirm={ name =>
        addPlaylist(name) }
      onClose={ () =>
        setPromptOpen(false) } />
  </section>
}
