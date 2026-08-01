import { useEffect, useState } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useUI, useAudio, useSettings, useLibrary } from './contexts'
import { LibraryView } from './views/LibraryView'
import { SettingsView } from './views/SettingsView'
import { TagEditorView } from './views/TagEditorView'
import { Player } from './components/composite/Player'
import { useKeyboardShortcuts, useAmbientPalette } from './hooks'
import { AppLayout, Titlebar, LibrarySidebar } from './layout'


function AppContent () {
  const { currentView } = useUI()
  const { theme } = useSettings()
  const { filteredTracks } = useLibrary()
  const { setCurrentQueue } = useAudio()

  // All hooks must be called unconditionally before any early return
  useKeyboardShortcuts()
  useAmbientPalette()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [ theme ])

  useEffect(() => {
    setCurrentQueue(filteredTracks)
  }, [ filteredTracks, setCurrentQueue ])

  // 'player' has no entry: the player is mounted permanently in the shell
  // footer and CSS promotes it to fill the window. Falling through to the
  // library keeps that view's scroll position while it sits behind the player.
  const renderView = () => {
    switch (currentView) {
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
      main={renderView()}
      player={<Player />}
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
