import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'


export type RepeatMode = 'none' | 'one' | 'all'

export type Theme = 'dark' | 'light'

interface Settings {
  readonly libraryPaths: readonly string[]
  readonly theme:        Theme
  readonly volume:       number
  readonly repeatMode:   RepeatMode
}

interface SettingsContextValue extends Settings {
  readonly addLibraryPath:    (path: string) => void
  readonly removeLibraryPath: (path: string) => void
  readonly setTheme:          (theme: Theme) => void
  readonly setVolume:         (volume: number) => void
  readonly setRepeatMode:     (mode: RepeatMode) => void
}

const defaultSettings: Settings = {
  libraryPaths: [],
  theme:        'dark',
  volume:       0.8,
  repeatMode:   'none',
}

const STORAGE_KEY = 'desktop-audio-settings'

async function getDefaultLibraryPath (): Promise<string | null> {
  if (window.electronAPI?.getMusicLibraryPath) {
    try {
      return await window.electronAPI.getMusicLibraryPath()
    }
    catch {
      // Ignore errors
    }
  }
  return null
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

  const musicPath = await getDefaultLibraryPath()
  return { ...defaultSettings, libraryPaths: musicPath ? [ musicPath ] : []}
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider ({ children }: { readonly children: ReactNode }) {
  const [ settings, setSettings ] = useState<Settings>(defaultSettings)
  const [ initialized, setInitialized ] = useState(false)

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
        setVolume,
        setRepeatMode,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings () {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
