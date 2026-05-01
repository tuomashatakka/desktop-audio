import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useBridge } from '../data'


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

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider ({ children }: { readonly children: ReactNode }) {
  const [ settings, setSettings ] = useState<Settings>(defaultSettings)
  const [ initialized, setInitialized ] = useState(false)
  const bridge = useBridge()

  useEffect(() => {
    const init = async () => {
      const loaded = await loadSettings(bridge)
      setSettings(loaded)
      setInitialized(true)
    }
    init()
  }, [ bridge ])

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

async function loadSettings (bridge: { getMusicDir(): Promise<string | null> }): Promise<Settings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) }
    }
  }
  catch {
    // Ignore errors
  }

  const musicPath = await getDefaultLibraryPath(bridge)
  return { ...defaultSettings, libraryPaths: musicPath ? [ musicPath ] : []}
}

async function getDefaultLibraryPath (bridge: { getMusicDir(): Promise<string | null> }): Promise<string | null> {
  try {
    return await bridge.getMusicDir()
  }
  catch {
    // Ignore errors
  }
  return null
}

export function useSettings () {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}
