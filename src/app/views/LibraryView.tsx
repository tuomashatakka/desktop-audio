import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track } from '../contexts'
import { useLibraryScanner } from '../hooks'
import { Button, PromptDialog } from '../components/atomic'
import { TrackTable } from '../components/composite/TrackTable'
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

/** Scrollable track collection; its heading and controls live in the shell titlebar. */
export function LibraryView () {
  const { setView, setEditingTrack, selectedFolderPath, selectedPlaylistId, selectFolder } = useUI()
  const { filteredTracks, playlists, addPlaylist, selectTrack, isLoading } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths, theme } = useSettings()
  const host = useHost()

  const { isInitialLoading } = useLibraryScanner()

  const goToLibrarySettings = useCallback(() => {
    setView('settings')
    location.hash = '#settings-library'
  }, [ setView ])

  const [ promptOpen, setPromptOpen ] = useState(false)
  const contextTrackRef = useRef<Track | null>(null)

  const activePlaylist = selectedPlaylistId
    ? playlists.find(playlist =>
      playlist.id === selectedPlaylistId)
    : undefined

  const handleTrackPlay = useCallback((track: Track, index: number) => {
    selectTrack(index)
    play(track)
  }, [ selectTrack, play ])

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
      return filteredTracks.filter(track =>
        track.path.startsWith(selectedFolderPath))
    return filteredTracks
  }, [ activePlaylist, selectedFolderPath, filteredTracks ])

  return (
    <section className='library' aria-label='Library tracks'>
      {libraryPaths.length === 0
        ? <div className='library-empty'>
          <div className='library-empty-card'>
            <h3>No library folder yet</h3>
            <p>Add a folder in Settings to start scanning for music.</p>

            <Button type='button' variant='secondary' onClick={goToLibrarySettings}>
              Open Settings
            </Button>
          </div>
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
            : <TrackTable
              tracks={displayTracks}
              isLoading={isLoading}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              onPlay={handleTrackPlay}
              onContextMenu={handleContextMenu}
              onNavigate={selectFolder}
              roots={libraryPaths}
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
