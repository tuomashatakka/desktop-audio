import { describe, expect, it } from 'vitest'
import { estimateAnalysisMs, learnRate } from '../../src/app/hooks/useTrackAnalysis'
import type { TrackAnalysis } from '../../src/app/services/types'


function result (duration: number, analysisSeconds: number): TrackAnalysis {
  return {
    version:  1,
    duration,
    tempo:    { bpm: 120, confidence: 0.9 },
    key:      { tonic: 'A', scale: 'minor', label: 'A minor', confidence: 0.8 },
    beats:    [],
    chords:   [],
    engine:   { analysisSeconds },
    warnings: [],
  }
}

/**
 * The Python resolver prints one line of JSON when it is finished and nothing
 * before that, so there is no progress to report — only an estimate. Every
 * result carries the wall-clock time it took beside the audio duration it took
 * it for, which is exactly the ratio the next estimate needs.
 */
describe('analysis estimates', () => {
  it('has nothing to say about a track of unknown length', () => {
    expect(estimateAnalysisMs(undefined)).toBeNull()
    expect(estimateAnalysisMs(0)).toBeNull()
  })

  it('scales the estimate with the track length', () => {
    const short = estimateAnalysisMs(60)!
    const long  = estimateAnalysisMs(240)!

    expect(long).toBeCloseTo(short * 4, -1)
  })

  it('moves the rate toward what analyses actually cost', () => {
    const before = estimateAnalysisMs(100)!

    // Ten seconds of compute for two hundred of audio: much faster than the
    // seed, so the estimate has to come down.
    for (let i = 0; i < 20; i++)
      learnRate(result(200, 10))

    expect(estimateAnalysisMs(100)!).toBeLessThan(before)
  })

  it('ignores a result with nothing to learn from', () => {
    const before = learnRate(result(0, 5))
    const after  = learnRate(result(100, 0))

    expect(after).toBe(before)
  })
})
