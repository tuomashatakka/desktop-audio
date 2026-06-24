/**
 * UIContext — ephemeral, view-layer state only.
 *
 * Tracks which view is active, sidebar visibility, the currently-selected
 * folder/playlist, and presentation preferences (density, grouping). Density
 * and grouping are persisted to localStorage; the rest is session-only.
 *
 * Does NOT own library data, audio playback, or user settings — see
 * {@link LibraryContext}, {@link AudioContext}, {@link SettingsContext}.
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'


/** Top-level routes the shell can render. */
export type ViewType = 'library' | 'player' | 'settings' | 'tag-editor'

/** Row spacing preset for the track table. */
export type Density = 'compact' | 'normal' | 'relaxed'

/** How tracks are grouped in the track table (`none` = flat list). */
export type Grouping = 'none' | 'album' | 'artist' | 'path'

/** Read-only snapshot of UI state. */
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

/** UI state plus the actions that mutate it. */
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

/**
 * Wraps the app and provides {@link UIContextValue}. Pass `value` to inject
 * pre-built state for tests; otherwise local state is used.
 */
export function UIProvider ({ children, value }: { readonly children: ReactNode; value?: UIContextValue }) {
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
      value={value || {
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

/** Access {@link UIContextValue}. Throws if used outside {@link UIProvider}. */
export function useUI () {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within UIProvider')
  }
  return context
}
