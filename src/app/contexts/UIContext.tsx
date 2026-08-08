/**
 * UIContext — view-layer state only.
 *
 * Tracks which view is active, sidebar visibility, the currently-selected
 * folder/playlist, and presentation preferences (density, grouping, sidebar
 * width). Presentation preferences are persisted; the rest is session-only.
 *
 * Does NOT own library data, audio playback, or user settings — see
 * {@link LibraryContext}, {@link AudioContext}, {@link SettingsContext}.
 */
import type { ReactNode, SetStateAction } from 'react'
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'


/** Top-level routes the shell can render. */
export type ViewType = 'library' | 'player' | 'settings' | 'tag-editor'

/** Row spacing preset for the track table. */
export type Density = 'compact' | 'normal' | 'relaxed'

/** How tracks are grouped in the track table (`none` = flat list). */
export type Grouping = 'none' | 'album' | 'artist' | 'path'

/**
 * Read-only snapshot of UI state. `previousView` holds whatever was active
 * before the last {@link UIContextValue.setView} call, so the mini player
 * can restore it when the window grows back.
 */
interface UIState {
  readonly currentView:        ViewType
  readonly previousView:       ViewType | null
  readonly sidebarOpen:        boolean
  readonly selectedFolderPath: string | null
  readonly selectedPlaylistId: string | null
  readonly editingTrackId:     string | null
  readonly density:            Density
  readonly grouping:           Grouping
  readonly sidebarWidth:       number
}

/** UI state plus the actions that mutate it. */
interface UIContextValue extends UIState {
  readonly setView:         (view: ViewType) => void
  readonly toggleSidebar:   () => void
  readonly selectFolder:    (path: string | null) => void
  readonly selectPlaylist:  (id: string | null) => void
  readonly setEditingTrack: (id: string | null) => void
  readonly setDensity:      (d: Density) => void
  readonly setGrouping:     (g: Grouping) => void
  readonly setSidebarWidth: (width: SetStateAction<number>) => void
}

const UIContext = createContext<UIContextValue | null>(null)

const DENSITY_KEY       = 'desktop-audio-density'
const GROUPING_KEY      = 'desktop-audio-grouping'
const SIDEBAR_WIDTH_KEY = 'desktop-audio-sidebar-width'

export const MIN_SIDEBAR_WIDTH     = 180
export const MAX_SIDEBAR_WIDTH     = 400
export const DEFAULT_SIDEBAR_WIDTH = 220

export function clampSidebarWidth (width: number): number {
  if (!Number.isFinite(width))
    return DEFAULT_SIDEBAR_WIDTH

  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, width))
}

/**
 * `localStorage` throws, it does not merely return null.
 *
 * A second Electron instance sharing this profile finds the leveldb backing
 * store already locked, and the preference readers run inside
  * `useState` initialisers, so an unhandled throw there takes down the whole
 * React tree before it mounts — and the window is frameless and transparent,
 * so the result is a live process showing nothing at all. Defaults are a fine
 * answer to "I can't read your preferences"; a blank app is not.
 */
function readSetting (key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function loadDensity (): Density {
  const v = readSetting(DENSITY_KEY)
  return v === 'compact' || v === 'relaxed' ? v : 'normal'
}

function loadGrouping (): Grouping {
  const v = readSetting(GROUPING_KEY)
  return v === 'album' || v === 'artist' || v === 'path' ? v : 'none'
}

function loadSidebarWidth (): number {
  const stored = readSetting(SIDEBAR_WIDTH_KEY)
  return stored === null
    ? DEFAULT_SIDEBAR_WIDTH
    : clampSidebarWidth(Number(stored))
}

/**
 * Wraps the app and provides {@link UIContextValue}. Pass `value` to inject
 * pre-built state for tests; otherwise local state is used.
 */
type UIProviderProps = { readonly children: ReactNode; value?: UIContextValue }

export function UIProvider ({ children, value }: UIProviderProps) {
  const [ state, setState ] = useState<UIState>(() =>
    ({
      currentView:        'library',
      previousView:       null,
      sidebarOpen:        false,
      selectedFolderPath: null,
      selectedPlaylistId: null,
      editingTrackId:     null,
      density:            loadDensity(),
      grouping:           loadGrouping(),
      sidebarWidth:       loadSidebarWidth(),
    }))

  /** Switches the stable view tree immediately; CSS owns the resulting layout. */
  const setView = useCallback((view: ViewType) => {
    setState(state =>
      state.currentView === view
        ? state
        : { ...state, currentView: view, previousView: state.currentView })
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
    if (id)
      setView('tag-editor')
  }, [ setView ])

  const setDensity = useCallback((d: Density) => {
    setState(s =>
      ({ ...s, density: d }))
  }, [])

  const setGrouping = useCallback((g: Grouping) => {
    setState(s =>
      ({ ...s, grouping: g }))
  }, [])

  const setSidebarWidth = useCallback((width: SetStateAction<number>) => {
    setState(state => {
      const nextWidth = typeof width === 'function'
        ? width(state.sidebarWidth)
        : width

      return { ...state, sidebarWidth: clampSidebarWidth(nextWidth) }
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, state.density)
  }, [ state.density ])

  useEffect(() => {
    localStorage.setItem(GROUPING_KEY, state.grouping)
  }, [ state.grouping ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Persist UI preference changes to browser storage.
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(state.sidebarWidth))
  }, [ state.sidebarWidth ])

  // `value` is the test-injection escape hatch; otherwise memoise, so
  // consumers don't re-render on every provider render.
  const contextValue = useMemo(() =>
    value ?? {
      ...state,
      setView,
      toggleSidebar,
      selectFolder,
      selectPlaylist,
      setEditingTrack,
      setDensity,
      setGrouping,
      setSidebarWidth,
    }, [
    value,
    state,
    setView,
    toggleSidebar,
    selectFolder,
    selectPlaylist,
    setEditingTrack,
    setDensity,
    setGrouping,
    setSidebarWidth,
  ])

  return <UIContext.Provider value={ contextValue }>
    {children}
  </UIContext.Provider>
}

/** Access {@link UIContextValue}. Throws if used outside {@link UIProvider}. */
export function useUI () {
  const context = useContext(UIContext)
  if (!context)
    throw new Error('useUI must be used within UIProvider')
  return context
}
