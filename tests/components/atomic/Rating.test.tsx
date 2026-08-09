import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Rating } from '../../../src/app/components/atomic/Rating'


describe('Rating', () => {
  it('exposes five stars as a named radio group', () => {
    render(<Rating legend='Rating' value={ 3 } onChange={ vi.fn() } />)

    const group = screen.getByRole('group', { name: 'Rating' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByRole('radio', { name: '3 stars' })).toBeChecked()
  })

  it('treats an absent rating as unrated rather than zero stars', () => {
    render(<Rating legend='Rating' value={ undefined } onChange={ vi.fn() } />)

    for (const radio of screen.getAllByRole('radio'))
      expect(radio).not.toBeChecked()
  })

  it('reports the chosen star', () => {
    const onChange = vi.fn()
    render(<Rating legend='Rating' value={ 1 } onChange={ onChange } />)

    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('can be cleared — a radio group has no uncheck gesture of its own', () => {
    const onChange = vi.fn()
    render(<Rating legend='Rating' value={ 5 } onChange={ onChange } />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear rating' }))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('disables every star and drops the clear button when read-only', () => {
    render(<Rating legend='Rating' value={ 2 } readOnly />)

    for (const radio of screen.getAllByRole('radio'))
      expect(radio).toBeDisabled()

    expect(screen.queryByRole('button', { name: 'Clear rating' })).toBeNull()
  })
})
