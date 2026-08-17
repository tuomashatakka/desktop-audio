import { useEffect, useState } from 'react'
import { useData } from '../data'
import type { Track, TrackAnalysis } from '../services/types'


export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable'

export interface TrackAnalysisState {
  readonly analysis: TrackAnalysis | null
  readonly status:   AnalysisStatus
  readonly error:    string | null

  /** When the running analysis began, for the progress readout. */
  readonly startedAt: number | null

  /** How long it is expected to take, or `null` with nothing to go on. */
  readonly estimateMs: number | null
}

const resultCache = new Map<string, TrackAnalysis>()
const inFlight    = new Map<string, Promise<TrackAnalysis | null>>()

const IDLE: TrackAnalysisState = {
  analysis:   null,
  status:     'idle',
  error:      null,
  startedAt:  null,
  estimateMs: null,
}

/**
 * Seconds of compute per second of audio, learned as results come back.
 *
 * There is no progress channel out of the Python resolver — it prints one line
 * of JSON when it is done and nothing before that — so an honest estimate is
 * the only kind available. Every result already carries the wall-clock time it
 * took (`engine.analysisSeconds`) beside the audio duration it took it for, so
 * the ratio is free; the seed is only ever used before the first result of a
 * session, and a cache hit teaches just as well as a fresh run.
 */
const SEED_RATE   = 0.5
const RATE_WEIGHT = 0.3

let observedRate = SEED_RATE

/** Fold one completed analysis into the running rate. Exported for tests. */
export function learnRate (analysis: TrackAnalysis): number {
  const seconds = analysis.engine?.analysisSeconds

  if (seconds && seconds > 0 && analysis.duration > 0)
    observedRate = observedRate * (1 - RATE_WEIGHT) + seconds / analysis.duration * RATE_WEIGHT

  return observedRate
}

/** What one analysis of `durationSeconds` of audio should take, in ms. */
export function estimateAnalysisMs (durationSeconds: number | undefined): number | null {
  return durationSeconds && durationSeconds > 0
    ? Math.round(durationSeconds * observedRate * 1000)
    : null
}

function requestAnalysis (
  trackId: string,
  analyze: (id: string) => Promise<TrackAnalysis | null>
): Promise<TrackAnalysis | null> {
  const cached = resultCache.get(trackId)
  if (cached)
    return Promise.resolve(cached)

  const running = inFlight.get(trackId)
  if (running)
    return running

  const request = analyze(trackId)
    .then(result => {
      if (result) {
        resultCache.set(trackId, result)
        learnRate(result)
      }
      return result
    })
    .finally(() =>
      inFlight.delete(trackId))

  inFlight.set(trackId, request)
  return request
}

/**
 * The renderer reports the error's own sentence and nothing else.
 *
 * The worker and the main process both phrase failures for a reader now — "this
 * file's audio could not be decoded", not a rejected `execFile` — so `String()`
 * over the whole `Error` would put `Error: ` back in front of a finished
 * sentence, and used to put an entire command line there.
 */
function messageOf (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Shared current-track analysis.
 *
 * The player is mounted twice, so module-level cache/in-flight maps are
 * load-bearing: both copies observe one worker request instead of launching
 * duplicate Essentia processes.
 *
 * It takes the whole track rather than its id because the estimate needs the
 * duration too — and the *track's* duration, not the media element's, since it
 * has to exist before anything has been decoded to measure.
 */
export function useTrackAnalysis (track: Track | null | undefined): TrackAnalysisState {
  const data                = useData()
  const [ state, setState ] = useState<TrackAnalysisState>(IDLE)

  const trackId         = track?.id
  const durationSeconds = track?.duration

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Starts and retires an async IPC request when the current track changes.
  useEffect(() => {
    if (!trackId) {
      setState(IDLE)
      return
    }

    const settled = (next: Partial<TrackAnalysisState>): TrackAnalysisState =>
      ({ ...IDLE, ...next })

    const cached = resultCache.get(trackId)
    if (cached) {
      setState(settled({ analysis: cached, status: 'ready' }))
      return
    }

    let cancelled = false

    setState({
      analysis:   null,
      status:     'loading',
      error:      null,
      startedAt:  Date.now(),
      estimateMs: estimateAnalysisMs(durationSeconds),
    })

    requestAnalysis(trackId, id =>
      data.analyzeTrack(id))
      .then(analysis => {
        if (cancelled)
          return

        setState(analysis
          ? settled({ analysis, status: 'ready' })
          : settled({ status: 'unavailable' }))
      })
      .catch(error => {
        if (!cancelled)
          setState(settled({ status: 'error', error: messageOf(error) }))
      })

    return () => {
      cancelled = true
    }
  }, [ data, trackId, durationSeconds ])

  return state
}
