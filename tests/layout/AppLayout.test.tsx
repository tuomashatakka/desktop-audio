import type { ComponentProps } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppLayout } from '../../src/app/layout/AppLayout'
import { UIProvider } from '../../src/app/contexts'
import { noop } from '../../src/app/utils/noop'


type UIValue = NonNullable<ComponentProps<typeof UIProvider>['value']>

function makeUIValue (overrides: Partial<UIValue> = {}): UIValue {
  return {
    overlay: null,
    sidebarOpen: false,
    selectedFolderPath: null,
    selectedPlaylistId: null,
    selectedGroup: null,
    editingTrackId: null,
    density: 'normal',
    grouping: 'none',
    sidebarWidth: 220,
    openOverlay: noop,
    closeOverlay: noop,
    toggleSidebar: noop,
    selectFolder: noop,
    selectPlaylist: noop,
    selectGroup: noop,
    setEditingTrack: noop,
    setDensity: noop,
    setGrouping: noop,
    setSidebarWidth: noop,
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

  it('keeps a closed sidebar mounted and removes it from interaction', () => {
    render(
      <UIProvider value={makeUIValue({ sidebarOpen: false })}>
        <AppLayout
          sidebar={<div data-testid='sidebar'>Sidebar</div>}
          main={<div>Main</div>}
        />
      </UIProvider>
    )

    const sidebar = screen.getByTestId('sidebar').closest('aside')
    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    expect(sidebar).toHaveAttribute('inert')
  })

  it('renders the overlays slot outside the workspace', () => {
    const { container } = render(
      <UIProvider value={makeUIValue()}>
        <AppLayout main={<div>Content</div>} overlays={<div data-testid='overlays' />} />
      </UIProvider>
    )

    expect(container.firstChild).toHaveClass('app-shell')
    expect(screen.getByTestId('overlays').closest('.app-workspace')).toBeNull()
  })

  it('exposes the persisted sidebar width as a shell custom property', () => {
    const { container } = render(
      <UIProvider value={makeUIValue({ sidebarWidth: 264 })}>
        <AppLayout main={<div>Content</div>} />
      </UIProvider>
    )

    expect(container.firstChild).toHaveStyle('--sidebar-w: 264px')
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
      <UIProvider value={makeUIValue()}>
        <AppLayout main={<span data-testid='content'>Hello</span>} />
      </UIProvider>
    )

    const shell = screen.getByTestId('content').closest('.app-shell')
    expect(shell).toHaveAttribute('data-height-tier', 'compact')
  })
})
