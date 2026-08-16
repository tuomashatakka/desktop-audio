/**
 * SettingsContext — persisted user preferences.
 *
 * Owns the library paths the scanner is told to walk, the active theme
 * (and any custom theme overrides), playback defaults (volume, repeat
 * mode), and the default row density. Settings are persisted via the
 * data host (localStorage in the browser, IPC + disk in Electron).
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useHost } from '../data'
import { DEFAULT_DSP, normalizeDsp } from '../services/dspChain'
import type { DspSettings } from '../services/dspChain'
import { DEFAULT_CUSTOM_THEME, normalizeCustomTheme } from '../utils/theme'
import type { CustomTheme } from '../utils/theme'


export type { CustomTheme } from '../utils/theme'


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

  /**
   * The processing chain's parameters, global rather than per track.
   *
   * Read by `AudioContext`, which pushes them onto the live Web Audio nodes.
   * Hydration runs them through `normalizeDsp` — see `loadSettings` below for
   * why that is not optional.
   */
  readonly dsp: DspSettings
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

  /**
   * One setter for the whole DSP slice, taking a function for the same reason
   * `update` does: the panel's handlers would otherwise close over a
   * render-old `dsp`, and two writes in one tick would drop one.
   *
   * The result is normalised on the way in, so a caller cannot store a gain
   * array of the wrong length or a parameter outside its range.
   */
  readonly updateDsp: (change: (dsp: DspSettings) => DspSettings) => void

  /** The accent that applies to the theme currently in effect. */
  readonly accent: string

  /**
   * False until the stored settings have replaced the defaults.
   *
   * Anything that *deletes* on the strength of `libraryPaths` has to wait for
   * this. Settings load asynchronously, so before it flips `libraryPaths` is
   * whatever the defaults say — and acting on that would discard a library
   * because a `localStorage` read had not landed yet.
   */
  readonly ready: boolean
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
  dsp:            DEFAULT_DSP,
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/**
 * Loads settings from the data host on mount, exposes them via context,
 * and writes back on change. Renders children only after initial load.
 */
type SettingsProviderProps = { readonly children: ReactNode }

export function SettingsProvider ({ children }: SettingsProviderProps) {
  const [ settings, setSettings ] = useState<Settings>(defaultSettings)

  /** See {@link SettingsContextValue.ready}. */
  const [ ready, setReady ] = useState(false)
  const host                = useHost()

  /**
   * A mirror of `settings` for {@link update} to read.
   *
   * It cannot read the state variable: every mutation below is a `useCallback`
   * with an empty dependency list, so closing over `settings` would make each
   * one persist whatever happened to be current when it was created.
   */
  const settingsRef = useRef(settings)

  /** Replace settings without writing them straight back out again. */
  const hydrate = useCallback((next: Settings) => {
    settingsRef.current = next
    setSettings(next)
    setReady(true)
  }, [])

  /**
   * Every mutation goes through here, so persisting is part of making the
   * change rather than an effect watching for one. That also retires the
   * `initialized` flag, which existed only to stop the old effect echoing
   * freshly-loaded settings back to storage.
   *
   * The write happens outside the state updater, which React may run more than
   * once and whose result a discarded render would never commit.
   */
  const update = useCallback((change: (current: Settings) => Settings) => {
    const next          = change(settingsRef.current)
    settingsRef.current = next
    persistSettings(next)
    setSettings(next)
  }, [])

  /** Hydrate settings on mount and resolve the default music dir if needed. */
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Awaits the stored settings and the host's music directory on mount; an async read has no render-phase equivalent.
  useEffect(() => {
    const init = async () => {
      const loaded = await loadSettings()

      // If we're on a fresh install or using the default 'Music' placeholder,
      // try to resolve the actual system music directory.
      if (loaded.libraryPaths.length === 1 && loaded.libraryPaths[0] === 'Music') {
        const musicDir = await host.getMusicDir()
        if (musicDir) {
          hydrate({ ...settingsRef.current, ...loaded, libraryPaths: [ musicDir ]})
          return
        }
      }

      hydrate(loaded)
    }
    init()
  }, [ host, hydrate ])

  const addLibraryPath = useCallback((path: string) => {
    update(s => {
      if (s.libraryPaths.includes(path))
        return s
      return { ...s, libraryPaths: [ ...s.libraryPaths, path ]}
    })
  }, [])

  const removeLibraryPath = useCallback((path: string) => {
    update(s =>
      ({
        ...s,
        libraryPaths: s.libraryPaths.filter(p =>
          p !== path),
      }))
  }, [])

  const setTheme = useCallback((theme: Theme) => {
    update(s =>
      ({ ...s, theme }))
  }, [])

  const setCustomTheme = useCallback((customTheme: CustomTheme | null) => {
    update(s =>
      ({ ...s, customTheme: customTheme ? normalizeCustomTheme(customTheme) : null }))
  }, [])

  const exportTheme = useCallback(() =>
    settings.customTheme || { ...DEFAULT_CUSTOM_THEME, name: 'My Custom Theme' }, [ settings.customTheme ])

  const importTheme = useCallback((theme: CustomTheme) => {
    update(s =>
      ({ ...s, customTheme: normalizeCustomTheme(theme), theme: 'custom' }))
  }, [])

  const setDefaultDensity = useCallback((defaultDensity: 'compact' | 'normal' | 'relaxed') => {
    update(s =>
      ({ ...s, defaultDensity }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    update(s =>
      ({ ...s, volume: Math.max(0, Math.min(1, volume)) }))
  }, [])

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    update(s =>
      ({ ...s, repeatMode: mode }))
  }, [])

  const setShuffle = useCallback((shuffle: boolean) => {
    update(s =>
      ({ ...s, shuffle }))
  }, [])

  const setUiFont = useCallback((uiFont: UiFont) => {
    update(s =>
      ({ ...s, uiFont }))
  }, [])

  const setFontScale = useCallback((scale: number) => {
    update(s =>
      ({ ...s, fontScale: Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, scale)) }))
  }, [])

  const setAccent = useCallback((theme: 'dark' | 'light', color: string) => {
    update(s =>
      theme === 'light' ? { ...s, accentLight: color } : { ...s, accentDark: color })
  }, [])

  const updateDsp = useCallback((change: (dsp: DspSettings) => DspSettings) => {
    update(s =>
      ({ ...s, dsp: normalizeDsp(change(s.dsp)) }))
  }, [])

  const setCompactSize = useCallback((compactSize: WindowSize) => {
    update(s =>
      ({ ...s, compactSize }))
  }, [])

  const setExpandedSize = useCallback((expandedSize: WindowSize) => {
    update(s =>
      ({ ...s, expandedSize }))
  }, [])

  const value = useMemo(() =>
    ({
      ...settings,
      accent: settings.theme === 'light' ? settings.accentLight : settings.accentDark,
      ready,
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
      updateDsp,
    }), [
    settings,
    ready,
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
    updateDsp,
  ])

  return <SettingsContext.Provider value={ value }>
    {children}
  </SettingsContext.Provider>
}

/** The write half of {@link loadSettings}. */
function persistSettings (settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }
  catch {
    // A preference we could not store is not worth failing the click over.
  }
}

async function loadSettings (): Promise<Settings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)

      // The spread is *shallow*, so a stored `dsp` replaces the whole default
      // subtree rather than merging into it — a build that predates a field, or
      // a hand-edited value, would arrive with keys missing or an `eq.gains` of
      // the wrong length, and a short array leaves the trailing bands silently
      // unwritten. `normalizeDsp` is what closes that.
      return {
        ...defaultSettings,
        ...parsed,
        customTheme: parsed?.customTheme
          ? normalizeCustomTheme(parsed.customTheme)
          : null,
        dsp: normalizeDsp(parsed?.dsp),
      }
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
