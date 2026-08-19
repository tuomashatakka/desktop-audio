/**
 * LibraryContext — owns the in-memory music library.
 *
 * Holds independent track and folder snapshots, playlists, the active search
 * query, the selected track index in the filtered list, and a loading flag
 * while a scan is in progress. Keeping tracks and folders separate makes a
 * streamed batch an O(1) state replacement instead of rebuilding every album
 * and artist index on the renderer thread.
 *
 * Playlists are stored as *ids* and resolved against the current track list on
 * read — see {@link StoredPlaylist}. A track's id is its path, so membership
 * survives a rescan, and a playlist can never hold a stale copy of a tag the
 * user has since edited.
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useDeferredValue, useMemo } from 'react'
import { Track, FolderEntry } from '../models'
import type { Playlist, PlaylistFolder, PlaylistIcon, StoredPlaylist } from '../services/types'
import { DEFAULT_PLAYLIST_ICON } from '../services/types'
import { generateId } from '../utils/generateId'


export type { Track } from '../services/types'
export type { Playlist, PlaylistFolder, PlaylistIcon, StoredPlaylist } from '../services/types'

/** UI-friendly view of a folder for the sidebar tree. */
export interface FolderNode {
  readonly id:       string
  readonly name:     string
  readonly path:     string
  readonly children: readonly FolderNode[]
  readonly expanded: boolean
}

/** What {@link LibraryContextValue.playlists} persists between sessions. */
interface PlaylistStore {
  readonly playlists: readonly StoredPlaylist[]
  readonly folders:   readonly PlaylistFolder[]
}

/** Read-only library state snapshot. */
interface LibraryState {
  readonly tracks:             Track[]
  readonly folders:            FolderEntry[]
  readonly storedPlaylists:    readonly StoredPlaylist[]
  readonly playlistFolders:    readonly PlaylistFolder[]
  readonly searchQuery:        string
  readonly selectedTrackIndex: number | null
  readonly isLoading:          boolean
}

/** Library state plus mutators and derived data. */
interface LibraryContextValue extends Omit<LibraryState, 'storedPlaylists'> {
  readonly setFolders:     (folders: FolderEntry[]) => void
  readonly setTracks:      (tracks: Track[]) => void
  readonly setSearchQuery: (query: string) => void
  readonly selectTrack:    (index: number | null) => void
  readonly toggleFolder:   (path: string) => void
  readonly revealFolder:   (path: string) => void
  readonly setLoading:     (loading: boolean) => void
  readonly filteredTracks: Track[]

  /** Playlists with their membership resolved against {@link tracks}. */
  readonly playlists: readonly Playlist[]

  /** Creates a playlist and returns its id, so a caller can select it. */
  readonly addPlaylist:             (name: string, options?: NewPlaylistOptions) => string
  readonly removePlaylist:          (id: string) => void
  readonly renamePlaylist:          (id: string, name: string) => void
  readonly setPlaylistIcon:         (id: string, icon: PlaylistIcon) => void
  readonly movePlaylist:            (id: string, folderId: string | null) => void
  readonly addTracksToPlaylist:     (playlistId: string, tracks: readonly TrackRef[]) => void
  readonly removeTrackFromPlaylist: (playlistId: string, trackId: string) => void
  readonly addPlaylistFolder:       (name: string, parentId?: string | null) => string
  readonly removePlaylistFolder:    (id: string) => void
  readonly renamePlaylistFolder:    (id: string, name: string) => void
  readonly movePlaylistFolder:      (id: string, parentId: string | null) => void
  readonly togglePlaylistFolder:    (id: string) => void
}

/**
 * What a playlist mutation needs of a track: its id, and nothing else.
 *
 * Membership is stored by id, so accepting the whole {@link Track} would only
 * force callers holding the serialized shape to reconstruct model instances
 * they never had.
 */
export interface TrackRef {
  readonly id: string
}

/** Everything a new playlist can be given up front; all of it optional. */
export interface NewPlaylistOptions {
  readonly icon?:     PlaylistIcon
  readonly folderId?: string | null
  readonly tracks?:   readonly TrackRef[]
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

const PLAYLIST_KEY = 'desktop-audio-playlists'

/**
 * `localStorage` throws rather than returning null — a second Electron
 * instance sharing the profile finds the backing store locked — and this read
 * runs inside a `useState` initialiser, where a throw takes the tree down
 * before it mounts. An empty playlist list is a fine answer to "I can't read
 * your playlists"; a blank window is not.
 */
function loadPlaylistStore (): PlaylistStore {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PLAYLIST_KEY)
    if (!raw)
      return { playlists: [], folders: []}

    const parsed = JSON.parse(raw) as Partial<PlaylistStore>
    return {
      playlists: (parsed.playlists ?? []).map(normalizeStoredPlaylist),
      folders:   (parsed.folders ?? []).map(normalizePlaylistFolder),
    }
  }
  catch {
    return { playlists: [], folders: []}
  }
}

/**
 * A stored playlist can predate any field below — the icon and the folder both
 * arrived after playlists did, and a build that predates them stored neither.
 */
function normalizeStoredPlaylist (playlist: Partial<StoredPlaylist>): StoredPlaylist {
  return {
    id:       String(playlist.id ?? generateId()),
    name:     String(playlist.name ?? 'Playlist'),
    icon:     playlist.icon ?? DEFAULT_PLAYLIST_ICON,
    folderId: playlist.folderId ?? null,
    trackIds: Array.isArray(playlist.trackIds) ? playlist.trackIds.map(String) : [],
  }
}

function normalizePlaylistFolder (folder: Partial<PlaylistFolder>): PlaylistFolder {
  return {
    id:       String(folder.id ?? generateId()),
    name:     String(folder.name ?? 'Folder'),
    icon:     folder.icon ?? 'folder',
    parentId: folder.parentId ?? null,
    expanded: folder.expanded ?? true,
  }
}

/** The write half of {@link loadPlaylistStore}, throwing for the same reasons. */
function savePlaylistStore (store: PlaylistStore): void {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(store))
  }
  catch {
    // A playlist we could not persist is not worth losing the drop over.
  }
}

function toggleFolderBranch (folder: FolderEntry, path: string): FolderEntry {
  if (folder.path === path)
    return FolderEntry.fromFolderNode({
      id:       folder.id,
      name:     folder.name,
      path:     folder.path,
      children: folder.children,
      expanded: !folder.expanded,
    })

  const children = folder.children.map(child =>
    toggleFolderBranch(child, path))
  if (children.every((child, index) =>
    child === folder.children[index]))
    return folder

  return FolderEntry.fromFolderNode({
    id:       folder.id,
    name:     folder.name,
    path:     folder.path,
    children,
    expanded: folder.expanded,
  })
}

/**
 * Expands every ancestor of `path`, so a folder selected from somewhere else —
 * a breadcrumb, a track-table folder row, a restored session — is a row you can
 * actually see rather than one buried in a collapsed branch.
 *
 * Ancestry is a path prefix, which is the whole test: a node is on the chain
 * when `path` starts with its own path plus a separator. Branches off the chain
 * are returned by reference, so React re-renders the spine and nothing else,
 * and a node already open is left alone — which is what makes this idempotent
 * and safe to run on every selection change.
 */
function revealFolderBranch (folder: FolderEntry, path: string): FolderEntry {
  const onChain = path === folder.path ||
    path.startsWith(`${folder.path}/`) ||
    path.startsWith(`${folder.path}\\`)

  if (!onChain)
    return folder

  const children = folder.children.map(child =>
    revealFolderBranch(child, path))

  const unchanged = folder.expanded && children.every((child, index) =>
    child === folder.children[index])

  if (unchanged)
    return folder

  return FolderEntry.fromFolderNode({
    id:       folder.id,
    name:     folder.name,
    path:     folder.path,
    children,
    expanded: true,
  })
}

/** Every folder id at or below `id`, so removing a folder takes its subtree. */
function folderSubtree (folders: readonly PlaylistFolder[], id: string): ReadonlySet<string> {
  const ids = new Set([ id ])
  let grew  = true

  while (grew) {
    grew = false
    for (const folder of folders)
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        grew = true
      }
  }

  return ids
}

/** Provides {@link LibraryContextValue}; pair with {@link useLibraryScanner} to populate. */
type LibraryProviderProps = { readonly children: ReactNode }

export function LibraryProvider ({ children }: LibraryProviderProps) {
  const [ state, setState ] = useState<LibraryState>(() => {
    const stored = loadPlaylistStore()
    return {
      tracks:             [],
      folders:            [],
      storedPlaylists:    stored.playlists,
      playlistFolders:    stored.folders,
      searchQuery:        '',
      selectedTrackIndex: null,
      isLoading:          false,
    }
  })

  const setFolders = useCallback((folders: FolderEntry[]) => {
    setState(s =>
      ({ ...s, folders }))
  }, [])

  const setTracks = useCallback((tracks: Track[]) => {
    setState(s =>
      ({ ...s, tracks }))
  }, [])

  const setSearchQuery = useCallback((query: string) => {
    setState(s =>
      s.searchQuery === query ? s : { ...s, searchQuery: query })
  }, [])

  const selectTrack = useCallback((index: number | null) => {
    setState(s =>
      s.selectedTrackIndex === index ? s : { ...s, selectedTrackIndex: index })
  }, [])

  const toggleFolder = useCallback((path: string) => {
    setState(s =>
      ({ ...s,
        folders: s.folders.map(folder =>
          toggleFolderBranch(folder, path)) }))
  }, [])

  const revealFolder = useCallback((path: string) => {
    setState(s => {
      const folders = s.folders.map(folder =>
        revealFolderBranch(folder, path))

      const unchanged = folders.every((folder, index) =>
        folder === s.folders[index])

      return unchanged
        ? s
        : { ...s, folders }
    })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(s =>
      s.isLoading === loading ? s : { ...s, isLoading: loading })
  }, [])

  /**
   * Every playlist mutation goes through here, so persisting is part of making
   * the change rather than an effect watching for one.
   *
   * The write happens *inside* the updater against the value it just produced,
   * which React may run twice — a redundant `localStorage` write is cheap and
   * idempotent, whereas deriving the stored value outside the updater would
   * race two drops landing in the same tick.
   */
  const commitPlaylists = useCallback((
    change: (store: PlaylistStore) => PlaylistStore
  ) => {
    setState(s => {
      const next = change({ playlists: s.storedPlaylists, folders: s.playlistFolders })
      savePlaylistStore(next)
      return { ...s, storedPlaylists: next.playlists, playlistFolders: next.folders }
    })
  }, [])

  const addPlaylist = useCallback((name: string, options: NewPlaylistOptions = {}) => {
    const id = generateId()
    commitPlaylists(store =>
      ({
        ...store,
        playlists: [ ...store.playlists, {
          id,
          name,
          icon:     options.icon ?? DEFAULT_PLAYLIST_ICON,
          folderId: options.folderId ?? null,
          trackIds: (options.tracks ?? []).map(track =>
            track.id),
        }],
      }))
    return id
  }, [ commitPlaylists ])

  const removePlaylist = useCallback((id: string) => {
    commitPlaylists(store =>
      ({
        ...store,
        playlists: store.playlists.filter(playlist =>
          playlist.id !== id),
      }))
  }, [ commitPlaylists ])

  /** One updater for every field-level playlist edit; `id` misses are no-ops. */
  const patchPlaylist = useCallback((
    id: string,
    patch: (playlist: StoredPlaylist) => StoredPlaylist
  ) => {
    commitPlaylists(store =>
      ({
        ...store,
        playlists: store.playlists.map(playlist =>
          playlist.id === id ? patch(playlist) : playlist),
      }))
  }, [ commitPlaylists ])

  const renamePlaylist = useCallback((id: string, name: string) => {
    patchPlaylist(id, playlist =>
      ({ ...playlist, name }))
  }, [ patchPlaylist ])

  const setPlaylistIcon = useCallback((id: string, icon: PlaylistIcon) => {
    patchPlaylist(id, playlist =>
      ({ ...playlist, icon }))
  }, [ patchPlaylist ])

  const movePlaylist = useCallback((id: string, folderId: string | null) => {
    patchPlaylist(id, playlist =>
      ({ ...playlist, folderId }))
  }, [ patchPlaylist ])

  /** Appends, skipping ids the playlist already holds so a re-drop is a no-op. */
  const addTracksToPlaylist = useCallback((playlistId: string, tracks: readonly TrackRef[]) => {
    patchPlaylist(playlistId, playlist => {
      const present = new Set(playlist.trackIds)
      const added   = tracks
        .map(track =>
          track.id)
        .filter(id =>
          !present.has(id))

      return added.length === 0
        ? playlist
        : { ...playlist, trackIds: [ ...playlist.trackIds, ...added ]}
    })
  }, [ patchPlaylist ])

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    patchPlaylist(playlistId, playlist =>
      ({
        ...playlist,
        trackIds: playlist.trackIds.filter(id =>
          id !== trackId),
      }))
  }, [ patchPlaylist ])

  const addPlaylistFolder = useCallback((name: string, parentId: string | null = null) => {
    const id = generateId()
    commitPlaylists(store =>
      ({
        ...store,
        folders: [ ...store.folders, { id, name, icon: 'folder', parentId, expanded: true }],
      }))
    return id
  }, [ commitPlaylists ])

  /**
   * Removing a folder removes the folders under it, and lifts the playlists
   * inside all of them back to the root rather than deleting them: a folder is
   * a filing decision, and undoing it should not cost the user their lists.
   */
  const removePlaylistFolder = useCallback((id: string) => {
    commitPlaylists(store => {
      const doomed = folderSubtree(store.folders, id)
      return {
        folders: store.folders.filter(folder =>
          !doomed.has(folder.id)),
        playlists: store.playlists.map(playlist =>
          playlist.folderId !== null && doomed.has(playlist.folderId)
            ? { ...playlist, folderId: null }
            : playlist),
      }
    })
  }, [ commitPlaylists ])

  const patchFolder = useCallback((
    id: string,
    patch: (folder: PlaylistFolder) => PlaylistFolder
  ) => {
    commitPlaylists(store =>
      ({
        ...store,
        folders: store.folders.map(folder =>
          folder.id === id ? patch(folder) : folder),
      }))
  }, [ commitPlaylists ])

  const renamePlaylistFolder = useCallback((id: string, name: string) => {
    patchFolder(id, folder =>
      ({ ...folder, name }))
  }, [ patchFolder ])

  /** Refuses a cycle: a folder cannot be filed inside its own subtree. */
  const movePlaylistFolder = useCallback((id: string, parentId: string | null) => {
    commitPlaylists(store => {
      if (parentId !== null && folderSubtree(store.folders, id).has(parentId))
        return store

      return {
        ...store,
        folders: store.folders.map(folder =>
          folder.id === id ? { ...folder, parentId } : folder),
      }
    })
  }, [ commitPlaylists ])

  const togglePlaylistFolder = useCallback((id: string) => {
    patchFolder(id, folder =>
      ({ ...folder, expanded: !folder.expanded }))
  }, [ patchFolder ])

  // Keep the controlled search field urgent while its full-library filter is
  // rendered in the background. The deferred value is stable between keys, so
  // the table's memoised sorting work can be reused while the user is typing.
  const deferredSearchQuery = useDeferredValue(state.searchQuery)

  const filteredTracks = useMemo(() => {
    if (!deferredSearchQuery.trim())
      return state.tracks

    const query = deferredSearchQuery.toLowerCase()
    return state.tracks.filter(
      track =>
        track.title.toLowerCase().includes(query) ||
        track.artist.toLowerCase().includes(query) ||
        track.album.toLowerCase().includes(query)
    )
  }, [ state.tracks, deferredSearchQuery ])

  const trackById = useMemo(() => {
    const byId = new Map<string, Track>()
    for (const track of state.tracks)
      byId.set(track.id, track)
    return byId
  }, [ state.tracks ])

  /**
   * Membership resolved in *stored* order, which is the order the user dropped
   * things in. Ids with nothing behind them are dropped from the view but kept
   * in storage — see the module docstring.
   */
  const playlists = useMemo(() =>
    state.storedPlaylists.map(playlist =>
      ({
        ...playlist,
        tracks: playlist.trackIds
          .map(id =>
            trackById.get(id))
          .filter((track): track is Track =>
            track !== undefined),
      })), [ state.storedPlaylists, trackById ])

  // Memoised: a fresh object here re-renders every consumer on every render
  // of this provider, which for the track list means rebuilding the whole
  // table on unrelated state changes.
  const value = useMemo(() =>
    ({
      ...state,
      playlists,
      setFolders,
      setTracks,
      setSearchQuery,
      selectTrack,
      toggleFolder,
      revealFolder,
      setLoading,
      filteredTracks,
      addPlaylist,
      removePlaylist,
      renamePlaylist,
      setPlaylistIcon,
      movePlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      addPlaylistFolder,
      removePlaylistFolder,
      renamePlaylistFolder,
      movePlaylistFolder,
      togglePlaylistFolder,
    }), [
    state,
    playlists,
    setFolders,
    setTracks,
    setSearchQuery,
    selectTrack,
    toggleFolder,
    revealFolder,
    setLoading,
    filteredTracks,
    addPlaylist,
    removePlaylist,
    renamePlaylist,
    setPlaylistIcon,
    movePlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    addPlaylistFolder,
    removePlaylistFolder,
    renamePlaylistFolder,
    movePlaylistFolder,
    togglePlaylistFolder,
  ])

  return <LibraryContext.Provider value={ value }>
    {children}
  </LibraryContext.Provider>
}

/** Access the library. Throws if used outside {@link LibraryProvider}. */
export function useLibrary () {
  const context = useContext(LibraryContext)
  if (!context)
    throw new Error('useLibrary must be used within LibraryProvider')
  return context
}
