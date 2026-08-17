/**
 * The equaliser, drawn as one line over the output spectrum.
 *
 * Sixteen faders described the bands; this describes the *result*. The curve is
 * the cascade's real magnitude response (see `eqResponse`), and the filled
 * shape under it is what the chain is putting out right now — the analyser sits
 * downstream of the EQ, so lifting a band lifts the spectrum under the bump you
 * just drew, in the same picture.
 *
 * Both share one logarithmic frequency axis, because pitch is logarithmic: on a
 * linear axis every band below 2 kHz — thirteen of the sixteen — would be
 * crushed into the leftmost tenth.
 *
 * Pointer editing draws on the curve directly. The sixteen native range inputs
 * are still here, clipped rather than removed: they are what keyboard and
 * screen-reader users operate, and they are the reason this is a control and
 * not a picture.
 *
 * Their *labels* are no longer clipped with them. The band frequencies were in
 * the accessibility tree and nowhere on screen, so the curve was a picture with
 * three unlabelled decade lines on it; they surface as a ruler along the bottom
 * edge on hover, with the band under the pointer called out. The clipping moved
 * from the list to the inputs, which is the only part that has to stay
 * invisible.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { DSP_RANGES, EQ_BANDS } from '../../contexts'
import { axisFrequency, axisPosition, eqResponseDb } from '../../services/eqResponse'


const VIEW_W = 1000
const VIEW_H = 260

/** The audible decade span the axis covers. */
const MIN_HZ = 20
const MAX_HZ = 20000

/** Points along the curve. Enough to keep a 12 dB peak smooth, cheap to sum. */
const SAMPLES = 192

/** Vertical breathing room, so a band at the limit is not welded to the edge. */
const PAD = 18

/** Grid lines, at the decade boundaries a mixing engineer already thinks in. */
const GRID_HZ = [ 100, 1000, 10000 ]

const HALF  = VIEW_H / 2
const SCALE = HALF - PAD

/** Log-spaced sample frequencies, and their x, computed once for the module. */
const SAMPLE_HZ = Array.from({ length: SAMPLES }, (_, i) =>
  axisFrequency(i / (SAMPLES - 1), MIN_HZ, MAX_HZ))

const SAMPLE_X = SAMPLE_HZ.map(hz =>
  axisPosition(hz, MIN_HZ, MAX_HZ) * VIEW_W)

/** Band centres on the same axis, so a pointer lands where it looks like it does. */
const BAND_X = EQ_BANDS.map(band =>
  axisPosition(band.hz, MIN_HZ, MAX_HZ) * VIEW_W)

function clamp (value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** dB → y, with 0 dB on the centre line. */
function gainY (db: number): number {
  return HALF - clamp(db / DSP_RANGES.eqGain.max, -1, 1) * SCALE
}

/** The band whose centre is nearest this x. */
function bandAtX (x: number): number {
  let nearest = 0

  for (let i = 1; i < BAND_X.length; i++)
    if (Math.abs((BAND_X[i] ?? 0) - x) < Math.abs((BAND_X[nearest] ?? 0) - x))
      nearest = i

  return nearest
}

/**
 * Bin ranges for each x sample.
 *
 * An FFT is linear in frequency and this axis is not, so the low end of the
 * plot spans a fraction of a bin while the top octave spans hundreds. Each
 * sample therefore takes the loudest bin in its own slice: skipping between
 * bins would alias the high end into a comb.
 */
function binRanges (bins: number, nyquist: number): Int32Array {
  const ranges = new Int32Array(SAMPLES * 2)

  for (let i = 0; i < SAMPLES; i++) {
    const low  = i === 0 ? MIN_HZ : ((SAMPLE_HZ[i - 1] ?? MIN_HZ) + (SAMPLE_HZ[i] ?? MIN_HZ)) / 2
    const high = i === SAMPLES - 1 ? MAX_HZ : ((SAMPLE_HZ[i] ?? MIN_HZ) + (SAMPLE_HZ[i + 1] ?? MAX_HZ)) / 2

    const start = clamp(Math.floor(low / nyquist * bins), 0, bins - 1)
    const end   = clamp(Math.ceil(high / nyquist * bins), start + 1, bins)

    ranges[i * 2]     = start
    ranges[i * 2 + 1] = end
  }

  return ranges
}

interface EqCurveProps {
  readonly gains:    readonly number[]
  readonly enabled:  boolean
  readonly analyzer: AnalyserNode | null
  readonly onGain:   (index: number, gain: number) => void
}

export function EqCurve ({ gains, enabled, analyzer, onGain }: EqCurveProps) {
  const svgRef      = useRef<SVGSVGElement>(null)
  const spectrumRef = useRef<SVGPathElement>(null)

  /**
   * Which band the pointer is nearest, or `null` when it is elsewhere.
   *
   * `bandAtX` has only sixteen possible answers, and the setter bails out when
   * the answer has not changed — so a drag across the whole curve re-renders
   * fifteen times, not once per pointer event.
   */
  const [ hovered, setHovered ] = useState<number | null>(null)

  /**
   * The curve is pure render — it only moves when a gain does.
   *
   * The device's own rate, not a nominal one: a 44.1 kHz output warps the top
   * band's response measurably against the 48 kHz default, and the top band is
   * a shelf that reaches all the way to Nyquist.
   */
  const curve = useMemo(() => {
    const response = eqResponseDb(gains, SAMPLE_HZ, analyzer?.context.sampleRate)

    return response.reduce(
      (path, db, i) =>
        `${path}${i === 0 ? 'M' : 'L'}${(SAMPLE_X[i] ?? 0).toFixed(1)} ${gainY(db).toFixed(1)}`,
      ''
    )
  }, [ gains, analyzer ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Owns a `requestAnimationFrame` loop reading the live analyser. The path is written through a ref so React renders the graph once and never again.
  useEffect(() => {
    const path = spectrumRef.current
    if (!analyzer || !path)
      return

    const bins   = analyzer.frequencyBinCount
    const levels = new Uint8Array(bins)
    const ranges = binRanges(bins, analyzer.context.sampleRate / 2)
    const parts  = new Array<string>(SAMPLES + 3)
    let frame     = 0

    const draw = () => {
      analyzer.getByteFrequencyData(levels)

      parts[0] = `M0 ${VIEW_H}`

      for (let i = 0; i < SAMPLES; i++) {
        let peak = 0

        for (let bin = ranges[i * 2] ?? 0; bin < (ranges[i * 2 + 1] ?? 0); bin++)
          peak = Math.max(peak, levels[bin] ?? 0)

        parts[i + 1] = `L${(SAMPLE_X[i] ?? 0).toFixed(1)} ${(VIEW_H - peak / 255 * VIEW_H).toFixed(1)}`
      }

      parts[SAMPLES + 1] = `L${VIEW_W} ${VIEW_H}`
      parts[SAMPLES + 2] = 'Z'

      path.setAttribute('d', parts.join(''))
      frame = requestAnimationFrame(draw)
    }

    // Paint once synchronously as well: `requestAnimationFrame` is suspended
    // while the window is hidden or occluded, and an empty box that only fills
    // in when the window comes forward reads as a broken panel.
    draw()

    return () =>
      cancelAnimationFrame(frame)
  }, [ analyzer ])

  const applyAt = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0)
      return

    const x     = (event.clientX - box.left) / box.width
    const y     = (event.clientY - box.top) / box.height
    const index = bandAtX(x * VIEW_W)
    const raw   = (HALF - y * VIEW_H) / SCALE * DSP_RANGES.eqGain.max
    const step  = DSP_RANGES.eqGain.step

    onGain(index, clamp(Math.round(raw / step) * step, DSP_RANGES.eqGain.min, DSP_RANGES.eqGain.max))
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!enabled)
      return

    event.currentTarget.setPointerCapture(event.pointerId)
    applyAt(event)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect()

    if (box && box.width > 0) {
      const next = bandAtX((event.clientX - box.left) / box.width * VIEW_W)
      setHovered(current =>
        current === next ? current : next)
    }

    if (enabled && event.currentTarget.hasPointerCapture(event.pointerId))
      applyAt(event)
  }

  const onPointerLeave = () =>
    setHovered(null)

  return <div className='eq-curve' data-off={ enabled ? undefined : '' }>
    <svg
      ref={ svgRef }
      aria-hidden='true'
      viewBox={ `0 0 ${VIEW_W} ${VIEW_H}` }
      preserveAspectRatio='none'
      focusable='false'
      onPointerDown={ onPointerDown }
      onPointerMove={ onPointerMove }
      onPointerLeave={ onPointerLeave }>
      <path ref={ spectrumRef } className='eq-spectrum' />
      <line className='eq-zero' x1='0' y1={ HALF } x2={ VIEW_W } y2={ HALF } />

      {GRID_HZ.map(hz =>
        <line
          key={ hz }
          className='eq-grid'
          x1={ axisPosition(hz, MIN_HZ, MAX_HZ) * VIEW_W }
          y1='0'
          x2={ axisPosition(hz, MIN_HZ, MAX_HZ) * VIEW_W }
          y2={ VIEW_H } />
      )}

      <path className='eq-line' d={ curve } />
    </svg>

    {/*
      * The real controls, and the ruler that names them.
      *
      * The inputs are clipped, never `display: none`, so they keep their place
      * in the tab order and their names in the accessibility tree — the same
      * arrangement `SegmentedControl` and `Rating` use for their radios. The
      * list around them is not clipped: each item sits at its own band centre
      * on the log axis (`--at`) and shows on hover.
      *
      * The `aria-label` names the input rather than letting the wrapping
      * `<label>` do it, for the reason `ParamControl` documents: the gain
      * readout beside it would otherwise become part of the accessible name
      * and change on every step of a drag.
      */}
    <ol className='eq-bands'>
      {EQ_BANDS.map((band, index) =>
        <li
          key={ band.hz }
          /* eslint-disable-next-line react-strict/no-style-prop -- The band's position on the log axis is measured data, shared with the curve it labels. */
          style={{ '--at': ((BAND_X[index] ?? 0) / VIEW_W).toFixed(4) } as CSSProperties}
          data-hover={ hovered === index || undefined }>
          <label>
            <span className='eq-band-hz'>{band.label} Hz</span>

            <b className='eq-band-gain' aria-hidden='true'>
              {(gains[index] ?? 0).toFixed(1)} dB
            </b>

            <input
              aria-label={ `${band.label} Hz` }
              aria-valuetext={ `${(gains[index] ?? 0).toFixed(1)} dB` }
              type='range'
              value={ gains[index] ?? 0 }
              min={ DSP_RANGES.eqGain.min }
              max={ DSP_RANGES.eqGain.max }
              step={ DSP_RANGES.eqGain.step }
              disabled={ !enabled }
              onChange={ event =>
                onGain(index, Number(event.target.value)) } />
          </label>
        </li>
      )}
    </ol>
  </div>
}
