import { useEffect, useState } from 'react'
import { useData } from '../data'
import type { TrackAnalysis } from '../services/types'


export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable'

export interface TrackAnalysisState {
  readonly analysis: TrackAnalysis | null
  readonly status:   AnalysisStatus
  readonly error:    string | null
}

const resultCache = new Map<string, TrackAnalysis>()
const inFlight    = new Map<string, Promise<TrackAnalysis | null>>()

const IDLE: TrackAnalysisState = {
  analysis: null,
  status:   'idle',
  error:    null,
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
      if (result)
        resultCache.set(trackId, result)
      return result
    })
    .finally(() =>
      inFlight.delete(trackId))

  inFlight.set(trackId, request)
  return request
}

/**
 * Shared current-track analysis.
 *
 * The player is mounted twice, so module-level cache/in-flight maps are
 * load-bearing: both copies observe one worker request instead of launching
 * duplicate Essentia processes.
 */
export function useTrackAnalysis (trackId: string | undefined): TrackAnalysisState {
  const data                = useData()
  const [ state, setState ] = useState<TrackAnalysisState>(IDLE)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Starts and retires an async IPC request when the current track changes.
  useEffect(() => {
    if (!trackId) {
      setState(IDLE)
      return
    }

    const cached = resultCache.get(trackId)
    if (cached) {
      setState({ analysis: cached, status: 'ready', error: null })
      return
    }

    let cancelled = false
    setState({ analysis: null, status: 'loading', error: null })

    requestAnalysis(trackId, id =>
      data.analyzeTrack(id))
      .then(analysis => {
        if (cancelled)
          return

        setState(analysis
          ? { analysis, status: 'ready', error: null }
          : { analysis: null, status: 'unavailable', error: null })
      })
      .catch(error => {
        if (!cancelled)
          setState({ analysis: null, status: 'error', error: String(error) })
      })

    return () => {
      cancelled = true
    }
  }, [ data, trackId ])

  return state
}
