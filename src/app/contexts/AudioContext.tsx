/**
 * AudioContext — Web Audio playback engine wired into React.
 *
 * Drives a single `<audio>` element through an {@link AudioContext} graph
 * (gain → analyzer → destination), exposes transport controls, and decodes
 * waveform-bar amplitudes for visualizers. Queue navigation (next/previous)
 * is delegated by callers passing the current track list.
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { Track } from './LibraryContext'
import { useOptionalSettings } from './SettingsContext'
import type { RepeatMode } from './SettingsContext'
import { useHost, useData } from '../data'
import { noop } from '../utils/noop'


/** Read-only playback state. */
interface AudioState {
  readonly isPlaying:    boolean
  readonly currentTime:  number
  readonly duration:     number
  readonly currentTrack: Track | null
  readonly volume:       number
  readonly isLoading:    boolean
  readonly waveformBars: Float32Array | null
}

/** Playback state plus the transport actions exposed to the UI. */
interface AudioContextValue extends AudioState {
  readonly play:            (track: Track) => void
  readonly pause:           () => void
  readonly resume:          () => void
  readonly stop:            () => void
  readonly seek:            (time: number) => void
  readonly setVolume:       (volume: number) => void
  readonly playNext:        (tracks: readonly Track[]) => void
  readonly playPrevious:    (tracks: readonly Track[]) => void
  readonly analyzer:        AnalyserNode | null
  readonly setCurrentQueue: (tracks: Track[]) => void

  /** Ensure audio context is ready (resumes if suspended). Call after user gesture. */
  readonly ensureReady: () => Promise<void>
}

/** Direction of travel through the queue, as asked for by the transport. */
type Step = 1 | -1

/**
 * The track a step lands on, given shuffle and repeat.
 *
 * Shuffle ignores direction — "previous" in a shuffled queue is another
 * arbitrary track, not a history stack, and pretending otherwise would need
 * play history this engine doesn't keep. Repeat `all` wraps at either end;
 * repeat `none` stops there by returning `null`. Repeat `one` is handled by
 * the caller, since it re-seeks rather than picking anything.
 */
function pickTrack (
  tracks: readonly Track[],
  current: Track | null,
  step: Step,
  shuffle: boolean,
  repeat: RepeatMode
): Track | null {
  if (tracks.length === 0)
    return null

  const index = current
    ? tracks.findIndex(t =>
      t.id === current.id)
    : -1

  if (shuffle) {
    const pool = tracks.filter((_, i) =>
      i !== index)
    return pool[Math.floor(Math.random() * pool.length)] ?? tracks[0] ?? null
  }

  const next = index + step
  if (next >= 0 && next < tracks.length)
    return tracks[next]

  if (repeat === 'all')
    return step > 0 ? tracks[0] : tracks[tracks.length - 1]

  return null
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

/** Global reference to ensureReady function, set by AudioProvider on mount */
// eslint-disable-next-line functional/no-let
let globalEnsureReady: (() => Promise<void>) | null = null

// Register the renderer-wide `ensureReady` so non-React code (e.g. the
//  first-pointer-event handler) can resume the audio context on demand.
export function setGlobalEnsureReady (fn: (() => Promise<void>) | null) {
  globalEnsureReady = fn
}

/** Retrieve the currently-registered `ensureReady` if {@link AudioProvider} is mounted. */
export function getGlobalEnsureReady (): (() => Promise<void>) | null {
  return globalEnsureReady
}

/**
 * Refs the transport actions register themselves into (set near the bottom
 * of {@link AudioProvider}, read from the media-session handlers below and
 * from the `ended` listener) plus the metadata/action-handler wiring itself.
 * Split out purely to keep `AudioProvider`'s own statement count down —
 * the refs are still shared, mutable objects either way.
 */
function useMediaSessionRefs (currentTrack: Track | null) {
  const pauseRef = useRef<() => void>(noop)
  const resumeRef = useRef<() => void>(noop)
  const seekRef = useRef<(time: number) => void>(noop)
  const playNextRef = useRef<(tracks: readonly Track[]) => void>(noop)
  const playPreviousRef = useRef<(tracks: readonly Track[]) => void>(noop)

  /** What to do when a track runs out. Reassigned every render, see below. */
  const advanceRef = useRef<() => void>(noop)

  // Track the current playlist being played
  const currentQueueRef = useRef<Track[]>([])
  const setCurrentQueue = useCallback((tracks: Track[]) => {
    currentQueueRef.current = tracks
  }, [])

  // MediaSession: set up metadata & handlers when track changes
  useEffect(() => {
    if (!navigator.mediaSession || !currentTrack)
      return

    navigator.mediaSession.metadata = new MediaMetadata({
      title:   currentTrack.title || 'Unknown Title',
      artist:  currentTrack.artist || 'Unknown Artist',
      album:   currentTrack.album || 'Unknown Album',
      artwork: currentTrack.albumArt
        ? [
          { src: currentTrack.albumArt, sizes: '96x96', type: 'image/jpeg' }
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
      playPreviousRef.current(currentQueueRef.current)
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNextRef.current(currentQueueRef.current)
    })
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (details.seekTime !== undefined) {
        seekRef.current(details.seekTime)
      }
    })
  }, [ currentTrack ])

  return {
    pauseRef,
    resumeRef,
    seekRef,
    playNextRef,
    playPreviousRef,
    advanceRef,
    currentQueueRef,
    setCurrentQueue,
  }
}

/**
 * Hosts the lazily-initialized Web Audio graph and exposes transport actions
 * via {@link useAudio}. Resumes the audio context on first user gesture.
 */
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

  // Playback preferences are read, never written, from here — the toggles in
  // the player write straight to settings, which is where they persist.
  const settings = useOptionalSettings()
  const repeatMode = settings?.repeatMode ?? 'none'
  const shuffle = settings?.shuffle ?? false

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<globalThis.AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const [ analyzer, setAnalyzer ] = useState<AnalyserNode | null>(null)
  const host = useHost()
  const data = useData()

  const {
    pauseRef, resumeRef, seekRef, playNextRef, playPreviousRef,
    advanceRef, currentQueueRef, setCurrentQueue,
  } = useMediaSessionRefs(state.currentTrack)

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

    // Registered once, so it defers to a ref rather than closing over the
    // repeat/shuffle values that were current when the effect first ran.
    const handleEnded = () => {
      advanceRef.current()
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
      host.updateMediaState({
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
  }, [ state.currentTrack, state.isPlaying, state.currentTime, state.duration, host ])

  // Handle seek events forwarded from MPRIS (delta in microseconds)
  useEffect(() =>
    host.onMediaSeek((delta: number) => {
      const audio = audioRef.current
      if (!audio)
        return

      const newTime = Math.max(0, audio.currentTime + delta / 1e6)
      audio.currentTime = newTime
      setState(s =>
        ({ ...s, currentTime: newTime }))
    }), [ host ])

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

      const buffer = await data.readBytes(track.id)
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
            decodeWaveformBars(ab, 400, ctx))
          .then(bars =>
            setState(s =>
              ({ ...s, waveformBars: bars })))
          .catch(noop)
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
      const next = pickTrack(tracks, state.currentTrack, 1, shuffle, repeatMode)
      if (next)
        play(next)
    },
    [ state.currentTrack, play, shuffle, repeatMode ]
  )

  const playPrevious = useCallback(
    (tracks: readonly Track[]) => {
      const previous = pickTrack(tracks, state.currentTrack, -1, shuffle, repeatMode)
      if (previous)
        play(previous)
    },
    [ state.currentTrack, play, shuffle, repeatMode ]
  )

  /**
   * End-of-track advance. Repeat `one` restarts the same file rather than
   * going back through `play()` — no re-read, no waveform re-decode, and the
   * loop is gapless as far as the element is concerned.
   */
  advanceRef.current = () => {
    const audio = audioRef.current

    if (repeatMode === 'one' && audio) {
      audio.currentTime = 0
      audio.play().catch(console.error)
      setState(s =>
        ({ ...s, currentTime: 0, isPlaying: true }))
      return
    }

    const next = pickTrack(currentQueueRef.current, state.currentTrack, 1, shuffle, repeatMode)
    if (next) {
      play(next)
      return
    }

    setState(s =>
      ({ ...s, isPlaying: false, currentTime: 0 }))
  }

  // Ensure audio context is ready (resume if suspended due to autoplay policy)
  const ensureReady = useCallback(async () => {
    const ctx = audioContextRef.current
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume()
    }
  }, [])

  // Sync refs after all callbacks are defined
  pauseRef.current = pause
  resumeRef.current = resume
  seekRef.current = seek
  playNextRef.current = playNext
  playPreviousRef.current = playPrevious

  // Register global ensureReady for first-pointer-event handler
  useEffect(() => {
    setGlobalEnsureReady(ensureReady)
    return () => {
      setGlobalEnsureReady(null)
    }
  }, [ ensureReady ])

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
        setCurrentQueue,
        ensureReady,
      }}
    >
      {children}
    </AudioContext.Provider>
  )
}

/** Access playback state + transport. Throws if used outside {@link AudioProvider}. */
export function useAudio () {
  const context = useContext(AudioContext)
  if (!context) {
    throw new Error('useAudio must be used within AudioProvider')
  }
  return context
}
