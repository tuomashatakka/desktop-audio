/**
 * SettingsContext — persisted user preferences.
 *
 * Owns the library paths the scanner is told to walk, the active theme
 * (and any custom theme overrides), playback defaults (volume, repeat
 * mode), and the default row density. Settings are persisted via the
 * data host (localStorage in the browser, IPC + disk in Electron).
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import { useHost } from '../data'


/** Playback repeat behavior at end of queue. */
export type RepeatMode = 'none' | 'one' | 'all'

/** Built-in theme name; `custom` activates {@link CustomTheme} overrides. */
export type Theme = 'dark' | 'light' | 'custom'

/** Selectable UI typeface. Only Montserrat ships with the app. */
export type UiFont = 'montserrat' | 'poppins' | 'helvetica' | 'system'

/**
 * Font stacks per {@link UiFont}. `poppins` and `helvetica` are resolved from
 * the user's installed fonts — neither is bundled, so each falls back through
 * the same chain the system default uses rather than to a stand-in that looks
 * nothing like the request.
 */
export const UI_FONT_STACKS: Record<UiFont, string> = {
  montserrat: '"Montserrat", system-ui, -apple-system, "Segoe UI", sans-serif',
  poppins:    '"Poppins", "Montserrat", system-ui, -apple-system, sans-serif',
  helvetica:  '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
  system:     'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

/**
 * Headings use a separate stack. At the default setting that keeps Sofia Pro,
 * the display face the app ships with — picking another UI font is a request
 * to change the type, not a reason to lose the pairing you never asked about.
 */
export const UI_DISPLAY_STACKS: Record<UiFont, string> = {
  ...UI_FONT_STACKS,
  montserrat: '"Sofia Pro", "Montserrat", system-ui, sans-serif',
}

export const UI_FONT_LABELS: Record<UiFont, string> = {
  montserrat: 'Montserrat',
  poppins:    'Poppins',
  helvetica:  'Helvetica',
  system:     'System default',
}

/** Multiplier on the root font size; every type token is relative to it. */
export const MIN_FONT_SCALE = 0.8

export const MAX_FONT_SCALE = 1.4

/**
 * User-defined CSS variable overrides applied at runtime when the
 * active theme is `custom`. Importable/exportable as JSON.
 */
export interface CustomTheme {
  version: 1,
  name:    string,
  colors:  Record<string, string>,
}

/**
 * Window content dimensions in CSS pixels, matching the renderer's
 * `window.innerWidth`/`innerHeight`. Cached as `compactSize` (the mini
 * player) and `expandedSize` (the size restored when growing back) — each
 * is re-captured on the way out of that size, so resizing the mini window
 * sticks. See `useWindowScale`.
 */
export interface WindowSize {
  readonly width:  number
  readonly height: number
}

/** Persisted settings shape. */
interface Settings {
  readonly libraryPaths:   readonly string[]
  readonly theme:          Theme
  readonly customTheme:    CustomTheme | null
  readonly defaultDensity: 'compact' | 'normal' | 'relaxed'
  readonly volume:         number
  readonly repeatMode:     RepeatMode
  readonly shuffle:        boolean
  readonly compactSize:    WindowSize
  readonly expandedSize:   WindowSize
  readonly uiFont:         UiFont
  readonly fontScale:      number

  /**
   * Accent is stored per built-in theme rather than once: the hue that reads
   * as a highlight on an near-black surface is usually washed out on a light
   * one, so picking a single value forces a compromise on one of them.
   */
  readonly accentDark:  string
  readonly accentLight: string
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
  readonly setShuffle:        (shuffle: boolean) => void
  readonly setCompactSize:    (size: WindowSize) => void
  readonly setExpandedSize:   (size: WindowSize) => void
  readonly setUiFont:         (font: UiFont) => void
  readonly setFontScale:      (scale: number) => void
  readonly setAccent:         (theme: 'dark' | 'light', color: string) => void

  /** The accent that applies to the theme currently in effect. */
  readonly accent: string
}

const STORAGE_KEY = 'desktop-audio-settings'

/** Platform-specific default music directory name (used as hint in settings) */
const DEFAULT_MUSIC_DIR = 'Music'

/** Matches `--mono-turquoise` / a darkened variant of it in `tokens.css`. */
const DEFAULT_ACCENT_DARK  = '#00e5d1'
const DEFAULT_ACCENT_LIGHT = '#00a595'

const defaultSettings: Settings = {
  libraryPaths:   [ DEFAULT_MUSIC_DIR ],
  theme:          'dark',
  customTheme:    null,
  defaultDensity: 'normal',
  volume:         0.8,
  repeatMode:     'none',
  shuffle:        false,
  compactSize:    { width: 560, height: 240 },
  expandedSize:   { width: 1200, height: 800 },
  uiFont:         'montserrat',
  fontScale:      1,
  accentDark:     DEFAULT_ACCENT_DARK,
  accentLight:    DEFAULT_ACCENT_LIGHT,
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
    '--warning':      '#ffc107',
    '--danger':       '#dc3545',
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
type SettingsProviderProps = { readonly children: ReactNode }

export function SettingsProvider ({ children }: SettingsProviderProps) {
  const [ settings, setSettings ]       = useState<Settings>(defaultSettings)
  const [ initialized, setInitialized ] = useState(false)
  const host                            = useHost()

  /** Hydrate settings on mount and resolve the default music dir if needed. */
  useEffect(() => {
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

  const setShuffle = useCallback((shuffle: boolean) => {
    setSettings(s =>
      ({ ...s, shuffle }))
  }, [])

  const setUiFont = useCallback((uiFont: UiFont) => {
    setSettings(s =>
      ({ ...s, uiFont }))
  }, [])

  const setFontScale = useCallback((scale: number) => {
    setSettings(s =>
      ({ ...s, fontScale: Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, scale)) }))
  }, [])

  const setAccent = useCallback((theme: 'dark' | 'light', color: string) => {
    setSettings(s =>
      theme === 'light' ? { ...s, accentLight: color } : { ...s, accentDark: color })
  }, [])

  const setCompactSize = useCallback((compactSize: WindowSize) => {
    setSettings(s =>
      ({ ...s, compactSize }))
  }, [])

  const setExpandedSize = useCallback((expandedSize: WindowSize) => {
    setSettings(s =>
      ({ ...s, expandedSize }))
  }, [])

  const value = useMemo(() =>
    ({
      ...settings,
      accent: settings.theme === 'light' ? settings.accentLight : settings.accentDark,
      addLibraryPath,
      removeLibraryPath,
      setTheme,
      setCustomTheme,
      exportTheme,
      importTheme,
      setDefaultDensity,
      setVolume,
      setRepeatMode,
      setShuffle,
      setCompactSize,
      setExpandedSize,
      setUiFont,
      setFontScale,
      setAccent,
    }), [
    settings,
    addLibraryPath,
    removeLibraryPath,
    setTheme,
    setCustomTheme,
    exportTheme,
    importTheme,
    setDefaultDensity,
    setVolume,
    setRepeatMode,
    setShuffle,
    setCompactSize,
    setExpandedSize,
    setUiFont,
    setFontScale,
    setAccent,
  ])

  return <SettingsContext.Provider value={ value }>
    {children}
  </SettingsContext.Provider>
}

async function loadSettings (): Promise<Settings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored)
      return { ...defaultSettings, ...JSON.parse(stored) }
  }
  catch {
    // Ignore errors
  }

  return { ...defaultSettings, libraryPaths: []}
}

/** Access settings + actions. Throws if used outside {@link SettingsProvider}. */
export function useSettings () {
  const context = useContext(SettingsContext)
  if (!context)
    throw new Error('useSettings must be used within SettingsProvider')
  return context
}

/**
 * Settings if a provider is above, `null` otherwise.
 *
 * For consumers that read a preference but don't depend on one — the audio
 * engine wants to know about shuffle and repeat, yet playback is perfectly
 * meaningful without a settings store, and forcing the provider on it would
 * make {@link AudioProvider} untestable in isolation.
 */
export function useOptionalSettings () {
  return useContext(SettingsContext)
}

export { DEFAULT_CUSTOM_THEME }
