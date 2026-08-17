import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { findPeaks, formatHz, frequencyToPitch } from '../../utils/pitch'
import type { Peak } from '../../utils/pitch'
import type { TrackAnalysis, ChordSegment } from '../../services/types'
import type { AnalysisStatus } from '../../hooks/useTrackAnalysis'


/** Frequency bands across the X axis. */
const BANDS = 40

/** Time slices receding along the Z axis; row 0 is the newest. */
const HISTORY = 28

/**
 * Negative, so `1 - z * PERSPECTIVE` *grows* with age: older slices spread
 * wider as they fall away, which is what reads as depth.
 */
const PERSPECTIVE = -0.8

/** viewBox units. The SVG scales to its box, so these are ratios, not pixels. */
const VIEW_W     = 1200
const VIEW_H     = 560
const MAX_HEIGHT = 150

/**
 * Headroom above the newest row for its peaks to rise into. The grid starts
 * here rather than at the vertical centre so the oldest row lands *on* the
 * bottom edge — centring it instead pushed the far rows out of the viewBox.
 */
const TOP_MARGIN = MAX_HEIGHT

/** How much of the previous frame survives — smooths the FFT's jitter. */
const SMOOTHING = 0.55

/**
 * The band edges are spaced logarithmically between these.
 *
 * Pitch is logarithmic — every octave doubles — so a linear axis is the wrong
 * shape for music: on one, everything from E2 to C7 lands in the leftmost
 * tenth of the mesh and the rest is inaudible air. Spacing by octave spreads
 * the notes evenly, which is also what stops three peak labels landing on top
 * of each other.
 */
const MIN_HZ = 30
const MAX_HZ = 16000

/**
 * Labels refresh on their own clock, far slower than the mesh.
 *
 * Note names flickering sixty times a second are unreadable, and pushing React
 * state at that rate would undo the point of animating imperatively. Six
 * updates a second is legible and costs nothing.
 */
const LABEL_INTERVAL_MS = 160

/** Peaks named at once. More than this and the readout is a wall of chips. */
const PEAK_LIMIT = 3

/**
 * Labels closer than this (in viewBox units) are stacked instead of overlapped.
 *
 * Even on a log axis a close voicing puts its partials within a few percent of
 * each other — a major triad spans barely half an octave — so position alone
 * cannot keep the chips apart.
 */
const LABEL_MIN_GAP = 110

interface FrequencyMatrixProps {
  readonly analyzer:           AnalyserNode | null
  readonly active:             boolean
  readonly analysis?:          TrackAnalysis | null
  readonly status?:            AnalysisStatus
  readonly error?:             string | null
  readonly currentTime?:       number
  readonly showChordAnalysis?: boolean
  readonly showKeyAnalysis?:   boolean
}

interface PeakLabel {
  readonly id:    string
  readonly note:  string
  readonly hz:    string
  readonly cents: number
  readonly x:     number
  readonly y:     number

  /** How many chips already sit at this position; each lane stacks upward. */
  readonly lane: number
}

/**
 * Assigns each label a lane so overlapping chips stack rather than collide.
 *
 * Walks left to right and drops a label into the first lane whose last
 * occupant is far enough away — the standard decluttering pass, and cheap at
 * three labels.
 */
function assignLanes (labels: Omit<PeakLabel, 'lane'>[]): PeakLabel[] {
  const laneEnds: number[] = []

  return [ ...labels ]
    .sort((a, b) =>
      a.x - b.x)
    .map(label => {
      let lane = laneEnds.findIndex(end =>
        label.x - end >= LABEL_MIN_GAP)

      if (lane === -1)
        lane = laneEnds.length

      laneEnds[lane] = label.x
      return { ...label, lane }
    })
}

/**
 * Static geometry.
 *
 * X and the row's baseline depend only on the grid indices, never on the
 * audio, so they are computed once. Per frame only the *height* of each point
 * changes — which is the difference between a few hundred multiplications and
 * a full reprojection of 1120 points sixty times a second.
 */
interface Geometry {
  readonly xs:    Float32Array
  readonly baseY: Float32Array
  readonly scale: Float32Array
}

/** Fractional position of `hz` along the log axis, 0–1; outside is clamped. */
function axisPosition (hz: number): number {
  const t = Math.log2(hz / MIN_HZ) / Math.log2(MAX_HZ / MIN_HZ)
  return Math.max(0, Math.min(1, t))
}

/** The FFT bin range each band covers, precomputed from the log spacing. */
function bandEdges (binHz: number, binCount: number): Uint16Array {
  const edges = new Uint16Array(BANDS + 1)
  const span  = Math.log2(MAX_HZ / MIN_HZ)

  for (let i = 0; i <= BANDS; i++) {
    const hz = MIN_HZ * 2 ** (span * (i / BANDS))
    edges[i] = Math.min(binCount - 1, Math.round(hz / binHz))
  }
  return edges
}

function buildGeometry (): Geometry {
  const xs    = new Float32Array(HISTORY * BANDS)
  const baseY = new Float32Array(HISTORY)
  const scale = new Float32Array(HISTORY)

  const gridWidth  = VIEW_W / 2
  const gridHeight = VIEW_H - TOP_MARGIN
  const centerX    = VIEW_W / 2

  for (let t = 0; t < HISTORY; t++) {
    const z = t / HISTORY
    const s = 1 - z * PERSPECTIVE

    scale[t] = s
    baseY[t] = TOP_MARGIN + z * gridHeight

    for (let i = 0; i < BANDS; i++)
      xs[t * BANDS + i] = centerX + (i / (BANDS - 1) - 0.5) * gridWidth * s
  }

  return { xs, baseY, scale }
}

interface HarmonyDetailsProps {
  readonly analysis:    TrackAnalysis | null
  readonly status:      AnalysisStatus
  readonly error:       string | null
  readonly currentTime: number
  readonly showChord:   boolean
  readonly showKey:     boolean
}

function chordAt (chords: readonly ChordSegment[], time: number): number {
  return chords.findIndex(chord =>
    time >= chord.start && time < chord.end)
}

interface ChordStripProps {
  readonly chords:      readonly ChordSegment[]
  readonly currentTime: number
}

function ChordStrip ({ chords, currentTime }: ChordStripProps) {
  const index   = chordAt(chords, currentTime)
  const current = index >= 0 ? chords[index] : undefined
  const next1   = index >= 0
    ? chords[index + 1]
    : chords.find(c =>
      c.start > currentTime)
  const next2   = index >= 0 ? chords[index + 2] : undefined

  return <div className='chord-strip' aria-live='polite' aria-atomic='true'>
    <span className='chord-strip-item chord-strip-next' data-next='2'>
      {next2?.label ?? ''}
    </span>

    <span className='chord-strip-item chord-strip-next' data-next='1'>
      {next1?.label ?? ''}
    </span>

    <span className='chord-strip-item chord-strip-current'>
      {current?.label ?? '\u2014'}
    </span>
  </div>
}

interface KeyTempoProps {
  readonly analysis: TrackAnalysis
}

function KeyTempo ({ analysis }: KeyTempoProps) {
  return <dl className='key-tempo-summary'>
    <div>
      <dt>Key</dt>
      <dd>{analysis.key.label}</dd>
    </div>

    <div>
      <dt>Tempo</dt>

      <dd>
        {analysis.tempo.bpm.toFixed(1)}
        {' '}
        <abbr title='beats per minute'>bpm</abbr>
      </dd>
    </div>
  </dl>
}

function HarmonyDetails ({ analysis, status, error, currentTime, showChord, showKey }: HarmonyDetailsProps) {
  if (status === 'loading')
    return <p className='status-message harmony-status'>Resolving chords, key and tempo…</p>

  if (status === 'error')
    return <p className='status-message harmony-status' role='status'>
      Harmony analysis failed: {error}
    </p>

  if (!analysis)
    return <p className='status-message harmony-status'>Harmony analysis is unavailable</p>

  return <section className='harmony-details' aria-labelledby='harmony-details-heading'>
    <h4 id='harmony-details-heading' className='sr-only'>Resolved harmony</h4>

    {showChord && analysis.chords.length > 0 &&
      <ChordStrip chords={ analysis.chords } currentTime={ currentTime } />}

    {showKey && <KeyTempo analysis={ analysis } />}
  </section>
}

/**
 * An FFT wireframe matrix: frequency across, time receding, with the dominant
 * partials named.
 *
 * Three things keep it cheap:
 *
 * 1. **Static geometry is precomputed** ({@link buildGeometry}). Only Y moves.
 * 2. **Two paths, not sixty-four.** Every frequency line lives in one `<path>`
 *    as separate subpaths and every time line in another, so a frame is two
 *    `setAttribute` calls. The age fade that would otherwise need a per-row
 *    opacity is a vertical gradient on the stroke instead — rows recede
 *    downward, so position *is* age.
 * 3. **No allocation in the loop.** The history is a single flat
 *    `Float32Array` rotated by index, and the path strings are assembled from
 *    a reused parts array.
 *
 * React renders once and never again for the mesh; the loop writes to the DOM
 * through refs. Only the peak labels use state, and they tick at
 * {@link LABEL_INTERVAL_MS}, not per frame.
 */
export function FrequencyMatrix ({
  analyzer,
  active,
  analysis = null,
  status = 'unavailable',
  error = null,
  currentTime = 0,
  showChordAnalysis = false,
  showKeyAnalysis = false,
}: FrequencyMatrixProps) {
  const freqPathRef = useRef<SVGPathElement>(null)
  const timePathRef = useRef<SVGPathElement>(null)

  const [ peaks, setPeaks ] = useState<readonly PeakLabel[]>([])

  const geometry = useMemo(buildGeometry, [])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Owns a `requestAnimationFrame` loop for the lifetime of the mount. The mesh is written through refs precisely so React renders it once and never again.
  useEffect(() => {
    if (!active)
      return

    const reduced = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches

    const { xs, baseY, scale } = geometry

    // One flat buffer for the whole mesh; `head` rotates instead of shifting.
    const levels = new Float32Array(HISTORY * BANDS)
    let head     = 0

    const bins  = analyzer ? new Uint8Array(analyzer.frequencyBinCount) : null
    const edges = analyzer && bins
      ? bandEdges(analyzer.context.sampleRate / analyzer.fftSize, bins.length)
      : null

    // Reused across frames so a frame allocates nothing.
    const parts = new Array<string>(HISTORY * (BANDS + 1))
    let lastLabelAt = 0

    /** Row `t` back from the newest, in the rotating buffer. */
    const rowAt = (t: number) =>
      (head + t) % HISTORY * BANDS

    const readAudio = () => {
      head = (head - 1 + HISTORY) % HISTORY

      const target   = rowAt(0)
      const previous = rowAt(1)

      if (!analyzer || !bins) {
        levels.fill(0, target, target + BANDS)
        return
      }

      analyzer.getByteFrequencyData(bins)

      for (let band = 0; band < BANDS; band++) {
        const start = edges![band]
        // Low bands can be narrower than one bin; never read an empty range.
        const end   = Math.max(start + 1, edges![band + 1])

        let peak = 0
        for (let bin = start; bin < end; bin++)
          if (bins[bin] > peak)
            peak = bins[bin]

        // Peak-hold per band, not mean: an average buries a lone strong
        // partial in the dead bins beside it, and the partials are the point.
        levels[target + band] =
          levels[previous + band] * SMOOTHING + peak / 255 * (1 - SMOOTHING)
      }
    }

    const paint = () => {
      let n = 0
      for (let t = 0; t < HISTORY; t++) {
        const row = rowAt(t)
        const s   = scale[t]
        const b   = baseY[t]

        for (let i = 0; i < BANDS; i++) {
          const x    = xs[t * BANDS + i]
          const y    = b - levels[row + i] * MAX_HEIGHT * s
          parts[n++] = `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
        }
      }
      freqPathRef.current?.setAttribute('d', parts.slice(0, n).join(''))

      n = 0
      for (let i = 0; i < BANDS; i++)
        for (let t = 0; t < HISTORY; t++) {
          const x    = xs[t * BANDS + i]
          const y    = baseY[t] - levels[rowAt(t) + i] * MAX_HEIGHT * scale[t]
          parts[n++] = `${t === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
        }
      timePathRef.current?.setAttribute('d', parts.slice(0, n).join(''))
    }

    const updateLabels = (now: number) => {
      if (!analyzer || !bins || now - lastLabelAt < LABEL_INTERVAL_MS)
        return
      lastLabelAt = now

      const found = findPeaks(bins, analyzer.context.sampleRate, analyzer.fftSize, PEAK_LIMIT)

      setPeaks(assignLanes(found.map((peak: Peak) => {
        const pitch = frequencyToPitch(peak.hz)

        // Place the label above the newest row, at the peak's own frequency
        // position — so it sits over the ridge it names. Same log mapping the
        // bands use, or the label would drift off its own peak.
        const band  = Math.min(BANDS - 1, Math.floor(axisPosition(peak.hz) * BANDS))
        const level = levels[rowAt(0) + band]

        return {
          id:    pitch?.label ?? String(Math.round(peak.hz)),
          note:  pitch?.label ?? '—',
          hz:    formatHz(peak.hz),
          cents: pitch?.cents ?? 0,
          x:     xs[band],
          y:     baseY[0] - level * MAX_HEIGHT * scale[0],
        }
      })))
    }

    // Paint once, synchronously, before waiting on a frame. `requestAnimation
    // Frame` is suspended while the window is hidden or occluded, so a panel
    // that only ever drew from the loop would open as an empty box and stay
    // that way until the window came forward.
    readAudio()
    paint()
    updateLabels(performance.now())

    if (reduced)
      return

    let frame = requestAnimationFrame(function loop (now) {
      readAudio()
      paint()
      updateLabels(now)
      frame = requestAnimationFrame(loop)
    })

    return () => {
      cancelAnimationFrame(frame)
      setPeaks([])
    }
  }, [ analyzer, active, geometry ])

  return <section className='frequency-resolver' aria-labelledby='frequency-resolver-heading'>
    <h3 id='frequency-resolver-heading' className='sr-only'>Frequency and harmony</h3>

    <HarmonyDetails
      analysis={ analysis }
      status={ status }
      error={ error }
      currentTime={ currentTime }
      showChord={ showChordAnalysis }
      showKey={ showKeyAnalysis } />

    <section className='frequency-matrix' aria-label='Frequency spectrum'>
      <svg
        viewBox={ `0 0 ${VIEW_W} ${VIEW_H}` }
        preserveAspectRatio='xMidYMid meet'
        focusable='false'>
        <defs>
          {/* Rows recede downward, so vertical position *is* age: the newest
              row sits at the top and the oldest at the bottom. One gradient
              replaces the per-row opacity the mesh would otherwise need. */}
          <linearGradient id='matrix-age' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor='currentColor' stopOpacity='1' />
            <stop offset='55%' stopColor='currentColor' stopOpacity='0.55' />
            <stop offset='100%' stopColor='currentColor' stopOpacity='0.08' />
          </linearGradient>
        </defs>

        <path ref={ timePathRef } className='matrix-line-z' />
        <path ref={ freqPathRef } className='matrix-line-x' />
      </svg>

      {/*
        * The readout is a description list because that is what it is: a term
        * (the note) and its value (the frequency). Positioned over the ridge it
        * names, and `aria-live` so the reading is available without sight of it.
        */}
      <dl className='matrix-peaks' aria-live='polite' aria-atomic='true'>
        {peaks.map(peak =>
          <div
            key={ peak.id }
            className='matrix-peak'
            /* eslint-disable-next-line react-strict/no-style-prop -- Position is measured data, not a stylesheet's decision. */
            style={{
              'left':   `${(peak.x / VIEW_W * 100).toFixed(2)}%`,
              'top':    `${(peak.y / VIEW_H * 100).toFixed(2)}%`,
              '--lane': peak.lane,
            } as CSSProperties}>
            <dt>{peak.note}</dt>
            <dd>{peak.hz}</dd>
          </div>
        )}
      </dl>
    </section>
  </section>
}
