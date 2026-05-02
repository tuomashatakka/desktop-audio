import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'


export type ViewType = 'library' | 'player' | 'settings' | 'tag-editor'

export type Density = 'compact' | 'normal' | 'relaxed'

export type Grouping = 'none' | 'album' | 'artist' | 'path'

interface UIState {
  readonly currentView:        ViewType
  readonly sidebarOpen:        boolean
  readonly selectedFolderPath: string | null
  readonly selectedPlaylistId: string | null
  readonly editingTrackId:     string | null
  readonly playerExpanded:     boolean
  readonly density:            Density
  readonly grouping:           Grouping
}

interface UIContextValue extends UIState {
  readonly setView:              (view: ViewType) => void
  readonly toggleSidebar:        () => void
  readonly selectFolder:         (path: string | null) => void
  readonly selectPlaylist:       (id: string | null) => void
  readonly setEditingTrack:      (id: string | null) => void
  readonly togglePlayerExpanded: () => void
  readonly setDensity:           (d: Density) => void
  readonly setGrouping:          (g: Grouping) => void
}

const UIContext = createContext<UIContextValue | null>(null)

const DENSITY_KEY  = 'desktop-audio-density'
const GROUPING_KEY = 'desktop-audio-grouping'

function loadDensity (): Density {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(DENSITY_KEY)
  return v === 'compact' || v === 'relaxed' ? v : 'normal'
}

function loadGrouping (): Grouping {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(GROUPING_KEY)
  return v === 'album' || v === 'artist' || v === 'path' ? v : 'none'
}

export function UIProvider ({ children }: { readonly children: ReactNode }) {
  const [ state, setState ] = useState<UIState>(() =>
    ({
      currentView:        'library',
      sidebarOpen:        false,
      selectedFolderPath: null,
      selectedPlaylistId: null,
      editingTrackId:     null,
      playerExpanded:     false,
      density:            loadDensity(),
      grouping:           loadGrouping(),
    }))

  const setView = useCallback((view: ViewType) => {
    setState(s =>
      ({ ...s, currentView: view }))
  }, [])

  const toggleSidebar = useCallback(() => {
    setState(s =>
      ({ ...s, sidebarOpen: !s.sidebarOpen }))
  }, [])

  const selectFolder = useCallback((path: string | null) => {
    setState(s =>
      ({ ...s, selectedFolderPath: path, selectedPlaylistId: null }))
  }, [])

  const selectPlaylist = useCallback((id: string | null) => {
    setState(s =>
      ({ ...s, selectedPlaylistId: id, selectedFolderPath: null }))
  }, [])

  const setEditingTrack = useCallback((id: string | null) => {
    setState(s =>
      ({ ...s, editingTrackId: id }))
    if (id) {
      setState(s =>
        ({ ...s, currentView: 'tag-editor' }))
    }
  }, [])

  const togglePlayerExpanded = useCallback(() => {
    setState(s =>
      ({ ...s, playerExpanded: !s.playerExpanded }))
  }, [])

  const setDensity = useCallback((d: Density) => {
    setState(s =>
      ({ ...s, density: d }))
  }, [])

  const setGrouping = useCallback((g: Grouping) => {
    setState(s =>
      ({ ...s, grouping: g }))
  }, [])

  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, state.density)
  }, [ state.density ])

  useEffect(() => {
    localStorage.setItem(GROUPING_KEY, state.grouping)
  }, [ state.grouping ])

  return (
    <UIContext.Provider
      value={{
        ...state,
        setView,
        toggleSidebar,
        selectFolder,
        selectPlaylist,
        setEditingTrack,
        togglePlayerExpanded,
        setDensity,
        setGrouping,
      }}
    >
      {children}
    </UIContext.Provider>
  )
}

export function useUI () {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within UIProvider')
  }
  return context
}
