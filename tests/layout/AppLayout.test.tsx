import type { ComponentProps } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppLayout } from '../../src/app/layout/AppLayout'
import { UIProvider } from '../../src/app/contexts'
import { noop } from '../../src/app/utils/noop'


type UIValue = NonNullable<ComponentProps<typeof UIProvider>['value']>

function makeUIValue (overrides: Partial<UIValue> = {}): UIValue {
  return {
    currentView: 'library',
    previousView: null,
    sidebarOpen: false,
    selectedFolderPath: null,
    selectedPlaylistId: null,
    editingTrackId: null,
    density: 'normal',
    grouping: 'none',
    setView: noop,
    toggleSidebar: noop,
    selectFolder: noop,
    selectPlaylist: noop,
    setEditingTrack: noop,
    setDensity: noop,
    setGrouping: noop,
    ...overrides,
  }
}

describe('AppLayout', () => {
  it('renders semantic titlebar, sidebar, main, and player slots', () => {
    render(
      <UIProvider value={makeUIValue({ sidebarOpen: true })}>
        <AppLayout
          titlebar={<div data-testid='titlebar'>Titlebar</div>}
          sidebar={<div data-testid='sidebar'>Sidebar</div>}
          main={<div data-testid='main'>Main Content</div>}
          player={<div data-testid='player'>Player</div>}
        />
      </UIProvider>
    )

    expect(screen.getByTestId('titlebar').closest('header')).toHaveClass('titlebar')
    expect(screen.getByTestId('sidebar').closest('aside')).toHaveClass('app-sidebar')
    expect(screen.getByTestId('main').closest('main')).toHaveClass('app-main', 'view-content')
    expect(screen.getByTestId('player').closest('footer')).toHaveClass('app-player')
  })

  it('renders without optional slots', () => {
    render(
      <UIProvider value={makeUIValue()}>
        <AppLayout main={<div data-testid='main'>Main Only</div>} />
      </UIProvider>
    )

    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(document.querySelector('.app-player')).not.toBeInTheDocument()
  })

  it('exposes the active view on the app shell', () => {
    const { container } = render(
      <UIProvider value={makeUIValue({ currentView: 'settings' })}>
        <AppLayout main={<div>Content</div>} />
      </UIProvider>
    )

    expect(container.firstChild).toHaveClass('app-shell')
    expect(container.firstChild).toHaveAttribute('data-view', 'settings')
  })

  it('renders main content in app-main', () => {
    render(
      <UIProvider value={makeUIValue()}>
        <AppLayout main={<span data-testid='content'>Hello</span>} />
      </UIProvider>
    )

    expect(screen.getByTestId('content').closest('.app-main')).toBeInTheDocument()
  })

  it('exposes the window height tier on the shell', () => {
    Object.defineProperty(window, 'innerHeight', { value: 240, configurable: true, writable: true })

    render(
      <UIProvider value={makeUIValue({ currentView: 'player', previousView: 'library' })}>
        <AppLayout main={<span data-testid='content'>Hello</span>} />
      </UIProvider>
    )

    const shell = screen.getByTestId('content').closest('.app-shell')
    expect(shell).toHaveAttribute('data-height-tier', 'compact')
  })
})
