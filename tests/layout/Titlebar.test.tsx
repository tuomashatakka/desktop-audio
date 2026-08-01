import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Titlebar } from '../../src/app/layout/Titlebar'
import { renderWithProviders } from '../helpers/renderWithProviders'


describe('Titlebar', () => {
  it('keeps the sidebar control at the start of the titlebar', () => {
    renderWithProviders(<Titlebar><span>Library context</span></Titlebar>)

    const toggle = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.parentElement?.firstElementChild).toBe(toggle)

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('marks the active route and renders the combined context', () => {
    renderWithProviders(<Titlebar><span>Library context</span></Titlebar>)

    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Player' })).toHaveAttribute('aria-label', 'Player')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-label', 'Settings')
    expect(screen.getByText('Library context')).toBeInTheDocument()
  })
})
