/* eslint-disable react-strict/no-style-prop -- `--param-turn` carries the control's 0–1 position into CSS, which has no way to read an input's value. Same idiom as `--level` in FolderTree and `--sidebar-w` in AppLayout. */
import { useId, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'


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

interface DragOrigin {
  readonly pointerId: number
  readonly y:         number
  readonly value:     number
}

/** Pixels of travel required to sweep the entire parameter range. */
const DRAG_RANGE_PX = 360

/** Modifier precision is one tenth of the ordinary step and drag distance. */
const FINE_FACTOR = 0.1

function clamp (value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function quantize (value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step
  const digits  = Math.max(0, Math.ceil(-Math.log10(step)) + 1)
  return Number(clamp(snapped, min, max).toFixed(digits))
}

function precisionHeld (event: Pick<KeyboardEvent | PointerEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey
}

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
  const id         = useId()
  const dragOrigin = useRef<DragOrigin | null>(null)

  // Guard the degenerate range rather than emitting `NaN` into the stylesheet.
  const turn = max > min ? (value - min) / (max - min) : 0
  const text = readout(value, unit)

  const handlePointerDown = (event: PointerEvent<HTMLInputElement>) => {
    if (disabled)
      return

    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOrigin.current = {
      pointerId: event.pointerId,
      y:         event.clientY,
      value,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLInputElement>) => {
    const origin = dragOrigin.current
    if (!origin || origin.pointerId !== event.pointerId)
      return

    event.preventDefault()

    const precision = precisionHeld(event) ? FINE_FACTOR : 1
    const delta     = (origin.y - event.clientY) / DRAG_RANGE_PX * (max - min) * precision
    const nextStep  = step * (precisionHeld(event) ? FINE_FACTOR : 1)
    onChange(quantize(origin.value + delta, min, max, nextStep))
  }

  const finishPointer = (event: PointerEvent<HTMLInputElement>) => {
    if (dragOrigin.current?.pointerId !== event.pointerId)
      return

    dragOrigin.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const direction = [ 'ArrowUp', 'ArrowRight' ].includes(event.key)
      ? 1
      : [ 'ArrowDown', 'ArrowLeft' ].includes(event.key) ? -1 : 0
    if (direction === 0)
      return

    event.preventDefault()

    const keyStep = step * (precisionHeld(event) ? FINE_FACTOR : 1)
    onChange(quantize(value + direction * keyStep, min, max, keyStep))
  }

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
        step='any'
        value={ value }
        disabled={ disabled }
        onPointerDown={ handlePointerDown }
        onPointerMove={ handlePointerMove }
        onPointerUp={ finishPointer }
        onPointerCancel={ finishPointer }
        onKeyDown={ handleKeyDown }
        onChange={ event =>
          onChange(quantize(Number(event.target.value), min, max, step)) } />
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
