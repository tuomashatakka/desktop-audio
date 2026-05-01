import { useEffect, useState } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useUI, useAudio, useSettings } from './contexts'
import { LibraryView } from './views/LibraryView'
import { PlayerView } from './views/PlayerView'
import { SettingsView } from './views/SettingsView'
import { TagEditorView } from './views/TagEditorView'
import { PlayerBar } from './components/composite/PlayerBar'
import { useKeyboardShortcuts } from './hooks'
import { useBridge } from './data'
import { AppLayout, Titlebar, LibrarySidebar, ExpandedPlayerPortal } from './layout'


function AppContent () {
  const { currentView, playerExpanded } = useUI()
  const { currentTrack } = useAudio()
  const { theme } = useSettings()
  const bridge = useBridge()

  // All hooks must be called unconditionally before any early return
  useKeyboardShortcuts()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [ theme ])

  const renderView = () => {
    switch (currentView) {
      case 'library':
        return <LibraryView />
      case 'player':
        return <PlayerView />
      case 'settings':
        return <SettingsView />
      case 'tag-editor':
        return <TagEditorView />
      default:
        return <LibraryView />
    }
  }

  return (
    <AppLayout
      titlebar={<Titlebar />}
      sidebar={currentView === 'library' ? <LibrarySidebar /> : undefined}
      main={
        <div className='view-content'>
          {renderView()}
        </div>
      }
      player={
        currentTrack
          ? <>
            <PlayerBar />
            <ExpandedPlayerPortal />
          </>
          : undefined
      }
    />
  )
}

export function App () {
  return (
    <UIProvider>
      <SettingsProvider>
        <LibraryProvider>
          <AudioProvider>
            <AppContent />
          </AudioProvider>
        </LibraryProvider>
      </SettingsProvider>
    </UIProvider>
  )
}
