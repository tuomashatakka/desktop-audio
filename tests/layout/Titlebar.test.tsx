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

  it('renders the context slot and no route navigation', () => {
    renderWithProviders(<Titlebar><span>Library context</span></Titlebar>)

    expect(screen.getByText('Library context')).toBeInTheDocument()

    // The views became overlays, so there is nothing to navigate between.
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Player' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
  })

  it('keeps the window controls', () => {
    renderWithProviders(<Titlebar />)

    for (const name of [ 'Minimize', 'Maximize', 'Close' ])
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })
})
