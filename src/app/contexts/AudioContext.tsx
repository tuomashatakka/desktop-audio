import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { Track } from './LibraryContext'
import { useBridge } from '../data'


interface AudioState {
  readonly isPlaying:    boolean
  readonly currentTime:  number
  readonly duration:     number
  readonly currentTrack: Track | null
  readonly volume:       number
  readonly isLoading:    boolean
  readonly waveformBars: Float32Array | null
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
  readonly analyzer:     AnalyserNode | null
}

/** Decode an audio file and compute per-bar RMS amplitudes for the waveform. */
async function decodeWaveformBars (
  buffer: ArrayBuffer,
  barCount: number,
  audioCtx: globalThis.AudioContext
): Promise<Float32Array> {
  const decoded = await audioCtx.decodeAudioData(buffer)
  const channel = decoded.getChannelData(0)
  const samplesPerBar = Math.floor(channel.length / barCount)
  const bars = new Float32Array(barCount)

  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar
    // eslint-disable-next-line functional/no-let
    let sum = 0
    for (let j = start; j < start + samplesPerBar; j++) {
      sum += channel[j] * channel[j]
    }
    bars[i] = Math.sqrt(sum / samplesPerBar)
  }

  // Normalise to [0.07, 1.0]
  const max = bars.reduce((a, b) =>
    Math.max(a, b), 0.001)
  for (let i = 0; i < barCount; i++) {
    bars[i] = Math.max(0.07, bars[i] / max)
  }

  return bars
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
    waveformBars: null,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<globalThis.AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const [ analyzer, setAnalyzer ] = useState<AnalyserNode | null>(null)
  const bridge = useBridge()

  // Refs for MediaSession handlers to avoid circular deps
  const pauseRef = useRef<() => void>(() => {})
  const resumeRef = useRef<() => void>(() => {})
  const seekRef = useRef<(time: number) => void>(() => {})
  const playNextRef = useRef<(tracks: readonly Track[]) => void>(() => {})
  const playPreviousRef = useRef<(tracks: readonly Track[]) => void>(() => {})

  // MediaSession: set up metadata & handlers when track changes
  useEffect(() => {
    if (!navigator.mediaSession || !state.currentTrack)
      return

    navigator.mediaSession.metadata = new MediaMetadata({
      title:   state.currentTrack.title || 'Unknown Title',
      artist:  state.currentTrack.artist || 'Unknown Artist',
      album:   state.currentTrack.album || 'Unknown Album',
      artwork: state.currentTrack.albumArt
        ? [
          { src: state.currentTrack.albumArt, sizes: '96x96', type: 'image/jpeg' }
        ]
        : []
    })

    navigator.mediaSession.setActionHandler('play', () => {
      resumeRef.current()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      pauseRef.current()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      playPreviousRef.current([])
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNextRef.current([])
    })
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (details.seekTime !== undefined) {
        seekRef.current(details.seekTime)
      }
    })
  }, [ state.currentTrack ])

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.volume = state.volume
    }

    const audio = audioRef.current

    const handleTimeUpdate = () => {
      setState(s =>
        ({ ...s, currentTime: audio.currentTime }))
      if (navigator.mediaSession && state.currentTrack) {
        navigator.mediaSession.setPositionState({
          duration:     state.duration,
          playbackRate: 1,
          position:     audio.currentTime
        })
      }
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

  useEffect(() =>
    () => {
      const audio = audioRef.current
      if (audio && audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src)
      }
      if (navigator.mediaSession) {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('seekto', null)
        navigator.mediaSession.metadata = null
      }
    }, [])

  // Push current playback state to OS native media controls (MPRIS on Linux)
  const mediaStateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!state.currentTrack)
      return

    if (mediaStateDebounceRef.current)
      clearTimeout(mediaStateDebounceRef.current)

    mediaStateDebounceRef.current = setTimeout(() => {
      if (!state.currentTrack)
        return
      bridge.updateMediaState({
        title:     state.currentTrack.title,
        artist:    state.currentTrack.artist,
        album:     state.currentTrack.album,
        albumArt:  state.currentTrack.albumArt,
        isPlaying: state.isPlaying,
        position:  state.currentTime,
        duration:  state.duration,
      })
    }, 500)

    return () => {
      if (mediaStateDebounceRef.current)
        clearTimeout(mediaStateDebounceRef.current)
    }
  }, [ state.currentTrack, state.isPlaying, state.currentTime, state.duration, bridge ])

  // Handle seek events forwarded from MPRIS (delta in microseconds)
  useEffect(() => {
    return bridge.onMediaSeek((delta: number) => {
      const audio = audioRef.current
      if (!audio)
        return
      const newTime = Math.max(0, audio.currentTime + delta / 1e6)
      audio.currentTime = newTime
      setState(s =>
        ({ ...s, currentTime: newTime }))
    })
  }, [ bridge ])

  const setupAnalyzer = useCallback(() => {
    if (!audioRef.current)
      return analyzerRef.current

    if (!audioContextRef.current) {
      audioContextRef.current = new globalThis.AudioContext()
    }

    const ctx = audioContextRef.current
    if (!analyzerRef.current) {
      analyzerRef.current = ctx.createAnalyser()
      analyzerRef.current.fftSize = 256
      analyzerRef.current.connect(ctx.destination)
      setAnalyzer(analyzerRef.current)
    }

    if (!sourceRef.current && audioRef.current) {
      sourceRef.current = ctx.createMediaElementSource(audioRef.current)
      sourceRef.current.connect(analyzerRef.current)
    }

    return analyzerRef.current
  }, [])

  const play = useCallback(async (track: Track) => {
    const audio = audioRef.current
    if (!audio)
      return

    setState(s =>
      ({ ...s, waveformBars: null, currentTrack: track, isPlaying: true, currentTime: 0 }))

    try {
      setupAnalyzer()

      const buffer = await bridge.readFile(track.path)
      if (!buffer) {
        throw new Error('Failed to read file')
      }

      const blob = new Blob([ buffer ])
      const audioUrl = URL.createObjectURL(blob)

      const oldUrl = audio.src
      if (oldUrl && oldUrl.startsWith('blob:')) {
        URL.revokeObjectURL(oldUrl)
      }

      audio.src = audioUrl
      await audio.play()

      const ctx = audioContextRef.current
      if (ctx) {
        blob.arrayBuffer()
          .then(ab =>
            decodeWaveformBars(ab, 80, ctx))
          .then(bars =>
            setState(s =>
              ({ ...s, waveformBars: bars })))
          .catch(() => {})
      }
    }
    catch (error) {
      console.error('Error playing audio:', error)
    }
  }, [ setupAnalyzer ])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.pause()
    setState(s =>
      ({ ...s, isPlaying: false }))

    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'paused'
    }
  }, [])

  const resume = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.play().catch(console.error)
    setState(s =>
      ({ ...s, isPlaying: true }))

    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'playing'
    }
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.pause()
    audio.currentTime = 0

    if (audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(audio.src)
    }

    setState(s =>
      ({
        ...s,
        isPlaying:    false,
        currentTime:  0,
        currentTrack: null,
      }))

    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'none'
      navigator.mediaSession.metadata = null
    }
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

  // Sync refs after all callbacks are defined
  pauseRef.current = pause
  resumeRef.current = resume
  seekRef.current = seek
  playNextRef.current = playNext
  playPreviousRef.current = playPrevious

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
        analyzer,
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
