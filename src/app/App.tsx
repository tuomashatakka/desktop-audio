import { useEffect } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useSettings } from './contexts'
import { LibraryView } from './views/LibraryView'
import { LibrarySearch } from './views/LibrarySearch'
import { Player } from './components/composite/Player'
import { useKeyboardShortcuts, useAmbientPalette, useAppearance, useThemeApply } from './hooks'
import { AppLayout, Titlebar, LibrarySidebar, OverlayHost } from './layout'


function AppContent () {
  const { theme, customTheme, uiFont, fontScale, accent } = useSettings()

  // All hooks must be called unconditionally before any early return
  useKeyboardShortcuts()
  useAmbientPalette()
  useThemeApply(theme, theme === 'custom' ? customTheme : null)
  useAppearance({ theme, uiFont, fontScale, accent })

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes `data-theme` onto the document root, which no render reaches.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [ theme ])

  return <AppLayout
    titlebar={
      <Titlebar>
        <LibrarySearch />
      </Titlebar>
    }
    sidebar={ <LibrarySidebar /> }
    main={ <LibraryView /> }
    player={ <Player /> }
    overlays={ <OverlayHost /> } />
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
