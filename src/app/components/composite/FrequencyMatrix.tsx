import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { findPeaks, formatHz, frequencyToPitch } from '../../utils/pitch'


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
const VIEW_W = 1200
const VIEW_H = 560

/**
 * Depth of field, in viewBox units — so it scales with the mesh rather than
 * with the window. `DOF_FOCUS_PLANE` is where focus starts to fall off, as a
 * percentage down the mesh: everything above it is sharp.
 */
const DOF_BLUR        = 4
const DOF_FOCUS_PLANE = 38
const MAX_HEIGHT      = 150

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
 * How long a named peak stays on screen after it was last heard, fading out
 * across that whole span.
 *
 * Labels used to be whatever `findPeaks` returned on the last tick, so a note
 * that dropped out of the top three vanished within 160 ms — the readout
 * flickered rather than reading as a list of what is sounding. Holding them
 * means the row describes the last couple of seconds of the piece.
 */
const LABEL_TTL_MS = 2400

/** Labels held at once. The least recently heard are dropped first. */
const LABEL_MAX = 8

/**
 * Labels closer than this (in viewBox units) are pushed apart along the row.
 *
 * Even on a log axis a close voicing puts its partials within a few percent of
 * each other — a major triad spans barely half an octave — so position alone
 * cannot keep the names apart.
 */
const LABEL_MIN_GAP = 110

interface FrequencyMatrixProps {
  readonly analyzer: AnalyserNode | null

  /** Drives the rAF loop. The mesh stays mounted while it fades out. */
  readonly active: boolean
}

interface PeakLabel {
  readonly id:   string
  readonly note: string
  readonly hz:   string
  readonly x:    number

  /** `1` when just heard, `0` at {@link LABEL_TTL_MS}. */
  readonly fade: number
}

/** A held label, before its age has been turned into a fade. */
interface HeldPeak extends Omit<PeakLabel, 'fade'> {
  readonly at: number
}

/**
 * Spreads overlapping labels apart **along the row**, left to right, then pulls
 * the tail back inside the right edge.
 *
 * This replaced a lane assignment that stacked collisions vertically. Vertical
 * position already means something in this component — it is age — so spending
 * it on decluttering made the row read as scattered. One clean line of names,
 * nudged sideways where they would touch, says the same thing without
 * borrowing an axis.
 */
function spreadLabels (labels: readonly PeakLabel[]): PeakLabel[] {
  let previous = -Infinity

  const forward = [ ...labels ]
    .sort((a, b) =>
      a.x - b.x)
    .map(label => {
      previous = Math.max(label.x, previous + LABEL_MIN_GAP)
      return { ...label, x: previous }
    })

  let ceiling = VIEW_W

  return forward
    .reverse()
    .map(label => {
      const x = Math.min(label.x, ceiling)
      ceiling = x - LABEL_MIN_GAP
      return { ...label, x }
    })
    .reverse()
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

/**
 * An FFT wireframe matrix: frequency across, time receding, with the dominant
 * partials named.
 *
 * Three things keep it cheap:
 *
 * 1. **Static geometry is precomputed** ({@link buildGeometry}). Only Y moves.
 * 2. **Three paths, not sixty-four.** Every past frequency line lives in one
 *    `<path>` as separate subpaths, every time line in another, and the newest
 *    row in a third — so a frame is three `setAttribute` calls. The age fade
 *    that would otherwise need a per-row opacity is a vertical gradient on the
 *    stroke instead: rows recede downward, so position *is* age.
 * 3. **No allocation in the loop.** The history is a single flat
 *    `Float32Array` rotated by index, and the path strings are assembled from
 *    a reused parts array.
 *
 * React renders once and never again for the mesh; the loop writes to the DOM
 * through refs. Only the peak labels use state, and they tick at
 * {@link LABEL_INTERVAL_MS}, not per frame.
 *
 * The harmony readout used to live here too. It is its own block now
 * (`AnalysisReadout`) — the track's key, tempo and chords are what the analysis
 * view is *for*, and this is the backdrop they are read against.
 */
export function FrequencyMatrix ({ analyzer, active }: FrequencyMatrixProps) {
  const freqPathRef    = useRef<SVGPathElement>(null)
  const timePathRef    = useRef<SVGPathElement>(null)
  const currentPathRef = useRef<SVGPathElement>(null)

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

    /** Named peaks, held past the tick that found them. See {@link LABEL_TTL_MS}. */
    const held = new Map<string, HeldPeak>()

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
      // History, **oldest subpath first**. Later subpaths paint over earlier
      // ones, so emitting the newest row last is what puts the near rows in
      // front of the far ones — walking forward drew the oldest, faintest row
      // over everything in front of it.
      //
      // Row 0 is excluded; it gets its own path below, so it can be neither
      // masked nor blurred.
      let n = 0
      for (let t = HISTORY - 1; t >= 1; t--) {
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

      // The newest row, drawn like the EQ's own curve: a flat accent stroke
      // over a filled ground. It closes back along its baseline so the shape
      // can carry that fill — the same construction `.eq-spectrum` uses.
      n = 0

      const row0 = rowAt(0)
      for (let i = 0; i < BANDS; i++) {
        const y    = baseY[0] - levels[row0 + i] * MAX_HEIGHT * scale[0]
        parts[n++] = `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${y.toFixed(1)}`
      }

      parts[n++] = `L${xs[BANDS - 1].toFixed(1)},${baseY[0].toFixed(1)}`
      parts[n++] = `L${xs[0].toFixed(1)},${baseY[0].toFixed(1)}`
      parts[n++] = 'Z'
      currentPathRef.current?.setAttribute('d', parts.slice(0, n).join(''))

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

      for (const peak of findPeaks(bins, analyzer.context.sampleRate, analyzer.fftSize, PEAK_LIMIT)) {
        const pitch = frequencyToPitch(peak.hz)

        // Only X is data. The label takes the peak's own frequency position
        // from the same log mapping the bands use, or a name would drift off
        // the ridge it belongs to. Its Y is a fixed row, because vertical
        // position in this component already means age.
        const band = Math.min(BANDS - 1, Math.floor(axisPosition(peak.hz) * BANDS))

        held.set(pitch?.label ?? String(Math.round(peak.hz)), {
          id:   pitch?.label ?? String(Math.round(peak.hz)),
          note: pitch?.label ?? '—',
          hz:   formatHz(peak.hz),
          x:    xs[band],
          at:   now,
        })
      }

      for (const [ id, label ] of held)
        if (now - label.at > LABEL_TTL_MS)
          held.delete(id)

      setPeaks(spreadLabels([ ...held.values() ]
        .sort((a, b) =>
          b.at - a.at)
        .slice(0, LABEL_MAX)
        .map(({ at, ...label }) =>
          ({ ...label, fade: 1 - (now - at) / LABEL_TTL_MS }))))
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

  return <section
    className='frequency-matrix'
    data-open={ active || undefined }
    aria-label='Frequency spectrum'
    aria-hidden={ active ? undefined : true }>
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

        {/*
            * Depth of field. The same reasoning as the age gradient: distance
            * is vertical position, so focus can be too — near rows stay sharp
            * and far ones defocus, which is what makes a flat wireframe read
            * as receding rather than as a pattern.
            *
            * It costs two nodes, not sixty-four. The geometry is written once
            * to the `<path>` below and painted twice through `<use>`, so the
            * per-frame work is still the single `setAttribute` it always was;
            * the near and far copies are masked with opposite ramps of one
            * gradient and cross-fade into each other across the middle.
            */}
        <filter id='matrix-dof' x='-5%' y='-5%' width='110%' height='110%'>
          <feGaussianBlur stdDeviation={ DOF_BLUR } />
        </filter>

        <linearGradient
          id='matrix-depth'
          gradientUnits='userSpaceOnUse'
          x1='0'
          y1='0'
          x2='0'
          y2={ VIEW_H }>
          <stop offset='0%' stopColor='#000' />
          <stop offset={ `${DOF_FOCUS_PLANE}%` } stopColor='#000' />
          <stop offset='100%' stopColor='#fff' />
        </linearGradient>

        <mask id='matrix-far'>
          <rect
            x={ -VIEW_W }
            y={ -VIEW_H }
            width={ VIEW_W * 3 }
            height={ VIEW_H * 3 }
            fill='url(#matrix-depth)' />
        </mask>

        {/* The near copy rides the same ramp inverted, so the pair always
              sums to one: no band is painted twice, and none is left unpainted. */}
        <linearGradient
          id='matrix-depth-near'
          gradientUnits='userSpaceOnUse'
          x1='0'
          y1='0'
          x2='0'
          y2={ VIEW_H }>
          <stop offset='0%' stopColor='#fff' />
          <stop offset={ `${DOF_FOCUS_PLANE}%` } stopColor='#fff' />
          <stop offset='100%' stopColor='#000' />
        </linearGradient>

        <mask id='matrix-near'>
          <rect
            x={ -VIEW_W }
            y={ -VIEW_H }
            width={ VIEW_W * 3 }
            height={ VIEW_H * 3 }
            fill='url(#matrix-depth-near)' />
        </mask>

        {/* Geometry only, and history only. The two `<use>`s below paint it;
            the newest row is a separate path so it stays sharp and unmasked. */}
        <path ref={ freqPathRef } id='matrix-freq' />
      </defs>

      <path ref={ timePathRef } className='matrix-line-z' />
      <use className='matrix-line-x' href='#matrix-freq' mask='url(#matrix-far)' filter='url(#matrix-dof)' />
      <use className='matrix-line-x' href='#matrix-freq' mask='url(#matrix-near)' />
      <path ref={ currentPathRef } className='matrix-current' />
    </svg>

    {/*
      * The readout is a description list because that is what it is: a term
      * (the note) and its value (the frequency). One row across the top of the
      * mesh — only the horizontal position carries meaning — and `aria-live`
      * so the reading is available without sight of it.
      */}
    <dl className='matrix-peaks' aria-live='polite' aria-atomic='true'>
      {peaks.map(peak =>
        <div
          key={ peak.id }
          className='matrix-peak'
          /* eslint-disable-next-line react-strict/no-style-prop -- Position and age are measured data, not a stylesheet's decision. */
          style={{
            'left':        `${(peak.x / VIEW_W * 100).toFixed(2)}%`,
            '--peak-fade': peak.fade.toFixed(3),
          } as CSSProperties}>
          <dt>{peak.note}</dt>
          <dd>{peak.hz}</dd>
        </div>
      )}
    </dl>
  </section>
}
