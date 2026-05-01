import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppLayout } from '../../src/app/layout/AppLayout'

describe('AppLayout', () => {
  it('renders titlebar, sidebar, main, and player slots', () => {
    render(
      <AppLayout
        titlebar={<div data-testid="titlebar">Titlebar</div>}
        sidebar={<div data-testid="sidebar">Sidebar</div>}
        main={<div data-testid="main">Main Content</div>}
        player={<div data-testid="player">Player</div>}
      />
    )

    expect(screen.getByTestId('titlebar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('renders without optional slots', () => {
    render(
      <AppLayout main={<div data-testid="main">Main Only</div>} />
    )

    expect(screen.getByTestId('main')).toBeInTheDocument()
  })

  it('uses app-shell class', () => {
    const { container } = render(
      <AppLayout main={<div>Content</div>} />
    )

    expect(container.firstChild).toHaveClass('app-shell')
  })

  it('renders main content in app-main', () => {
    render(
      <AppLayout main={<span data-testid="content">Hello</span>} />
    )

    const main = screen.getByTestId('content').closest('.app-main')
    expect(main).toBeInTheDocument()
  })
})
