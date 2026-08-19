import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  AnalysisReadout,
  chordAt,
  firstAfter,
  meterOf,
  queuedChords,
} from '../../../src/app/components/composite/AnalysisReadout'
import type { BeatMarker, ChordSegment, TrackAnalysis } from '../../../src/app/services/types'


/** `count` beats in `meter`-beat bars, as the resolver reports them. */
function beatGrid (count: number, meter: number): BeatMarker[] {
  return Array.from({ length: count }, (_, i) => ({
    time:     i * 0.5,
    strength: 1,
    source:   'beat' as const,
    downbeat: i % meter === 0,
    bar:      Math.floor(i / meter),
    beat:     i % meter,
  }))
}


const chords: readonly ChordSegment[] = [
  { start: 0, end: 5, label: 'Am', confidence: 0.8, notes: [ 57, 60, 64 ]},
  { start: 5, end: 10, label: 'F', confidence: 0.8, notes: [ 53, 57, 60 ]},
  { start: 10, end: 20, label: 'C', confidence: 0.8, notes: [ 48, 52, 55 ]},
]

const analysis: TrackAnalysis = {
  version:  1,
  duration: 20,
  tempo:    { bpm: 119.99, confidence: 0.9 },
  key:      { tonic: 'A', scale: 'minor', label: 'A minor', confidence: 0.8 },
  beats:    [],
  chords,
  warnings: [],
}

const READY = {
  analysis,
  status:    'ready' as const,
  error:     null,
  isPlaying: false,
  showChord: true,
  showKey:   true,
}

describe('chordAt', () => {
  it('finds the chord sounding at a moment', () => {
    expect(chordAt(chords, 6)).toBe(1)
  })

  it('is exclusive at the upper bound, so a boundary belongs to one chord', () => {
    expect(chordAt(chords, 5)).toBe(1)
    expect(chordAt(chords, 4.999)).toBe(0)
  })

  it('reports no chord before the first and past the last', () => {
    expect(chordAt([ { ...chords[0]!, start: 2, end: 5 } ], 0)).toBe(-1)
    expect(chordAt(chords, 25)).toBe(-1)
  })
})

describe('firstAfter', () => {
  it('finds what is coming when nothing is sounding yet', () => {
    expect(firstAfter([ { ...chords[0]!, start: 2, end: 5 } ], 0)).toBe(0)
  })

  it('reports none once every chord has started', () => {
    expect(firstAfter(chords, 25)).toBe(-1)
  })
})

describe('queuedChords', () => {
  it('takes the window after the sounding chord', () => {
    expect(queuedChords(chords, 1).map(chord =>
      chord.label)).toEqual([ 'F', 'C' ])
  })

  /**
   * The queue is keyed off an index rather than off `time` precisely so it can
   * be empty rather than wrong: `slice(-1)` would silently return the last
   * chord as though it were the next one.
   */
  it('is empty when there is nothing after', () => {
    expect(queuedChords(chords, -1)).toEqual([])
  })
})

describe('meterOf', () => {
  it('reads the meter off the beat numbering', () => {
    expect(meterOf(beatGrid(16, 4))).toBe(4)
    expect(meterOf(beatGrid(12, 3))).toBe(3)
    expect(meterOf(beatGrid(14, 7))).toBe(7)
  })

  // Too few beats is a failed detection, not a short song.
  it('refuses a grid too short to be sure about', () => {
    expect(meterOf(beatGrid(4, 4))).toBeNull()
    expect(meterOf([])).toBeNull()
  })

  // A meter outside 2-12 is the resolver having lost the downbeat.
  it('refuses an implausible meter', () => {
    expect(meterOf(beatGrid(40, 20))).toBeNull()
    expect(meterOf(beatGrid(16, 1))).toBeNull()
  })
})

describe('AnalysisReadout', () => {
  it('stays out of the accessibility tree until the analysis view is open', () => {
    render(<AnalysisReadout open={ false } currentTime={ 6 } { ...READY } />)

    expect(screen.queryByRole('region', { name: 'Audio analysis' })).toBeNull()
  })

  it('reads the key and the tempo', () => {
    render(<AnalysisReadout open currentTime={ 6 } { ...READY } />)

    expect(screen.getByText('A minor')).toBeInTheDocument()
    expect(screen.getByText(/120\.0/)).toBeInTheDocument()
  })

  /*
   * The caption line is a caption, not a table: `Key` and `Tempo` are there for
   * a screen reader and nowhere on screen, which is what let the four-em label
   * gutter go.
   */
  it('keeps the labels for assistive technology and off the page', () => {
    const { container } = render(<AnalysisReadout open currentTime={ 6 } { ...READY } />)

    const terms = [ ...container.querySelectorAll('.track-meta dt') ]

    expect(terms.map(el =>
      el.textContent)).toEqual([ 'Key', 'Tempo' ])
    expect(terms.every(el =>
      el.classList.contains('sr-only'))).toBe(true)
  })

  it('adds the meter when the beat grid carries one', () => {
    const { container } = render(
      <AnalysisReadout
        open
        currentTime={ 6 }
        { ...READY }
        analysis={{ ...analysis, beats: beatGrid(16, 4) }} />
    )

    expect(container.querySelector('.track-meta')).toHaveTextContent('4/4')
  })

  // The lane is the largest thing on the page; a caption over it was the last
  // thing holding the label gutter up.
  it('does not caption the chord lane', () => {
    const { container } = render(<AnalysisReadout open currentTime={ 6 } { ...READY } />)

    expect(container.querySelector('.chord-ribbon figcaption')).toBeNull()
    expect(screen.getByRole('figure', { name: 'Chords' })).toBeInTheDocument()
  })

  it('pins the sounding chord and queues what is coming', () => {
    const { container } = render(<AnalysisReadout open currentTime={ 6 } { ...READY } />)

    expect(container.querySelector('[data-state="current"]')).toHaveTextContent('F')
    expect(container.querySelector('[data-state="past"]')).toHaveTextContent('Am')

    const queued = [ ...container.querySelectorAll('.chord-queue .chord') ]
      .map(el =>
        el.textContent)

    expect(queued).toEqual([ 'C' ])
  })

  /**
   * Distance from the anchor is time until the chord plays, and the arithmetic
   * is CSS's: each chord carries its own start and the lane carries `--now`.
   */
  it('positions each queued chord at its own start time', () => {
    const { container } = render(<AnalysisReadout open currentTime={ 6 } { ...READY } />)

    const queued = container.querySelector<HTMLElement>('.chord-queue .chord')
    expect(queued?.style.getPropertyValue('--at')).toBe('10.000')
  })

  it('says so when the analysis could not be resolved', () => {
    render(
      <AnalysisReadout
        open
        currentTime={ 0 }
        analysis={ null }
        status='error'
        error='the analyzer returned an invalid harmony result'
        isPlaying={ false }
        showChord
        showKey />
    )

    expect(screen.getByRole('status')).toHaveTextContent(/invalid harmony result/)
  })
})
