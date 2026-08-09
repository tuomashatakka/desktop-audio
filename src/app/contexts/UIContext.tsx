/**
 * UIContext — view-layer state only.
 *
 * The library is the app's only view. Now Playing, Settings and the Tag Editor
 * are *overlays* over it — a modal `<dialog>` each — so opening one never tears
 * the library or the sidebar down. That is why there is no route state here:
 * `overlay` names at most one dialog, and `null` means "just the library".
 *
 * Three selectors scope the library. A playlist excludes the other two — it is
 * its own list, not a filter over the tree. But `selectedFolderPath` and
 * `selectedGroup` **compose**: drilling into an album card narrows the folder
 * you were already browsing, because that card was counted inside it. Picking
 * a different folder drops the drill-in, since the bucket may not exist there.
 *
 * Presentation preferences (density, grouping, sidebar width) are persisted;
 * everything else is session-only.
 *
 * Does NOT own library data, audio playback, or user settings — see
 * {@link LibraryContext}, {@link AudioContext}, {@link SettingsContext}.
 */
import type { ReactNode, SetStateAction } from 'react'
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'


/** The dialogs that can sit over the library. Only one at a time. */
export type OverlayName = 'player' | 'settings' | 'tag-editor'

/**
 * How the track collection is laid out. The first three are row heights for
 * the list; the two `grid-*` values switch it to a card grid instead — see
 * {@link isGridDensity}.
 */
export type Density = 'compact' | 'normal' | 'relaxed' | 'grid-sm' | 'grid-lg'

/** How tracks are grouped in the track table (`none` = flat list). */
export type Grouping = 'none' | 'album' | 'artist' | 'path'

/** The groupings that produce buckets one can drill into. */
export type BucketGrouping = Exclude<Grouping, 'none'>

/**
 * A bucket the user has drilled into from the grid — the album, artist or
 * folder whose card they clicked. `key` is the same value
 * `bucketKey(track, grouping)` produces, so filtering is a string compare.
 */
export interface GroupScope {
  readonly grouping: BucketGrouping
  readonly key:      string
  readonly label:    string
}

/** The two card-grid densities. */
export type GridDensity = Extract<Density, 'grid-sm' | 'grid-lg'>

/**
 * Is this density a card grid rather than a list? A type predicate, so the
 * call site narrows and neither branch has to re-test the union.
 */
export function isGridDensity (density: Density): density is GridDensity {
  return density === 'grid-sm' || density === 'grid-lg'
}

/** Read-only snapshot of UI state. */
interface UIState {
  readonly overlay:            OverlayName | null
  readonly sidebarOpen:        boolean
  readonly selectedFolderPath: string | null
  readonly selectedPlaylistId: string | null
  readonly selectedGroup:      GroupScope | null
  readonly editingTrackId:     string | null
  readonly density:            Density
  readonly grouping:           Grouping
  readonly sidebarWidth:       number
}

/** UI state plus the actions that mutate it. */
interface UIContextValue extends UIState {
  readonly openOverlay:     (name: OverlayName) => void
  readonly closeOverlay:    () => void
  readonly toggleSidebar:   () => void
  readonly selectFolder:    (path: string | null) => void
  readonly selectPlaylist:  (id: string | null) => void
  readonly selectGroup:     (scope: GroupScope | null) => void
  readonly setEditingTrack: (id: string | null) => void
  readonly setDensity:      (d: Density) => void
  readonly setGrouping:     (g: Grouping) => void
  readonly setSidebarWidth: (width: SetStateAction<number>) => void
}

const UIContext = createContext<UIContextValue | null>(null)

const DENSITY_KEY       = 'desktop-audio-density'
const GROUPING_KEY      = 'desktop-audio-grouping'
const SIDEBAR_WIDTH_KEY = 'desktop-audio-sidebar-width'

const DENSITIES: readonly Density[]  = [ 'compact', 'normal', 'relaxed', 'grid-sm', 'grid-lg' ]
const GROUPINGS: readonly Grouping[] = [ 'none', 'album', 'artist', 'path' ]

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
  const stored = readSetting(DENSITY_KEY) as Density | null
  return stored !== null && DENSITIES.includes(stored) ? stored : 'normal'
}

function loadGrouping (): Grouping {
  const stored = readSetting(GROUPING_KEY) as Grouping | null
  return stored !== null && GROUPINGS.includes(stored) ? stored : 'none'
}

function loadSidebarWidth (): number {
  const stored = readSetting(SIDEBAR_WIDTH_KEY)
  return stored === null
    ? DEFAULT_SIDEBAR_WIDTH
    : clampSidebarWidth(Number(stored))
}

/** Clears every scope — see the module docstring. */
const NO_SCOPE = {
  selectedFolderPath: null,
  selectedPlaylistId: null,
  selectedGroup:      null,
} as const

/**
 * Wraps the app and provides {@link UIContextValue}. Pass `value` to inject
 * pre-built state for tests; otherwise local state is used.
 */
type UIProviderProps = { readonly children: ReactNode; value?: UIContextValue }

export function UIProvider ({ children, value }: UIProviderProps) {
  const [ state, setState ] = useState<UIState>(() =>
    ({
      overlay:        null,
      sidebarOpen:    false,
      ...NO_SCOPE,
      editingTrackId: null,
      density:        loadDensity(),
      grouping:       loadGrouping(),
      sidebarWidth:   loadSidebarWidth(),
    }))

  const openOverlay = useCallback((name: OverlayName) => {
    setState(s =>
      s.overlay === name ? s : { ...s, overlay: name })
  }, [])

  const closeOverlay = useCallback(() => {
    setState(s =>
      s.overlay === null ? s : { ...s, overlay: null })
  }, [])

  const toggleSidebar = useCallback(() => {
    setState(s =>
      ({ ...s, sidebarOpen: !s.sidebarOpen }))
  }, [])

  const selectFolder = useCallback((path: string | null) => {
    setState(s =>
      ({ ...s, ...NO_SCOPE, selectedFolderPath: path }))
  }, [])

  const selectPlaylist = useCallback((id: string | null) => {
    setState(s =>
      ({ ...s, ...NO_SCOPE, selectedPlaylistId: id }))
  }, [])

  /**
   * A group **narrows within** the folder rather than replacing it — the card
   * the user clicked was counted inside that folder, so the list it opens has
   * to be the same set. Clearing the folder here made a card labelled
   * "52 tracks" open 147: the same album, but library-wide.
   */
  const selectGroup = useCallback((scope: GroupScope | null) => {
    setState(s =>
      ({ ...s, selectedPlaylistId: null, selectedGroup: scope }))
  }, [])

  const setEditingTrack = useCallback((id: string | null) => {
    setState(s =>
      ({ ...s, editingTrackId: id, overlay: id ? 'tag-editor' : s.overlay }))
  }, [])

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
      openOverlay,
      closeOverlay,
      toggleSidebar,
      selectFolder,
      selectPlaylist,
      selectGroup,
      setEditingTrack,
      setDensity,
      setGrouping,
      setSidebarWidth,
    }, [
    value,
    state,
    openOverlay,
    closeOverlay,
    toggleSidebar,
    selectFolder,
    selectPlaylist,
    selectGroup,
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
