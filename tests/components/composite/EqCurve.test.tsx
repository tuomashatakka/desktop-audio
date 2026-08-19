/**
 * Pointer editing on the EQ curve.
 *
 * The band a press picks is the band the drag edits. Before that, `applyAt`
 * re-ran the nearest-band search on every move, so pulling one band up while
 * the pointer wandered sideways wrote the gain into every band it crossed —
 * one gesture, half the spectrum. The secondary button is the other half of
 * the same idea: it moves the pick without writing anything, which is the only
 * reliable way onto the low bands, where four of them share two per cent of a
 * logarithmic axis.
 */
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EqCurve } from '../../../src/app/components/composite/EqCurve'
import { EQ_BANDS } from '../../../src/app/contexts'


const GAINS = EQ_BANDS.map(() =>
  0)

/** The viewBox is 1000×260, and jsdom reports a zero-size box unless told. */
const BOX = { left: 0, top: 0, width: 1000, height: 260 }

function renderCurve (onGain = vi.fn()) {
  const view = render(<EqCurve gains={ GAINS } enabled analyzer={ null } onGain={ onGain } />)
  const svg  = view.container.querySelector('svg')!

  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(BOX as DOMRect)

  // jsdom has no pointer capture; the drag branch asks for it by name.
  const captured = new Set<number>()
  svg.setPointerCapture = (id: number) => {
    captured.add(id)
  }
  svg.hasPointerCapture = (id: number) =>
    captured.has(id)
  svg.releasePointerCapture = (id: number) => {
    captured.delete(id)
  }

  return { ...view, svg, onGain }
}

/** The index of the band whose ruler item is marked as picked. */
function focusedIndex (container: HTMLElement): number {
  return [ ...container.querySelectorAll('.eq-bands > li') ]
    .findIndex(li =>
      li.hasAttribute('data-focus'))
}

describe('EqCurve', () => {
  it('marks the band the press picked', () => {
    const { container, svg } = renderCurve()

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 500, clientY: 60 })

    const picked = focusedIndex(container)
    expect(picked).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-focus]')).toHaveLength(1)
  })

  it('keeps the drag on the band it started on', () => {
    const { svg, onGain } = renderCurve()

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 500, clientY: 60 })
    const started = onGain.mock.calls[0]?.[0]

    // All the way across the axis, which used to re-target every band on the way.
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 900, clientY: 40 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 120, clientY: 30 })

    expect(onGain).toHaveBeenCalledTimes(3)
    expect(onGain.mock.calls.every(([ index ]) =>
      index === started)).toBe(true)
  })

  it('steps the pick on the secondary button without writing a gain', () => {
    const { container, svg, onGain } = renderCurve()

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 500, clientY: 60 })
    const picked = focusedIndex(container)
    onGain.mockClear()

    fireEvent.pointerDown(svg, { button: 2, pointerId: 2, clientX: 500, clientY: 60 })

    expect(focusedIndex(container)).toBe((picked + 1) % EQ_BANDS.length)
    expect(onGain).not.toHaveBeenCalled()
  })

  it('steps backwards with shift, and wraps', () => {
    const { container, svg } = renderCurve()

    // The lowest band is the leftmost pixel, so stepping back from it wraps.
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 0, clientY: 130 })
    expect(focusedIndex(container)).toBe(0)

    fireEvent.pointerDown(svg, { button: 2, pointerId: 2, shiftKey: true, clientX: 0, clientY: 130 })

    expect(focusedIndex(container)).toBe(EQ_BANDS.length - 1)
  })

  it('does not edit while bypassed, but still moves the pick', () => {
    const onGain = vi.fn()
    const { container } = render(
      <EqCurve gains={ GAINS } enabled={ false } analyzer={ null } onGain={ onGain } />
    )

    const svg = container.querySelector('svg')!
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(BOX as DOMRect)

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 500, clientY: 60 })
    expect(onGain).not.toHaveBeenCalled()

    fireEvent.pointerDown(svg, { button: 2, pointerId: 2, clientX: 500, clientY: 60 })
    expect(focusedIndex(container)).toBe(1)
  })
})
