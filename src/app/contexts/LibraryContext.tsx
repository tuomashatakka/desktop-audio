import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useMemo } from 'react'


export interface Track {
  readonly id:        string
  readonly path:      string
  readonly title:     string
  readonly artist:    string
  readonly album:     string
  readonly duration:  number
  readonly format:    string
  readonly albumArt?: string;
}

export interface FolderNode {
  readonly id:       string
  readonly name:     string
  readonly path:     string
  readonly children: readonly FolderNode[]
  readonly expanded: boolean
}

interface LibraryState {
  readonly folders:            readonly FolderNode[]
  readonly tracks:             readonly Track[]
  readonly searchQuery:        string
  readonly selectedTrackIndex: number | null
  readonly isLoading:          boolean
}

interface LibraryContextValue extends LibraryState {
  readonly setFolders:     (folders: readonly FolderNode[]) => void
  readonly setTracks:      (tracks: readonly Track[]) => void
  readonly setSearchQuery: (query: string) => void
  readonly selectTrack:    (index: number | null) => void
  readonly toggleFolder:   (path: string) => void
  readonly setLoading:     (loading: boolean) => void
  readonly filteredTracks: readonly Track[]
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider ({ children }: { readonly children: ReactNode }) {
  const [ state, setState ] = useState<LibraryState>({
    folders:            [],
    tracks:             [],
    searchQuery:        '',
    selectedTrackIndex: null,
    isLoading:          false,
  })

  const setFolders = useCallback((folders: readonly FolderNode[]) => {
    setState(s =>
      ({ ...s, folders }))
  }, [])

  const setTracks = useCallback((tracks: readonly Track[]) => {
    setState(s =>
      ({ ...s, tracks }))
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
    setState(s =>
      ({
        ...s,
        folders: toggleFolderInTree(s.folders, path),
      }))
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(s =>
      ({ ...s, isLoading: loading }))
  }, [])

  const filteredTracks = useMemo(() => {
    if (!state.searchQuery.trim()) {
      return state.tracks
    }

    const query = state.searchQuery.toLowerCase()
    return state.tracks.filter(
      track =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query)
    )
  }, [ state.tracks, state.searchQuery ])

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
      }}
    >
      {children}
    </LibraryContext.Provider>
  )
}

function toggleFolderInTree (folders: readonly FolderNode[], path: string): FolderNode[] {
  return folders.map(folder => {
    if (folder.path === path) {
      return { ...folder, expanded: !folder.expanded }
    }
    if (folder.children.length > 0) {
      return { ...folder, children: toggleFolderInTree(folder.children, path) }
    }
    return folder
  })
}

export function useLibrary () {
  const context = useContext(LibraryContext)
  if (!context) {
    throw new Error('useLibrary must be used within LibraryProvider')
  }
  return context
}
