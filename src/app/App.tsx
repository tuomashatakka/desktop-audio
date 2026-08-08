import { useEffect } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useAudio, useSettings, useLibrary } from './contexts'
import { LibraryView } from './views/LibraryView'
import { LibraryToolbar } from './views/LibraryToolbar'
import { SettingsView } from './views/SettingsView'
import { TagEditorView } from './views/TagEditorView'
import { Player } from './components/composite/Player'
import { useKeyboardShortcuts, useAmbientPalette, useAppearance } from './hooks'
import { AppLayout, Titlebar, LibrarySidebar } from './layout'


function AppContent () {
  const { theme, uiFont, fontScale, accent } = useSettings()
  const { filteredTracks }                   = useLibrary()
  const { setCurrentQueue }                  = useAudio()

  // All hooks must be called unconditionally before any early return
  useKeyboardShortcuts()
  useAmbientPalette()
  useAppearance({ theme, uiFont, fontScale, accent })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [ theme ])

  useEffect(() => {
    setCurrentQueue(filteredTracks)
  }, [ filteredTracks, setCurrentQueue ])

  return <AppLayout
    titlebar={
      <Titlebar>
        <LibraryToolbar />
      </Titlebar>
    }
    sidebar={ <LibrarySidebar /> }
    main={
      <>
        <div className='app-view app-view-library'>
          <LibraryView />
        </div>

        <div className='app-view app-view-settings'>
          <SettingsView />
        </div>

        <div className='app-view app-view-tag-editor'>
          <TagEditorView />
        </div>
      </>
    }
    player={ <Player /> } />
}

export function App () {
  return <UIProvider>
    <SettingsProvider>
      <LibraryProvider>
        <AudioProvider>
          <AppContent />
        </AudioProvider>
      </LibraryProvider>
    </SettingsProvider>
  </UIProvider>
}
