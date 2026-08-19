import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useUI, useLibrary, useAudio, useSettings, isGridDensity } from '../contexts'
import type { GroupScope, PlaybackList, Track } from '../contexts'
import { useLibraryScanner } from '../hooks'
import { Button, PromptDialog } from '../components/atomic'
import { TrackTable } from '../components/composite/TrackTable'
import { LibraryGrid } from '../components/composite/LibraryGrid'
import type { GridMenuTarget } from '../components/composite/LibraryGrid'
import { LibraryToolbar } from './LibraryToolbar'
import { bucketKey } from '../utils/grouping'
import { subfolderRows } from '../utils/folders'
import { useHost } from '../data'
import type { ContextMenuPoint, SerializableMenuItem } from '../services/types'


const CONTEXT_MENU_ITEMS: SerializableMenuItem[] = [
  { label: 'Play', icon: 'play' },
  { label: 'Add to Playlist', icon: 'music' },
  { separator: true },
  { label: 'Edit Tags', icon: 'edit' },
]

/**
 * An album or artist card stands for a bucket, not a file, so it drops the two
 * entries that only mean something for one track. A selection reports an index
 * into *the list that was shown*, which is why the action handler branches on
 * the target's kind before reading it.
 */
const GROUP_CONTEXT_MENU_ITEMS: SerializableMenuItem[] = [
  { label: 'Play', icon: 'play' },
  { label: 'Add to Playlist', icon: 'music' },
]

const ITEM_HEIGHT      = 32
const SEPARATOR_HEIGHT = 9
const PADDING          = 8
const MENU_WIDTH       = 200

/** The window has to be sized before it is shown; the menu never scrolls. */
function menuHeight (items: readonly SerializableMenuItem[]): number {
  return items.filter(item =>
    !item.separator).length * ITEM_HEIGHT +
    items.filter(item =>
      item.separator).length * SEPARATOR_HEIGHT +
    PADDING * 2
}

/** Why the list in front of the user is empty, in its own words. */
function emptyHint (list: PlaybackList | null, hasPlaylist: boolean): string {
  if (list === 'queue')
    return 'Nothing is queued'
  if (list === 'history')
    return 'Nothing has played yet'
  return hasPlaylist
    ? 'This playlist is empty'
    : 'Select a folder or add library paths in Settings'
}

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
    setEditingTrack, selectedFolderPath, selectedPlaylistId, selectedList,
    selectedGroup, selectFolder, selectGroup, density, grouping, openOverlay,
  }                                                            = useUI()
  const {
    filteredTracks, folders, playlists, addPlaylist, selectTrack, isLoading,
  }                                                            = useLibrary()
  const { playQueue, currentTrack, isPlaying, queue, history } = useAudio()
  const { libraryPaths, theme, showSubfolders }                = useSettings()
  const host                                                   = useHost()

  const { isInitialLoading } = useLibraryScanner()

  /** The tracks "Add to Playlist" was invoked on, held while the prompt is up. */
  const [ playlistFor, setPlaylistFor ] = useState<readonly Track[] | null>(null)
  const contextTargetRef                = useRef<GridMenuTarget | null>(null)

  const goToLibrarySettings = useCallback(() => {
    openOverlay('settings')
    location.hash = '#settings-library'
  }, [ openOverlay ])

  const activePlaylist = selectedPlaylistId
    ? playlists.find(playlist =>
      playlist.id === selectedPlaylistId)
    : undefined

  /**
   * A playlist and a playback list are each their own list. Otherwise the
   * folder and the drilled-into group are *both* applied — a card counted
   * inside a folder has to open the same set it advertised.
   */
  const displayTracks = useMemo(() => {
    if (selectedList)
      return selectedList === 'queue' ? queue : history
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
  }, [ selectedList, queue, history, activePlaylist, selectedGroup, selectedFolderPath, filteredTracks ])

  /**
   * Subfolders belong above a list of *this folder's* tracks, so they show
   * only while the table is showing exactly that: ungrouped or grouped by
   * folder, with nothing else scoping the view. Grouping by album or artist
   * reorders the list around something a folder is not part of, and a playlist
   * or a playback list has no location at all.
   */
  const folderRows = useMemo(() => {
    const browsing = !activePlaylist && !selectedList && !selectedGroup
    if (!showSubfolders || !browsing || grouping !== 'none' && grouping !== 'path')
      return []

    return subfolderRows(folders, selectedFolderPath, filteredTracks)
  }, [
    showSubfolders, activePlaylist, selectedList, selectedGroup, grouping,
    folders, selectedFolderPath, filteredTracks,
  ])

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

  const showMenu = useCallback((items: SerializableMenuItem[], point: ContextMenuPoint) => {
    // The menu renders in its own window with its own document, so the theme
    // has to be handed to it. The accent is read back off the root rather
    // than from settings: that way a custom theme's accent comes along too.
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim()

    host.showContextMenu(
      items,
      point.x,
      point.y,
      MENU_WIDTH,
      menuHeight(items),
      theme,
      accent || undefined,
    )
  }, [ host, theme ])

  /** A track row, or an ungrouped grid card — both stand for one file. */
  const handleContextMenu = useCallback((track: Track, point: ContextMenuPoint) => {
    contextTargetRef.current = { kind: 'track', track }
    showMenu(CONTEXT_MENU_ITEMS, point)
  }, [ showMenu ])

  /** A grid card, which is a track or a bucket depending on the grouping. */
  const handleCardContextMenu = useCallback((target: GridMenuTarget, point: ContextMenuPoint) => {
    contextTargetRef.current = target
    showMenu(target.kind === 'group' ? GROUP_CONTEXT_MENU_ITEMS : CONTEXT_MENU_ITEMS, point)
  }, [ showMenu ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Subscribes to the host's context-menu action channel.
  useEffect(() =>
    host.onContextMenuAction((index: number) => {
      const target = contextTargetRef.current
      if (!target)
        return

      // Two item sets share this one channel, so an index only means what the
      // menu that was actually opened says it means.
      if (target.kind === 'group')
        switch (index) {
          case 0: handleQueue(target.tracks, 0); break
          case 1: setPlaylistFor(target.tracks); break
        }
      else
        switch (index) {
          case 0: handleTrackPlay(target.track, 0); break
          case 1: setPlaylistFor([ target.track ]); break
          // index 2 is the separator — no action
          case 3: setEditingTrack(target.track.id); break
        }

      contextTargetRef.current = null
    }), [ handleTrackPlay, handleQueue, setEditingTrack, host ])

  const scoped   = Boolean(selectedGroup || activePlaylist || selectedList)
  const showGrid = isGridDensity(density) && !scoped

  const collection = showGrid
    ? <LibraryGrid
      tracks={ displayTracks }
      grouping={ grouping }
      density={ density }
      onOpen={ handleOpenGroup }
      onPlay={ handleQueue }
      onContextMenu={ handleCardContextMenu } />
    : <TrackTable
      tracks={ displayTracks }
      isLoading={ isLoading }
      currentTrack={ currentTrack }
      isPlaying={ isPlaying }
      roots={ libraryPaths }
      folders={ folderRows }
      naturalOrder={ selectedList }
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
            <small>{emptyHint(selectedList, activePlaylist !== undefined)}</small>
          </p>
          : collection
    }

    {/* The new playlist starts with the track the menu was opened on — the
        dialog is reached from "Add to Playlist", so creating an empty one
        would answer a different question than the one that was asked. */}
    <PromptDialog
      open={ playlistFor !== null }
      title='New Playlist'
      placeholder='Playlist name...'
      onConfirm={ name =>
        addPlaylist(name, { tracks: playlistFor ?? []}) }
      onClose={ () =>
        setPlaylistFor(null) } />
  </section>
}
