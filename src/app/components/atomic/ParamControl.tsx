/* eslint-disable react-strict/no-style-prop -- `--param-turn` carries the control's 0–1 position into CSS, which has no way to read an input's value. Same idiom as `--level` in FolderTree and `--sidebar-w` in AppLayout. */
import { useId } from 'react'
import type { CSSProperties } from 'react'


/** How the same control is painted. See `.param-control` in `components.css`. */
type ParamShape = 'knob' | 'fader'

interface ParamControlProps {
  readonly label: string
  readonly value: number
  readonly min:   number
  readonly max:   number
  readonly step?: number

  /** Appended to the readout and to `aria-valuetext` — `dB`, `ms`, `:1`. */
  readonly unit?:     string
  readonly disabled?: boolean
  readonly onChange:  (value: number) => void
}

type ShapedProps = ParamControlProps & { readonly shape: ParamShape }

function readout (value: number, unit?: string): string {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return unit ? `${shown} ${unit}` : shown
}

/**
 * A labelled numeric parameter, as either a rotary knob or a vertical fader.
 *
 * The control *is* a native `<input type='range'>`, which is the whole point:
 * `role="slider"`, `aria-valuenow`, arrow/Home/End keys, pointer drag and the
 * focus ring are the platform's job, exactly as {@link SegmentedControl} and
 * {@link Rating} take radio semantics from a real radio group. The visible
 * shape is a decorative sibling and the input lies transparent over it — the
 * same arrangement `WaveformProgress` uses for seeking.
 *
 * Three details are deliberate:
 *
 * - **`aria-label` names the input** rather than the wrapping `<label>`'s text,
 *   which also contains the readout — a content-derived name would come out
 *   "Threshold −24 dB" and change every time the value moved.
 * - **`aria-valuetext` carries the unit**, so a screen reader says "−4.5 dB"
 *   and not a bare "−4.5".
 * - **The readout is `aria-hidden`.** An `<output>` is an implicit
 *   `role="status"` with `aria-live="polite"`, and sixteen EQ faders would
 *   otherwise announce on every tick of a drag. The value is already in
 *   `aria-valuetext`.
 *
 * Both shapes put the input in vertical writing mode, so the drag gesture is
 * up-for-more. On a round dial a horizontal drag is the wrong mental model, and
 * clicking the left edge of one would jump it to minimum.
 */
function ParamControl ({
  label, value, min, max, step = 1, unit, disabled, onChange, shape,
}: ShapedProps) {
  const id = useId()

  // Guard the degenerate range rather than emitting `NaN` into the stylesheet.
  const turn = max > min ? (value - min) / (max - min) : 0
  const text = readout(value, unit)

  return <label
    className='param-control'
    style={{ '--param-turn': turn } as CSSProperties}
    data-shape={ shape }
    htmlFor={ id }>
    <span className='param-label'>{label}</span>

    <span className='param-well'>
      <span className='param-shape' aria-hidden='true' />

      <input
        id={ id }
        className='param-input'
        aria-label={ label }
        aria-valuetext={ text }
        type='range'
        min={ min }
        max={ max }
        step={ step }
        value={ value }
        disabled={ disabled }
        onChange={ event =>
          onChange(Number(event.target.value)) } />
    </span>

    <output className='param-value' aria-hidden='true' htmlFor={ id }>{text}</output>
  </label>
}

/** A {@link ParamControl} as a rotary dial. */
export function Knob (props: ParamControlProps) {
  return <ParamControl shape='knob' { ...props } />
}

/** A {@link ParamControl} as a vertical fader — the graphic-EQ idiom. */
export function Fader (props: ParamControlProps) {
  return <ParamControl shape='fader' { ...props } />
}
