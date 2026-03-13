import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Slider } from '../../../src/app/components/atomic/Slider'

describe('Slider', () => {
  it('renders range input', () => {
    render(<Slider />)
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('renders with label', () => {
    render(<Slider label='Volume' />)
    expect(screen.getByText('Volume')).toBeInTheDocument()
  })

  it('generates id from label if not provided', () => {
    render(<Slider label='Volume Control' />)
    expect(screen.getByRole('slider')).toHaveAttribute('id', 'volume-control')
  })

  it('uses provided id', () => {
    render(<Slider id='custom-slider' label='Custom' />)
    expect(screen.getByRole('slider')).toHaveAttribute('id', 'custom-slider')
  })

  it('passes additional props to input element', () => {
    render(<Slider min={0} max={100} value={50} />)
    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
    expect(slider).toHaveAttribute('value', '50')
  })

  it('has data-slider attribute', () => {
    render(<Slider />)
    expect(screen.getByRole('slider')).toHaveAttribute('data-slider')
  })
})
