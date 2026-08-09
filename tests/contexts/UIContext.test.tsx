import { render, screen, act } from '@testing-library/react'
import { UIProvider, useUI } from '../../src/app/contexts/UIContext'


function TestConsumer () {
  const {
    overlay,
    selectedGroup,
    sidebarOpen,
    selectedFolderPath,
    editingTrackId,
    sidebarWidth,
    openOverlay,
    closeOverlay,
    toggleSidebar,
    selectFolder,
    selectGroup,
    setEditingTrack,
    setSidebarWidth,
  } = useUI()

  return (
    <div>
      <span data-testid='overlay'>{overlay ?? 'null'}</span>
      <span data-testid='group'>{selectedGroup?.label ?? 'null'}</span>
      <span data-testid='sidebar'>{sidebarOpen.toString()}</span>
      <span data-testid='folder'>{selectedFolderPath ?? 'null'}</span>
      <span data-testid='editing'>{editingTrackId ?? 'null'}</span>
      <span data-testid='sidebar-width'>{sidebarWidth}</span>
      <button onClick={() => openOverlay('player')}>openOverlay</button>
      <button onClick={closeOverlay}>closeOverlay</button>
      <button onClick={() => selectGroup({ grouping: 'album', key: 'k', label: 'Kid A' })}>selectGroup</button>
      <button onClick={toggleSidebar}>toggleSidebar</button>
      <button onClick={() => selectFolder('/test/path')}>selectFolder</button>
      <button onClick={() => setEditingTrack('track-1')}>setEditingTrack</button>
      <button onClick={() => setSidebarWidth(width => width + 1_000)}>widenSidebar</button>
    </div>
  )
}

describe('UIContext', () => {
  it('provides default values', () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    expect(screen.getByTestId('overlay')).toHaveTextContent('null')
    expect(screen.getByTestId('group')).toHaveTextContent('null')
    expect(screen.getByTestId('sidebar')).toHaveTextContent('false')
    expect(screen.getByTestId('folder')).toHaveTextContent('null')
    expect(screen.getByTestId('editing')).toHaveTextContent('null')
    expect(screen.getByTestId('sidebar-width')).toHaveTextContent('220')
  })

  it('opens and closes one overlay at a time', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('openOverlay').click()
    })
    expect(screen.getByTestId('overlay')).toHaveTextContent('player')

    await act(async () => {
      screen.getByText('closeOverlay').click()
    })
    expect(screen.getByTestId('overlay')).toHaveTextContent('null')
  })

  it('a group narrows within the folder instead of replacing it', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('selectFolder').click()
    })
    await act(async () => {
      screen.getByText('selectGroup').click()
    })

    // Both survive: an album card counted inside a folder must open the same
    // set it advertised, not that album across the whole library.
    expect(screen.getByTestId('group')).toHaveTextContent('Kid A')
    expect(screen.getByTestId('folder')).toHaveTextContent('/test/path')
  })

  it('picking a different folder drops the drilled-into group', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('selectGroup').click()
    })
    await act(async () => {
      screen.getByText('selectFolder').click()
    })

    // The bucket may not exist under the new folder, so it cannot survive.
    expect(screen.getByTestId('folder')).toHaveTextContent('/test/path')
    expect(screen.getByTestId('group')).toHaveTextContent('null')
  })

  it('toggleSidebar toggles sidebar state', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    expect(screen.getByTestId('sidebar')).toHaveTextContent('false')

    await act(async () => {
      screen.getByText('toggleSidebar').click()
    })

    expect(screen.getByTestId('sidebar')).toHaveTextContent('true')
  })

  it('selectFolder updates selected folder path', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('selectFolder').click()
    })

    expect(screen.getByTestId('folder')).toHaveTextContent('/test/path')
  })

  it('setEditingTrack updates editing track and opens the tag-editor overlay', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('setEditingTrack').click()
    })

    expect(screen.getByTestId('editing')).toHaveTextContent('track-1')
    expect(screen.getByTestId('overlay')).toHaveTextContent('tag-editor')
  })

  it('clamps and persists sidebar width updates', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('widenSidebar').click()
    })

    expect(screen.getByTestId('sidebar-width')).toHaveTextContent('400')
    expect(localStorage.setItem).toHaveBeenLastCalledWith('desktop-audio-sidebar-width', '400')
  })

  it('clamps a corrupt stored sidebar width before exposing it', () => {
    localStorage.setItem('desktop-audio-sidebar-width', 'not-a-number')

    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    expect(screen.getByTestId('sidebar-width')).toHaveTextContent('220')
  })

  it('restores a persisted sidebar width on mount', () => {
    localStorage.setItem('desktop-audio-sidebar-width', '318')

    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    expect(screen.getByTestId('sidebar-width')).toHaveTextContent('318')
  })

  it('throws error when useUI is used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TestConsumer />)).toThrow('useUI must be used within UIProvider')

    consoleError.mockRestore()
  })
})
