import { render, screen, act } from '@testing-library/react'
import { UIProvider, useUI } from '../../src/app/contexts/UIContext'


function TestConsumer () {
  const {
    currentView,
    previousView,
    sidebarOpen,
    selectedFolderPath,
    editingTrackId,
    sidebarWidth,
    setView,
    toggleSidebar,
    selectFolder,
    setEditingTrack,
    setSidebarWidth,
  } = useUI()

  return (
    <div>
      <span data-testid='view'>{currentView}</span>
      <span data-testid='previous-view'>{previousView ?? 'null'}</span>
      <span data-testid='sidebar'>{sidebarOpen.toString()}</span>
      <span data-testid='folder'>{selectedFolderPath ?? 'null'}</span>
      <span data-testid='editing'>{editingTrackId ?? 'null'}</span>
      <span data-testid='sidebar-width'>{sidebarWidth}</span>
      <button onClick={() => setView('player')}>setView</button>
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

    expect(screen.getByTestId('view')).toHaveTextContent('library')
    expect(screen.getByTestId('previous-view')).toHaveTextContent('null')
    expect(screen.getByTestId('sidebar')).toHaveTextContent('false')
    expect(screen.getByTestId('folder')).toHaveTextContent('null')
    expect(screen.getByTestId('editing')).toHaveTextContent('null')
    expect(screen.getByTestId('sidebar-width')).toHaveTextContent('220')
  })

  it('setView updates the current and previous views', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('setView').click()
    })

    expect(screen.getByTestId('view')).toHaveTextContent('player')
    expect(screen.getByTestId('previous-view')).toHaveTextContent('library')
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

  it('setEditingTrack updates editing track and switches to tag-editor view', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('setEditingTrack').click()
    })

    expect(screen.getByTestId('editing')).toHaveTextContent('track-1')
    expect(screen.getByTestId('view')).toHaveTextContent('tag-editor')
    expect(screen.getByTestId('previous-view')).toHaveTextContent('library')
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
