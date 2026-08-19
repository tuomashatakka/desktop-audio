import { useEffect } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useSettings } from './contexts'
import { LibraryView } from './views/LibraryView'
import { LibrarySearch } from './views/LibrarySearch'
import { Player } from './components/composite/Player'
import { useKeyboardShortcuts, useAmbientPalette, useAppearance, useThemeApply, useAutoNowPlaying } from './hooks'
import { AppLayout, Titlebar, LibrarySidebar, OverlayHost } from './layout'


function AppContent () {
  const {
    resolvedTheme,
    customTheme,
    uiFont,
    monoFont,
    fontScale,
    accent,
    accentSource,
    ambientStrength,
    uiDensity,
    cornerStyle,
  } = useSettings()

  // All hooks must be called unconditionally before any early return
  useKeyboardShortcuts()
  useAutoNowPlaying()

  // The palette is *returned* rather than written straight to `--accent`:
  // `useAppearance` is the single writer of that property, so the artwork feeds
  // it as a value instead of racing it on the same element.
  const artPalette = useAmbientPalette()

  useThemeApply(resolvedTheme, resolvedTheme === 'custom' ? customTheme : null)
  useAppearance({
    theme: resolvedTheme,
    uiFont,
    monoFont,
    fontScale,
    accent,
    accentSource,
    ambientStrength,
    uiDensity,
    cornerStyle,
    artPalette,
  })

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes `data-theme` onto the document root, which no render reaches.
  useEffect(() => {
    // `auto` is already collapsed by the settings context — the stylesheet only
    // ever sees `dark`, `light` or `custom`, which is what keeps a single
    // `[data-theme='light']` block in tokens.css.
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [ resolvedTheme ])

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
