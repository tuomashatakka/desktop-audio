import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { Track } from './LibraryContext'


function convertFilePathToUrl (filePath: string): string {
  if (filePath.startsWith('file://') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath
  }
  return `file://${filePath}`
}


interface AudioState {
  readonly isPlaying:    boolean
  readonly currentTime:  number
  readonly duration:     number
  readonly currentTrack: Track | null
  readonly volume:       number
  readonly isLoading:    boolean
}

interface AudioContextValue extends AudioState {
  readonly play:         (track: Track) => void
  readonly pause:        () => void
  readonly resume:       () => void
  readonly stop:         () => void
  readonly seek:         (time: number) => void
  readonly setVolume:    (volume: number) => void
  readonly playNext:     (tracks: readonly Track[]) => void
  readonly playPrevious: (tracks: readonly Track[]) => void
}

const AudioContext = createContext<AudioContextValue | null>(null)

export function AudioProvider ({ children }: { readonly children: ReactNode }) {
  const [ state, setState ] = useState<AudioState>({
    isPlaying:    false,
    currentTime:  0,
    duration:     0,
    currentTrack: null,
    volume:       0.8,
    isLoading:    false,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.volume = state.volume
    }

    const audio = audioRef.current

    const handleTimeUpdate = () => {
      setState(s =>
        ({ ...s, currentTime: audio.currentTime }))
    }

    const handleDurationChange = () => {
      setState(s =>
        ({ ...s, duration: audio.duration }))
    }

    const handleEnded = () => {
      setState(s =>
        ({ ...s, isPlaying: false, currentTime: 0 }))
    }

    const handleLoadStart = () => {
      setState(s =>
        ({ ...s, isLoading: true }))
    }

    const handleCanPlay = () => {
      setState(s =>
        ({ ...s, isLoading: false }))
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = state.volume
    }
  }, [ state.volume ])

  const play = useCallback((track: Track) => {
    const audio = audioRef.current
    if (!audio)
      return

    const audioUrl = convertFilePathToUrl(track.path)
    audio.src = audioUrl
    audio.play().catch(error => {
      console.error('Error playing audio:', error)
    })
    setState(s =>
      ({
        ...s,
        currentTrack: track,
        isPlaying:    true,
        currentTime:  0,
      }))
  }, [])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.pause()
    setState(s =>
      ({ ...s, isPlaying: false }))
  }, [])

  const resume = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.play().catch(console.error)
    setState(s =>
      ({ ...s, isPlaying: true }))
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.pause()
    audio.currentTime = 0
    setState(s =>
      ({
        ...s,
        isPlaying:    false,
        currentTime:  0,
        currentTrack: null,
      }))
  }, [])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.currentTime = time
    setState(s =>
      ({ ...s, currentTime: time }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    setState(s =>
      ({ ...s, volume: Math.max(0, Math.min(1, volume)) }))
  }, [])

  const playNext = useCallback(
    (tracks: readonly Track[]) => {
      if (!state.currentTrack || tracks.length === 0)
        return

      const currentIndex = tracks.findIndex(t =>
        t.id === state.currentTrack?.id)
      const nextIndex = currentIndex + 1

      if (nextIndex < tracks.length) {
        play(tracks[nextIndex])
      }
    },
    [ state.currentTrack, play ]
  )

  const playPrevious = useCallback(
    (tracks: readonly Track[]) => {
      if (!state.currentTrack || tracks.length === 0)
        return

      const currentIndex = tracks.findIndex(t =>
        t.id === state.currentTrack?.id)
      const prevIndex = currentIndex - 1

      if (prevIndex >= 0) {
        play(tracks[prevIndex])
      }
    },
    [ state.currentTrack, play ]
  )

  return (
    <AudioContext.Provider
      value={{
        ...state,
        play,
        pause,
        resume,
        stop,
        seek,
        setVolume,
        playNext,
        playPrevious,
      }}
    >
      {children}
    </AudioContext.Provider>
  )
}

export function useAudio () {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider')
  }
  return context
}
