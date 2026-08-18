/**
 * AudioContext — Web Audio playback engine wired into React.
 *
 * Drives a single `<audio>` element through an {@link AudioContext} graph —
 * `source → DSP chain → analyzer → destination` — exposes transport controls,
 * and decodes waveform-bar amplitudes for visualizers. Volume is not a node in
 * that graph; it is set straight on the media element.
 *
 * The analyser sits *after* the DSP chain on purpose, so the spectrum panel
 * shows what is coming out rather than what went in: move an EQ fader with the
 * visualizer open and you watch it happen.
 *
 * Playback runs off a real queue held here. Callers hand a list *once*, when
 * they start playback (`playQueue(tracks, index)`), and next/previous walk it
 * by index from then on. They used to pass a list on every step, which meant
 * the queue was whatever list the caller happened to be holding — the library
 * handed over its whole filtered set, so starting a track inside one album and
 * pressing next left the album entirely.
 */
import type { ReactNode } from 'react'
import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { Track } from './LibraryContext'
import { useOptionalSettings } from './SettingsContext'
import type { RepeatMode } from './SettingsContext'
import { createDspChain, DEFAULT_DSP } from '../services/dspChain'
import type { DspChain, DspSettings, DynamicsModule } from '../services/dspChain'
import { useData } from '../data'
import { useArtwork } from '../hooks/useArtwork'
import { useNativeMediaControls } from '../hooks/useNativeMediaControls'
import { noop } from '../utils/noop'
import { listenAll } from '../utils/events'


/** Read-only playback state. */
interface AudioState {
  readonly isPlaying:    boolean
  readonly currentTime:  number
  readonly duration:     number
  readonly currentTrack: Track | null
  readonly volume:       number
  readonly isLoading:    boolean
  readonly waveformBars: Float32Array | null

  /** The list playback is walking, and where in it we are (`-1` = nowhere). */
  readonly queue:      readonly Track[]
  readonly queueIndex: number

  /**
   * Tracks that have started playing, most recent first.
   *
   * Kept here rather than derived from the queue: the queue is replaced
   * wholesale every time playback starts somewhere new, so by the time you
   * want to know what you were listening to an hour ago it is long gone. A
   * replay moves the track back to the front instead of duplicating it, which
   * makes the list read as "what I have been playing" rather than as a log.
   */
  readonly history: readonly Track[]
}

/** Playback state plus the transport actions exposed to the UI. */
interface AudioContextValue extends AudioState {

  /** Play one track on its own — replaces the queue with just that track. */
  readonly play: (track: Track) => void

  /** Replace the queue and start at `startIndex`. */
  readonly playQueue: (tracks: readonly Track[], startIndex?: number) => void

  /** Append to the queue without disturbing what is playing. */
  readonly enqueue:      (tracks: readonly Track[]) => void
  readonly pause:        () => void
  readonly resume:       () => void
  readonly stop:         () => void
  readonly seek:         (time: number) => void
  readonly setVolume:    (volume: number) => void
  readonly playNext:     () => void
  readonly playPrevious: () => void
  readonly analyzer:     AnalyserNode | null

  /**
   * Gain reduction currently applied by one dynamics module, in dB (≤ 0).
   *
   * The chain itself is deliberately *not* exposed: nothing outside here should
   * be able to call `apply` or `dispose` on it, and this is the only thing that
   * has to be read back off the graph rather than out of settings. Reads
   * through a ref, so it never goes stale and never needs a re-render.
   */
  readonly reductionOf: (module: DynamicsModule) => number

  /** Ensure audio context is ready (resumes if suspended). Call after user gesture. */
  readonly ensureReady: () => Promise<void>
}

/** How many played tracks {@link AudioState.history} keeps. */
const MAX_HISTORY = 200

/** Direction of travel through the queue, as asked for by the transport. */
type Step = 1 | -1

/**
 * The queue position a step lands on, given shuffle and repeat.
 *
 * Shuffle ignores direction — "previous" in a shuffled queue is another
 * arbitrary track, not a history stack, and pretending otherwise would need
 * play history this engine doesn't keep. Repeat `all` wraps at either end;
 * repeat `none` stops there by returning `null`. Repeat `one` is handled by
 * the caller, since it re-seeks rather than picking anything.
 */
function pickIndex (
  length: number,
  current: number,
  step: Step,
  shuffle: boolean,
  repeat: RepeatMode
): number | null {
  if (length === 0)
    return null

  if (shuffle) {
    if (length === 1)
      return 0

    // Draw from the other positions so a shuffle never repeats the track
    // that just played.
    const draw = Math.floor(Math.random() * (length - 1))
    return draw >= current ? draw + 1 : draw
  }

  const next = current + step
  if (next >= 0 && next < length)
    return next

  if (repeat === 'all')
    return step > 0 ? 0 : length - 1

  return null
}

/** Decode an audio file and compute per-bar RMS amplitudes for the waveform. */
async function decodeWaveformBars (
  buffer: ArrayBuffer,
  barCount: number,
  audioCtx: globalThis.AudioContext
): Promise<Float32Array> {
  const decoded       = await audioCtx.decodeAudioData(buffer)
  const channel       = decoded.getChannelData(0)
  const samplesPerBar = Math.floor(channel.length / barCount)
  const bars          = new Float32Array(barCount)

  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar
    let sum = 0
    for (let j = start; j < start + samplesPerBar; j++)
      sum += channel[j] * channel[j]
    bars[i] = Math.sqrt(sum / samplesPerBar)
  }

  // Normalise to [0.07, 1.0]
  const max = bars.reduce((a, b) =>
    Math.max(a, b), 0.001)
  for (let i = 0; i < barCount; i++)
    bars[i] = Math.max(0.07, bars[i] / max)

  return bars
}

const AudioContext = createContext<AudioContextValue | null>(null)

/** Global reference to ensureReady function, set by AudioProvider on mount */
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
  const pauseRef        = useRef<() => void>(noop)
  const resumeRef       = useRef<() => void>(noop)
  const seekRef         = useRef<(time: number) => void>(noop)
  const playNextRef     = useRef<() => void>(noop)
  const playPreviousRef = useRef<() => void>(noop)

  /** What to do when a track runs out. Reassigned every render, see below. */
  const advanceRef = useRef<() => void>(noop)

  // Tracks no longer carry their art; the OS media session needs a real image,
  // so it is fetched for the current track like every other full-size use.
  const currentArt = useArtwork(currentTrack?.id, 'full')

  // MediaSession: set up metadata & handlers when track changes
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes `navigator.mediaSession.metadata`, an object the browser owns.
  useEffect(() => {
    if (!navigator.mediaSession || !currentTrack)
      return

    navigator.mediaSession.metadata = new MediaMetadata({
      title:   currentTrack.title || 'Unknown Title',
      artist:  currentTrack.artist || 'Unknown Artist',
      album:   currentTrack.album || 'Unknown Album',
      artwork: currentArt
        ? [
          { src: currentArt, sizes: '96x96', type: 'image/jpeg' }
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
      playPreviousRef.current()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNextRef.current()
    })
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (details.seekTime !== undefined)
        seekRef.current(details.seekTime)
    })
  }, [ currentTrack, currentArt ])

  return {
    pauseRef,
    resumeRef,
    seekRef,
    playNextRef,
    playPreviousRef,
    advanceRef,
  }
}

/**
 * Hosts the lazily-initialized Web Audio graph and exposes transport actions
 * via {@link useAudio}. Resumes the audio context on first user gesture.
 */
type AudioProviderProps = { readonly children: ReactNode }

/**
 * The tail of the audio graph: the analyser and the DSP chain that feeds it.
 *
 * They are built together in `setupAnalyzer`, so they are held together here —
 * and splitting them out keeps `AudioProvider`'s own statement count under the
 * lint cap, for the same reason {@link useMediaSessionRefs} exists.
 */
function useAudioGraph (settings: DspSettings | undefined) {
  const dsp                       = settings ?? DEFAULT_DSP
  const chain                     = useRef<DspChain | null>(null)
  const analyzerRef               = useRef<AnalyserNode | null>(null)
  const [ analyzer, setAnalyzer ] = useState<AnalyserNode | null>(null)

  /**
   * For the one caller that is not a render: `setupAnalyzer` needs the current
   * settings to seed a chain it has just built, and taking them as a dependency
   * would rebuild that callback on every knob tick. Assigned directly rather
   * than from an effect — it is only read from callbacks, so it just has to be
   * current by the time one runs.
   */
  const latest   = useRef(dsp)
  latest.current = dsp

  // `dsp` is a fresh object after every setter call, so this runs on each knob
  // tick — `apply` diffs against what it last wrote for that reason. It no-ops
  // until the first track builds the chain; `setupAnalyzer` seeds it itself.
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Pushes DSP parameters onto live Web Audio nodes, which React does not own.
  useEffect(() => {
    chain.current?.apply(dsp)
  }, [ dsp ])

  /** Read through the ref, so it is never stale and never forces a render. */
  const reductionOf = useCallback((module: DynamicsModule) =>
    chain.current?.reductionOf(module) ?? 0, [])

  return { chain, latest, reductionOf, analyzerRef, analyzer, setAnalyzer }
}

export function AudioProvider ({ children }: AudioProviderProps) {
  const [ state, setState ] = useState<AudioState>({
    isPlaying:    false,
    currentTime:  0,
    duration:     0,
    currentTrack: null,
    volume:       0.8,
    isLoading:    false,
    waveformBars: null,
    queue:        [],
    queueIndex:   -1,
    history:      [],
  })

  // Playback preferences are read, never written, from here — the toggles in
  // the player write straight to settings, which is where they persist.
  const settings   = useOptionalSettings()
  const repeatMode = settings?.repeatMode ?? 'none'
  const shuffle    = settings?.shuffle ?? false

  const audioRef        = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<globalThis.AudioContext | null>(null)
  const sourceRef       = useRef<MediaElementAudioSourceNode | null>(null)

  const {
    chain: dspRef, latest: dspSettingsRef, reductionOf,
    analyzerRef, analyzer, setAnalyzer,
  } = useAudioGraph(settings?.dsp)

  const data = useData()

  const {
    pauseRef, resumeRef, seekRef, playNextRef, playPreviousRef, advanceRef,
  } = useMediaSessionRefs(state.currentTrack)

  // The queue is held in refs as well as state: the `ended` listener is
  // registered once and must read the *current* queue, not the one that
  // existed when the effect first ran. State is the mirror the UI renders.
  const queueRef      = useRef<readonly Track[]>([])
  const queueIndexRef = useRef(-1)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Creates the `<audio>` element and binds its media listeners once, so the `ended` handler is registered a single time and reads the queue through a ref.
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current        = new Audio()
      audioRef.current.volume = state.volume
    }

    const audio = audioRef.current

    const handleTimeUpdate = () => {
      setState(s =>
        ({ ...s, currentTime: audio.currentTime }))
      if (navigator.mediaSession && state.currentTrack)
        navigator.mediaSession.setPositionState({
          duration:     state.duration,
          playbackRate: 1,
          position:     audio.currentTime
        })
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

    const listeners = listenAll(audio, {
      timeupdate:     handleTimeUpdate,
      durationchange: handleDurationChange,
      ended:          handleEnded,
      loadstart:      handleLoadStart,
      canplay:        handleCanPlay,
    })

    return () =>
      listeners.dispose()
  }, [])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Pushes volume onto the media element, which React does not own.
  useEffect(() => {
    if (audioRef.current)
      audioRef.current.volume = state.volume
  }, [ state.volume ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Unmount teardown: revokes the blob URL, disconnects the DSP chain's nodes, and clears the media-session action handlers.
  useEffect(() =>
    () => {
      const audio = audioRef.current
      if (audio && audio.src.startsWith('blob:'))
        URL.revokeObjectURL(audio.src)

      dspRef.current?.dispose()
      dspRef.current = null
      if (navigator.mediaSession) {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('seekto', null)
        navigator.mediaSession.metadata = null
      }
    }, [])

  // Mirror playback onto the OS media controls, and take their seeks back.
  useNativeMediaControls(state, audioRef, time =>
    setState(s =>
      ({ ...s, currentTime: time })))

  const setupAnalyzer = useCallback(() => {
    if (!audioRef.current)
      return analyzerRef.current

    if (!audioContextRef.current)
      audioContextRef.current = new globalThis.AudioContext()

    const ctx = audioContextRef.current
    if (!analyzerRef.current) {
      analyzerRef.current = ctx.createAnalyser()

      // 4096 puts a bin at ~10.8 Hz (44.1 kHz), which is what lets the
      // spectrum panel name the note under a peak rather than guess at it —
      // 256 bins were ~172 Hz apart, most of an octave in the low register.
      // The wider window costs ~93 ms of time resolution, invisible here.
      analyzerRef.current.fftSize = 4096
      analyzerRef.current.connect(ctx.destination)
      setAnalyzer(analyzerRef.current)
    }

    // Built once per session, not per track: `loadTrack` calls through here
    // every time, and sixteen filters plus two compressors are cheap to run but
    // pointless to rebuild.
    if (!dspRef.current) {
      dspRef.current = createDspChain(ctx)
      dspRef.current.apply(dspSettingsRef.current)
      dspRef.current.output.connect(analyzerRef.current)
    }

    if (!sourceRef.current && audioRef.current) {
      sourceRef.current = ctx.createMediaElementSource(audioRef.current)

      // Into the chain, not straight at the analyser: the chain's own spine is
      // what routes around a bypassed module, so this connection is made once
      // and never touched again.
      sourceRef.current.connect(dspRef.current.input)
    }

    return analyzerRef.current
  }, [])

  /** Load and start one track. Queue bookkeeping is the callers' job. */
  const loadTrack = useCallback(async (track: Track) => {
    const audio = audioRef.current
    if (!audio)
      return

    setState(s =>
      ({
        ...s,
        waveformBars: null,
        currentTrack: track,
        isPlaying:    true,
        currentTime:  0,
        history:      [ track, ...s.history.filter(played =>
          played.id !== track.id) ].slice(0, MAX_HISTORY),
      }))

    try {
      setupAnalyzer()

      const buffer = await data.readBytes(track.id)
      if (!buffer)
        throw new Error('Failed to read file')

      const blob     = new Blob([ buffer ])
      const audioUrl = URL.createObjectURL(blob)

      const oldUrl = audio.src
      if (oldUrl && oldUrl.startsWith('blob:'))
        URL.revokeObjectURL(oldUrl)

      audio.src = audioUrl
      await audio.play()

      const ctx = audioContextRef.current
      if (ctx)
        blob.arrayBuffer()
          .then(ab =>
            decodeWaveformBars(ab, 400, ctx))
          .then(bars =>
            setState(s =>
              ({ ...s, waveformBars: bars })))
          .catch(noop)
    }
    catch (error) {
      console.error('Error playing audio:', error)
    }
  }, [ setupAnalyzer ])

  const playQueue = useCallback((tracks: readonly Track[], startIndex = 0) => {
    if (tracks.length === 0)
      return

    const index = Math.max(0, Math.min(startIndex, tracks.length - 1))

    queueRef.current      = tracks
    queueIndexRef.current = index
    setState(s =>
      ({ ...s, queue: tracks, queueIndex: index }))

    void loadTrack(tracks[index])
  }, [ loadTrack ])

  /** A bare `play` is a queue of one — honest about what next/previous will do. */
  const play = useCallback((track: Track) => {
    playQueue([ track ], 0)
  }, [ playQueue ])

  const enqueue = useCallback((tracks: readonly Track[]) => {
    if (tracks.length === 0)
      return

    queueRef.current = [ ...queueRef.current, ...tracks ]
    setState(s =>
      ({ ...s, queue: queueRef.current }))
  }, [])

  /** Step through the queue. Returns false when there is nowhere to go. */
  const advance = useCallback((step: Step) => {
    const queue = queueRef.current
    const index = pickIndex(queue.length, queueIndexRef.current, step, shuffle, repeatMode)
    if (index === null)
      return false

    queueIndexRef.current = index
    setState(s =>
      ({ ...s, queueIndex: index }))

    void loadTrack(queue[index])
    return true
  }, [ loadTrack, shuffle, repeatMode ])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.pause()
    setState(s =>
      ({ ...s, isPlaying: false }))

    if (navigator.mediaSession)
      navigator.mediaSession.playbackState = 'paused'
  }, [])

  const resume = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.play().catch(console.error)
    setState(s =>
      ({ ...s, isPlaying: true }))

    if (navigator.mediaSession)
      navigator.mediaSession.playbackState = 'playing'
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (!audio)
      return

    audio.pause()
    audio.currentTime = 0

    if (audio.src.startsWith('blob:'))
      URL.revokeObjectURL(audio.src)

    queueIndexRef.current = -1

    setState(s =>
      ({
        ...s,
        isPlaying:    false,
        currentTime:  0,
        currentTrack: null,
        queueIndex:   -1,
      }))

    if (navigator.mediaSession) {
      navigator.mediaSession.playbackState = 'none'
      navigator.mediaSession.metadata      = null
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

  const playNext = useCallback(() => {
    advance(1)
  }, [ advance ])

  const playPrevious = useCallback(() => {
    advance(-1)
  }, [ advance ])

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

    // Running off the end is not the same as pressing next there: playback
    // stops rather than doing nothing.
    if (!advance(1))
      setState(s =>
        ({ ...s, isPlaying: false, currentTime: 0 }))
  }

  // Ensure audio context is ready (resume if suspended due to autoplay policy)
  const ensureReady = useCallback(async () => {
    const ctx = audioContextRef.current
    if (ctx && ctx.state === 'suspended')
      await ctx.resume()
  }, [])

  // Sync refs after all callbacks are defined
  pauseRef.current        = pause
  resumeRef.current       = resume
  seekRef.current         = seek
  playNextRef.current     = playNext
  playPreviousRef.current = playPrevious

  // Register global ensureReady for first-pointer-event handler
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Registers the module-global `ensureReady` and clears it on unmount.
  useEffect(() => {
    setGlobalEnsureReady(ensureReady)
    return () => {
      setGlobalEnsureReady(null)
    }
  }, [ ensureReady ])

  const value = useMemo(() =>
    ({
      ...state,
      play,
      playQueue,
      enqueue,
      pause,
      resume,
      stop,
      seek,
      setVolume,
      playNext,
      playPrevious,
      analyzer,
      reductionOf,
      ensureReady,
    }), [
    state,
    play,
    playQueue,
    enqueue,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    playNext,
    playPrevious,
    analyzer,
    reductionOf,
    ensureReady,
  ])

  return <AudioContext.Provider value={ value }>
    {children}
  </AudioContext.Provider>
}

/** Access playback state + transport. Throws if used outside {@link AudioProvider}. */
export function useAudio () {
  const context = useContext(AudioContext)
  if (!context)
    throw new Error('useAudio must be used within AudioProvider')
  return context
}
