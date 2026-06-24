/**
 * SettingsContext — persisted user preferences.
 *
 * Owns the library paths the scanner is told to walk, the active theme
 * (and any custom theme overrides), playback defaults (volume, repeat
 * mode), and the default row density. Settings are persisted via the
 * data host (localStorage in the browser, IPC + disk in Electron).
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useHost } from '../data'


/** Playback repeat behavior at end of queue. */
export type RepeatMode = 'none' | 'one' | 'all'

/** Built-in theme name; `custom` activates {@link CustomTheme} overrides. */
export type Theme = 'dark' | 'light' | 'custom'

/**
 * User-defined CSS variable overrides applied at runtime when the
 * active theme is `custom`. Importable/exportable as JSON.
 */
export interface CustomTheme {
  version: 1,
  name:    string,
  colors:  Record<string, string>,
}

/** Persisted settings shape. */
interface Settings {
  readonly libraryPaths:   readonly string[]
  readonly theme:          Theme
  readonly customTheme:    CustomTheme | null
  readonly defaultDensity: 'compact' | 'normal' | 'relaxed'
  readonly volume:         number
  readonly repeatMode:     RepeatMode
}

/** Settings plus the action handlers exposed to consumers. */
interface SettingsContextValue extends Settings {
  readonly addLibraryPath:    (path: string) => void
  readonly removeLibraryPath: (path: string) => void
  readonly setTheme:          (theme: Theme) => void
  readonly setCustomTheme:    (theme: CustomTheme | null) => void
  readonly exportTheme:       () => CustomTheme
  readonly importTheme:       (theme: CustomTheme) => void
  readonly setDefaultDensity: (density: 'compact' | 'normal' | 'relaxed') => void
  readonly setVolume:         (volume: number) => void
  readonly setRepeatMode:     (mode: RepeatMode) => void
}

const STORAGE_KEY = 'desktop-audio-settings'

/** Platform-specific default music directory name (used as hint in settings) */
const DEFAULT_MUSIC_DIR = 'Music'

const defaultSettings: Settings = {
  libraryPaths:   [ DEFAULT_MUSIC_DIR ],
  theme:          'dark',
  customTheme:    null,
  defaultDensity: 'normal',
  volume:         0.8,
  repeatMode:     'none',
}

const DEFAULT_CUSTOM_THEME: CustomTheme = {
  version: 1,
  name:    'Custom Theme',
  colors:  {
    '--bg':           '#1a1a2e',
    '--bg-raised':    '#16213e',
    '--bg-input':     '#0f3460',
    '--bg-hover':     '#1a1a3e',
    '--accent':       '#e94560',
    '--accent-hover': '#ff6b81',
    '--accent-alt':   '#533483',
    '--text':         '#eee',
    '--text-dim':     '#ccc',
    '--text-muted':   '#999',
    '--border':       '#333',
    '--border-hover': '#555',
    '--success':      '#28a745',
    '--warning':     '#ffc107',
    '--danger':      '#dc3545',
    '--info':         '#17a2b8',
    '--wf-unplayed':  '#444',
    '--wf-played':    '#e94560',
  },
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/**
 * Loads settings from the data host on mount, exposes them via context,
 * and writes back on change. Renders children only after initial load.
 */
export function SettingsProvider ({ children }: { readonly children: ReactNode }) {
  const [ settings, setSettings ] = useState<Settings>(defaultSettings)
  const [ initialized, setInitialized ] = useState(false)
  const host = useHost()

  useEffect(() => {
    /** Hydrate settings on mount and resolve the default music dir if needed. */
    const init = async () => {
      const loaded = await loadSettings()

      // If we're on a fresh install or using the default 'Music' placeholder,
      // try to resolve the actual system music directory.
      if (loaded.libraryPaths.length === 1 && loaded.libraryPaths[0] === 'Music') {
        const musicDir = await host.getMusicDir()
        if (musicDir) {
          setSettings(s =>
            ({ ...s, ...loaded, libraryPaths: [ musicDir ]}))
          setInitialized(true)
          return
        }
      }

      setSettings(loaded)
      setInitialized(true)
    }
    init()
  }, [ host ])

  useEffect(() => {
    if (!initialized)
      return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    }
    catch {
      // Ignore storage errors
    }
  }, [ settings, initialized ])

  const addLibraryPath = useCallback((path: string) => {
    setSettings(s => {
      if (s.libraryPaths.includes(path))
        return s
      return { ...s, libraryPaths: [ ...s.libraryPaths, path ]}
    })
  }, [])

  const removeLibraryPath = useCallback((path: string) => {
    setSettings(s =>
      ({
        ...s,
        libraryPaths: s.libraryPaths.filter(p =>
          p !== path),
      }))
  }, [])

  const setTheme = useCallback((theme: Theme) => {
    setSettings(s =>
      ({ ...s, theme }))
  }, [])

  const setCustomTheme = useCallback((customTheme: CustomTheme | null) => {
    setSettings(s =>
      ({ ...s, customTheme }))
  }, [])

  const exportTheme = useCallback(() =>
    settings.customTheme || { ...DEFAULT_CUSTOM_THEME, name: 'My Custom Theme' }, [ settings.customTheme ])

  const importTheme = useCallback((theme: CustomTheme) => {
    setSettings(s =>
      ({ ...s, customTheme: theme, theme: 'custom' }))
  }, [])

  const setDefaultDensity = useCallback((defaultDensity: 'compact' | 'normal' | 'relaxed') => {
    setSettings(s =>
      ({ ...s, defaultDensity }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    setSettings(s =>
      ({ ...s, volume: Math.max(0, Math.min(1, volume)) }))
  }, [])

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    setSettings(s =>
      ({ ...s, repeatMode: mode }))
  }, [])

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        addLibraryPath,
        removeLibraryPath,
        setTheme,
        setCustomTheme,
        exportTheme,
        importTheme,
        setDefaultDensity,
        setVolume,
        setRepeatMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

async function loadSettings (): Promise<Settings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) }
    }
  }
  catch {
    // Ignore errors
  }

  return { ...defaultSettings, libraryPaths: []}
}

/** Access settings + actions. Throws if used outside {@link SettingsProvider}. */
export function useSettings () {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

export { DEFAULT_CUSTOM_THEME }
