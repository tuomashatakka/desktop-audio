import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useData } from '../data'


export type RepeatMode = 'none' | 'one' | 'all'

export type Theme = 'dark' | 'light' | 'custom'

export interface CustomTheme {
  version: 1,
  name: string,
  colors: Record<string, string>,
}

interface Settings {
  readonly libraryPaths: readonly string[]
  readonly theme:        Theme
  readonly customTheme:  CustomTheme | null
  readonly defaultDensity: 'compact' | 'normal' | 'relaxed'
  readonly volume:       number
  readonly repeatMode:   RepeatMode
}

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

const defaultSettings: Settings = {
  libraryPaths: [],
  theme: 'dark',
  customTheme: null,
  defaultDensity: 'normal',
  volume: 0.8,
  repeatMode: 'none',
}

const STORAGE_KEY = 'desktop-audio-settings'

const DEFAULT_CUSTOM_THEME: CustomTheme = {
  version: 1,
  name: 'Custom Theme',
  colors: {
    '--bg': '#1a1a2e',
    '--bg-raised': '#16213e',
    '--bg-input': '#0f3460',
    '--bg-hover': '#1a1a3e',
    '--accent': '#e94560',
    '--accent-hover': '#ff6b81',
    '--accent-alt': '#533483',
    '--text': '#eee',
    '--text-dim': '#ccc',
    '--text-muted': '#999',
    '--border': '#333',
    '--border-hover': '#555',
    '--success': '#28a745',
    '--warning': '#ffc107',
    '--danger': '#dc3545',
    '--info': '#17a2b8',
    '--wf-unplayed': '#444',
    '--wf-played': '#e94560',
  },
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider ({ children }: { readonly children: ReactNode }) {
  const [ settings, setSettings ] = useState<Settings>(defaultSettings)
  const [ initialized, setInitialized ] = useState(false)
  const data = useData()

  useEffect(() => {
    const init = async () => {
      const loaded = await loadSettings()
      setSettings(loaded)
      setInitialized(true)
    }
    init()
  }, [])

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

  const exportTheme = useCallback(() => {
    return settings.customTheme || { ...DEFAULT_CUSTOM_THEME, name: 'My Custom Theme' }
  }, [settings.customTheme])

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

export function useSettings () {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

export { DEFAULT_CUSTOM_THEME }
