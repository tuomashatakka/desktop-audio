import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback } from 'react'


export type ViewType = 'library' | 'player' | 'settings' | 'tag-editor'

interface UIState {
  readonly currentView:        ViewType
  readonly sidebarOpen:        boolean
  readonly selectedFolderPath: string | null
  readonly selectedPlaylistId: string | null
  readonly editingTrackId:     string | null
  readonly playerExpanded:     boolean
}

interface UIContextValue extends UIState {
  readonly setView:              (view: ViewType) => void
  readonly toggleSidebar:        () => void
  readonly selectFolder:         (path: string | null) => void
  readonly selectPlaylist:       (id: string | null) => void
  readonly setEditingTrack:      (id: string | null) => void
  readonly togglePlayerExpanded: () => void
}

const UIContext = createContext<UIContextValue | null>(null)

export function UIProvider ({ children }: { readonly children: ReactNode }) {
  const [ state, setState ] = useState<UIState>({
    currentView:        'library',
    sidebarOpen:        true,
    selectedFolderPath: null,
    selectedPlaylistId: null,
    editingTrackId:     null,
    playerExpanded:     false,
  })

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
