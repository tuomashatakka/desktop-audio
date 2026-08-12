import { useEffect, useRef } from 'react'
import {
  useSettings, useAudio, DSP_RANGES, EQ_BANDS,
  withEqGain, withFlatEq, withEqEnabled, withCompressor, withLimiter,
} from '../../contexts'
import type { DspSettings, DynamicsModule } from '../../contexts'
import { Button, Fader, Knob } from '../atomic'


/** Gain reduction at or beyond this many dB reads as a full meter. */
const METER_RANGE = 40

/** One knob's worth of wiring, built above the JSX rather than inside it. */
interface KnobSpec {
  readonly key:    string
  readonly label:  string
  readonly value:  number
  readonly min:    number
  readonly max:    number
  readonly step:   number
  readonly unit:   string
  readonly change: (value: number) => (dsp: DspSettings) => DspSettings
}

function compressorKnobs (dsp: DspSettings): readonly KnobSpec[] {
  const { threshold, ratio, attack, release } = dsp.compressor
  const r                                     = DSP_RANGES

  return [
    { key: 'threshold', label: 'Threshold', value: threshold, min: r.compressorThreshold.min, max: r.compressorThreshold.max, step: r.compressorThreshold.step, unit: 'dB', change: v => d => withCompressor(d, { threshold: v }) },
    { key: 'ratio', label: 'Ratio', value: ratio, min: r.compressorRatio.min, max: r.compressorRatio.max, step: r.compressorRatio.step, unit: ':1', change: v => d => withCompressor(d, { ratio: v }) },
    { key: 'attack', label: 'Attack', value: attack, min: r.compressorAttack.min, max: r.compressorAttack.max, step: r.compressorAttack.step, unit: 'ms', change: v => d => withCompressor(d, { attack: v }) },
    { key: 'release', label: 'Release', value: release, min: r.compressorRelease.min, max: r.compressorRelease.max, step: r.compressorRelease.step, unit: 'ms', change: v => d => withCompressor(d, { release: v }) },
  ]
}

/**
 * Ratio, knee and attack are welded in `dspChain` — a limiter is a compressor
 * with those knobs taken away, so they are not shown.
 */
function limiterKnobs (dsp: DspSettings): readonly KnobSpec[] {
  const { threshold, release } = dsp.limiter
  const r                      = DSP_RANGES

  return [
    { key: 'ceiling', label: 'Ceiling', value: threshold, min: r.limiterThreshold.min, max: r.limiterThreshold.max, step: r.limiterThreshold.step, unit: 'dB', change: v => d => withLimiter(d, { threshold: v }) },
    { key: 'release', label: 'Release', value: release, min: r.limiterRelease.min, max: r.limiterRelease.max, step: r.limiterRelease.step, unit: 'ms', change: v => d => withLimiter(d, { release: v }) },
  ]
}

interface ReductionMeterProps {
  readonly module: DynamicsModule
  readonly label:  string
}

/**
 * Live gain reduction for one module.
 *
 * Owns its own frame loop and writes the element through a ref, co-located with
 * the thing it drives — the same discipline `FrequencyMatrix` follows. Driving a
 * `<meter>` through `useState` would re-render the whole panel sixty times a
 * second to move one bar.
 */
function ReductionMeter ({ module, label }: ReductionMeterProps) {
  const { reductionOf } = useAudio()
  const meterRef        = useRef<HTMLMeterElement | null>(null)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Owns a `requestAnimationFrame` loop that reads gain reduction off a live Web Audio node and writes it onto a `<meter>` through a ref, so React renders it once.
  useEffect(() => {
    let frame = 0

    const paint = () => {
      // `reduction` is negative dB; a meter fills from its start, so the
      // magnitude is what gets shown.
      if (meterRef.current)
        meterRef.current.value = Math.min(METER_RANGE, -reductionOf(module))

      frame = requestAnimationFrame(paint)
    }

    // Once synchronously as well as from the loop: rAF is suspended while the
    // window is hidden or occluded, and without this the meter opens empty and
    // stays that way until the window comes forward.
    paint()

    return () =>
      cancelAnimationFrame(frame)
  }, [ reductionOf, module ])

  return <meter
    ref={ meterRef }
    className='dsp-meter'
    aria-label={ label }
    min={ 0 }
    max={ METER_RANGE }
    value={ 0 } />
}

interface ModuleHeaderProps {
  readonly title:     string
  readonly enabled:   boolean
  readonly onToggle:  (on: boolean) => void
  readonly children?: React.ReactNode
}

/**
 * A module's name and its bypass switch.
 *
 * `role="switch"` on a real checkbox: this is on-off-now rather than
 * agree-later, and the platform already has the control. A `<button
 * aria-pressed>` would be reimplementing a checkbox badly.
 */
function ModuleHeader ({ title, enabled, onToggle, children }: ModuleHeaderProps) {
  return <legend className='dsp-module-header'>
    <label className='dsp-switch'>
      <input
        aria-label={ `${title} enabled` }
        type='checkbox'
        role='switch'
        checked={ enabled }
        onChange={ event =>
          onToggle(event.target.checked) } />

      <span>{title}</span>
    </label>

    {children}
  </legend>
}

interface KnobRowProps {
  readonly specs:    readonly KnobSpec[]
  readonly disabled: boolean
  readonly onChange: (change: (dsp: DspSettings) => DspSettings) => void
}

function KnobRow ({ specs, disabled, onChange }: KnobRowProps) {
  return <div className='dsp-knobs'>
    {specs.map(spec =>
      <Knob
        key={ spec.key }
        label={ spec.label }
        value={ spec.value }
        min={ spec.min }
        max={ spec.max }
        step={ spec.step }
        unit={ spec.unit }
        disabled={ disabled }
        onChange={ value =>
          onChange(spec.change(value)) } />
    )}
  </div>
}

/**
 * The now-playing overlay's DSP page: 16-band EQ, compressor, limiter.
 *
 * The panel holds no DSP state of its own. Every control writes straight to
 * `SettingsContext`, which persists it and hands it to `AudioContext`, which
 * pushes it onto the live nodes. The only thing read back off the audio graph
 * is gain reduction, which is not a settable parameter and has to be polled —
 * see {@link ReductionMeter}.
 */
export function DspPanel () {
  const { dsp, updateDsp } = useSettings()

  return <section className='dsp-panel' aria-label='Audio processing'>
    <fieldset className='dsp-module' data-module='eq'>
      <ModuleHeader
        title='Equaliser'
        enabled={ dsp.eq.on }
        onToggle={ on =>
          updateDsp(d =>
            withEqEnabled(d, on)) }>
        <Button
          variant='ghost'
          size='sm'
          type='button'
          onClick={ () =>
            updateDsp(withFlatEq) }>
          Flat
        </Button>
      </ModuleHeader>

      {/* Ordered: ascending frequency is the point, not incidental. */}
      <ol className='dsp-bands'>
        {EQ_BANDS.map((band, index) =>
          <li key={ band.hz }>
            <Fader
              label={ `${band.label} Hz` }
              value={ dsp.eq.gains[index] ?? 0 }
              min={ DSP_RANGES.eqGain.min }
              max={ DSP_RANGES.eqGain.max }
              step={ DSP_RANGES.eqGain.step }
              unit='dB'
              disabled={ !dsp.eq.on }
              onChange={ gain =>
                updateDsp(d =>
                  withEqGain(d, index, gain)) } />
          </li>
        )}
      </ol>

      <p className='dsp-note'>
        Sixteen overlapping bands can add up to more than unity. Switch the
        limiter on if you are boosting hard.
      </p>
    </fieldset>

    <fieldset className='dsp-module' data-module='compressor'>
      <ModuleHeader
        title='Compressor'
        enabled={ dsp.compressor.on }
        onToggle={ on =>
          updateDsp(d =>
            withCompressor(d, { on })) }>
        <ReductionMeter module='compressor' label='Compressor gain reduction' />
      </ModuleHeader>

      <KnobRow
        specs={ compressorKnobs(dsp) }
        disabled={ !dsp.compressor.on }
        onChange={ updateDsp } />
    </fieldset>

    <fieldset className='dsp-module' data-module='limiter'>
      <ModuleHeader
        title='Limiter'
        enabled={ dsp.limiter.on }
        onToggle={ on =>
          updateDsp(d =>
            withLimiter(d, { on })) }>
        <ReductionMeter module='limiter' label='Limiter gain reduction' />
      </ModuleHeader>

      <KnobRow
        specs={ limiterKnobs(dsp) }
        disabled={ !dsp.limiter.on }
        onChange={ updateDsp } />
    </fieldset>
  </section>
}
