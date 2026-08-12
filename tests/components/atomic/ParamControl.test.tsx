import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Fader, Knob } from '../../../src/app/components/atomic/ParamControl'


describe('ParamControl', () => {
  it('is a real slider, named by its label alone', () => {
    render(<Knob label='Threshold' value={ -18 } min={ -60 } max={ 0 } onChange={ vi.fn() } />)

    // The readout lives inside the same <label>, so a content-derived name
    // would come out "Threshold −18 dB" and change on every drag.
    const slider = screen.getByRole('slider', { name: 'Threshold' })
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveValue('-18')
  })

  it('spells the value with its unit for assistive tech', () => {
    render(<Knob label='Release' value={ 250 } min={ 10 } max={ 1000 } unit='ms' onChange={ vi.fn() } />)

    expect(screen.getByRole('slider', { name: 'Release' }))
      .toHaveAttribute('aria-valuetext', '250 ms')
  })

  it('hides the visible readout from the accessibility tree', () => {
    const { container } = render(
      <Fader label='1.2k Hz' value={ 3 } min={ -12 } max={ 12 } unit='dB' onChange={ vi.fn() } />
    )

    // <output> is an implicit role=status/aria-live=polite. Sixteen of them
    // would announce on every tick of a drag; aria-valuetext already carries it.
    const output = container.querySelector('.param-value')
    expect(output).toHaveTextContent('3 dB')
    expect(output).toHaveAttribute('aria-hidden', 'true')
  })

  it('reports changes as a number, not a string', () => {
    const onChange = vi.fn()
    render(<Fader label='500 Hz' value={ 0 } min={ -12 } max={ 12 } step={ 0.5 } onChange={ onChange } />)

    fireEvent.change(screen.getByRole('slider', { name: '500 Hz' }), { target: { value: '-4.5' }})
    expect(onChange).toHaveBeenCalledWith(-4.5)
  })

  it('publishes its position to CSS as a 0–1 fraction', () => {
    const { container } = render(
      <Knob label='Ratio' value={ 5 } min={ 1 } max={ 21 } onChange={ vi.fn() } />
    )

    // CSS cannot read an input's value, so the geometry needs this handed over.
    expect(container.querySelector('.param-control'))
      .toHaveStyle({ '--param-turn': '0.2' })
  })

  it('marks each shape so one component can be painted two ways', () => {
    const { container } = render(<>
      <Knob label='A' value={ 0 } min={ 0 } max={ 1 } onChange={ vi.fn() } />
      <Fader label='B' value={ 0 } min={ 0 } max={ 1 } onChange={ vi.fn() } />
    </>)

    expect(container.querySelector('[data-shape="knob"]')).toBeInTheDocument()
    expect(container.querySelector('[data-shape="fader"]')).toBeInTheDocument()
  })

  it('disables the input rather than dropping it, so a bypassed curve still shows', () => {
    render(<Fader label='80 Hz' value={ 6 } min={ -12 } max={ 12 } disabled onChange={ vi.fn() } />)

    expect(screen.getByRole('slider', { name: '80 Hz' })).toBeDisabled()
  })
})
