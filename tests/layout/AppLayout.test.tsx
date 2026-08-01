import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppLayout } from '../../src/app/layout/AppLayout'
import { UIProvider } from '../../src/app/contexts'

describe('AppLayout', () => {
  it('renders titlebar, sidebar, main, and player slots', () => {
    render(
      <UIProvider value={{
        currentView: 'library',
        sidebarOpen: true,
        selectedFolderPath: null,
        selectedPlaylistId: null,
        editingTrackId: null,
        playerExpanded: false,
        density: 'normal',
        grouping: 'none',
        setView: () => {},
        toggleSidebar: () => {},
        selectFolder: () => {},
        selectPlaylist: () => {},
        setEditingTrack: () => {},
        togglePlayerExpanded: () => {},
        setDensity: () => {},
        setGrouping: () => {},
      }}>
        <AppLayout
          titlebar={<div data-testid="titlebar">Titlebar</div>}
          sidebar={<div data-testid="sidebar">Sidebar</div>}
          main={<div data-testid="main">Main Content</div>}
          player={<div data-testid="player">Player</div>}
        />
      </UIProvider>
    )

    expect(screen.getByTestId('titlebar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('main')).toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('renders without optional slots', () => {
    render(
      <UIProvider value={{
        currentView: 'library',
        sidebarOpen: false,
        selectedFolderPath: null,
        selectedPlaylistId: null,
        editingTrackId: null,
        playerExpanded: false,
        density: 'normal',
        grouping: 'none',
        setView: () => {},
        toggleSidebar: () => {},
        selectFolder: () => {},
        selectPlaylist: () => {},
        setEditingTrack: () => {},
        togglePlayerExpanded: () => {},
        setDensity: () => {},
        setGrouping: () => {},
      }}>
        <AppLayout main={<div data-testid="main">Main Only</div>} />
      </UIProvider>
    )

    expect(screen.getByTestId('main')).toBeInTheDocument()
  })

  it('uses app-shell class', () => {
    const { container } = render(
      <UIProvider value={{
        currentView: 'library',
        sidebarOpen: false,
        selectedFolderPath: null,
        selectedPlaylistId: null,
        editingTrackId: null,
        playerExpanded: false,
        density: 'normal',
        grouping: 'none',
        setView: () => {},
        toggleSidebar: () => {},
        selectFolder: () => {},
        selectPlaylist: () => {},
        setEditingTrack: () => {},
        togglePlayerExpanded: () => {},
        setDensity: () => {},
        setGrouping: () => {},
      }}>
        <AppLayout main={<div>Content</div>} />
      </UIProvider>
    )

    expect(container.firstChild).toHaveClass('app-shell')
  })

  it('renders main content in app-main', () => {
    render(
      <UIProvider value={{
        currentView: 'library',
        sidebarOpen: false,
        selectedFolderPath: null,
        selectedPlaylistId: null,
        editingTrackId: null,
        playerExpanded: false,
        density: 'normal',
        grouping: 'none',
        setView: () => {},
        toggleSidebar: () => {},
        selectFolder: () => {},
        selectPlaylist: () => {},
        setEditingTrack: () => {},
        togglePlayerExpanded: () => {},
        setDensity: () => {},
        setGrouping: () => {},
      }}>
        <AppLayout main={<span data-testid="content">Hello</span>} />
      </UIProvider>
    )

    const main = screen.getByTestId('content').closest('.app-main')
    expect(main).toBeInTheDocument()
  })

  it('exposes the window height tier on the shell', () => {
    Object.defineProperty(window, 'innerHeight', { value: 240, configurable: true, writable: true })

    render(
      <UIProvider value={{
        currentView: 'player',
        previousView: 'library',
        sidebarOpen: false,
        selectedFolderPath: null,
        selectedPlaylistId: null,
        editingTrackId: null,
        playerExpanded: false,
        density: 'normal',
        grouping: 'none',
        setView: () => {},
        toggleSidebar: () => {},
        selectFolder: () => {},
        selectPlaylist: () => {},
        setEditingTrack: () => {},
        togglePlayerExpanded: () => {},
        setPlayerExpanded: () => {},
        setDensity: () => {},
        setGrouping: () => {},
      }}>
        <AppLayout main={<span data-testid="content">Hello</span>} />
      </UIProvider>
    )

    const shell = screen.getByTestId('content').closest('.app-shell')
    expect(shell).toHaveAttribute('data-height-tier', 'compact')
  })
})
