/**
 * LibraryContext — owns the in-memory music library.
 *
 * Holds the {@link ModelRegistry} (folders, tracks, albums, artists),
 * playlists, the active search query, the selected track index in the
 * filtered list, and a loading flag while a scan is in progress. The
 * scanner pumps results into this context via `setFolders` / `setTracks`.
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import { ModelRegistry, Track, FolderEntry } from '../models'
import type { Playlist } from '../services/types'


export type { Track, Playlist } from '../services/types'

/** UI-friendly view of a folder for the sidebar tree. */
export interface FolderNode {
  readonly id:       string
  readonly name:     string
  readonly path:     string
  readonly children: readonly FolderNode[]
  readonly expanded: boolean
}

/** Read-only library state snapshot. */
interface LibraryState {
  readonly registry:           ModelRegistry
  readonly playlists:          readonly Playlist[]
  readonly searchQuery:        string
  readonly selectedTrackIndex: number | null
  readonly isLoading:          boolean
}

/** Library state plus mutators and derived data. */
interface LibraryContextValue extends LibraryState {
  readonly setFolders:          (folders: FolderEntry[]) => void
  readonly setTracks:           (tracks: Track[]) => void
  readonly setSearchQuery:      (query: string) => void
  readonly selectTrack:         (index: number | null) => void
  readonly toggleFolder:        (path: string) => void
  readonly setLoading:          (loading: boolean) => void
  readonly filteredTracks:      Track[]
  readonly addPlaylist:         (name: string) => void
  readonly removePlaylist:      (id: string) => void
  readonly addTracksToPlaylist: (playlistId: string, tracks: Track[]) => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

/** Provides {@link LibraryContextValue}; pair with {@link useLibraryScanner} to populate. */
export function LibraryProvider ({ children }: { readonly children: ReactNode }) {
  const [ state, setState ] = useState<LibraryState>({
    registry:           new ModelRegistry(),
    playlists:          [],
    searchQuery:        '',
    selectedTrackIndex: null,
    isLoading:          false,
  })

  const setFolders = useCallback((folders: FolderEntry[]) => {
    setState(s => {
      const newRegistry = new ModelRegistry()
      for (const track of s.registry.getAllTracks())
        newRegistry.addTrack(track)
      for (const folder of folders)
        newRegistry.addFolder(folder)
      return { ...s, registry: newRegistry }
    })
  }, [])

  const setTracks = useCallback((tracks: Track[]) => {
    setState(s => {
      const newRegistry = new ModelRegistry()
      for (const track of tracks)
        newRegistry.addTrack(track)
      return { ...s, registry: newRegistry }
    })
  }, [])

  const setSearchQuery = useCallback((query: string) => {
    setState(s =>
      ({ ...s, searchQuery: query }))
  }, [])

  const selectTrack = useCallback((index: number | null) => {
    setState(s =>
      ({ ...s, selectedTrackIndex: index }))
  }, [])

  const toggleFolder = useCallback((path: string) => {
    setState(s => {
      const newRegistry = new ModelRegistry()
      for (const track of s.registry.getAllTracks())
        newRegistry.addTrack(track)
      for (const [ id, folder ] of s.registry.folders) {
        if (folder.path === path) {
          const updated = new FolderEntry(folder.id)
          updated.name = folder.name
          updated.path = folder.path
          updated.children = [ ...folder.children ]
          updated.expanded = !folder.expanded
          newRegistry.addFolder(updated)
        }
        else {
          newRegistry.addFolder(folder)
        }
      }
      return { ...s, registry: newRegistry }
    })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(s =>
      ({ ...s, isLoading: loading }))
  }, [])

  const addPlaylist = useCallback((name: string) => {
    const id = Math.random().toString(36)
      .slice(2, 11)
    setState(s =>
      ({ ...s, playlists: [ ...s.playlists, { id, name, tracks: []}]}))
  }, [])

  const removePlaylist = useCallback((id: string) => {
    setState(s =>
      ({ ...s,
        playlists: s.playlists.filter(p =>
          p.id !== id) }))
  }, [])

  const selectFolder = useCallback((path: string | null) => {
    setState(s =>
      ({ ...s }))
  }, [])

  const selectPlaylist = useCallback((id: string | null) => {
    setState(s =>
      ({ ...s }))
  }, [])

  const addTracksToPlaylist = useCallback((playlistId: string, tracks: Track[]) => {
    setState(s =>
      ({
        ...s,
        playlists: s.playlists.map(p =>
          p.id === playlistId
            ? { ...p,
              tracks: [ ...p.tracks, ...tracks.filter(t =>
                !p.tracks.some(pt =>
                  pt.path === t.path)) ]}
            : p),
      }))
  }, [])

  const filteredTracks = useMemo(() => {
    const tracks = state.registry.getAllTracks()
    if (!state.searchQuery.trim()) {
      return tracks
    }

    const query = state.searchQuery.toLowerCase()
    return tracks.filter(
      track =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query)
    )
  }, [ state.registry, state.searchQuery ])

  return (
    <LibraryContext.Provider
      value={{
        ...state,
        setFolders,
        setTracks,
        setSearchQuery,
        selectTrack,
        toggleFolder,
        setLoading,
        filteredTracks,
        addPlaylist,
        removePlaylist,
        addTracksToPlaylist,
      }}
    >
      {children}
    </LibraryContext.Provider>
  )
}

/** Access the library. Throws if used outside {@link LibraryProvider}. */
export function useLibrary () {
  const context = useContext(LibraryContext)
  if (!context) {
    throw new Error('useLibrary must be used within LibraryProvider')
  }
  return context
}
