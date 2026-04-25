import { render, screen, act } from '@testing-library/react'
import { UIProvider, useUI, type ViewType } from '../../src/app/contexts/UIContext'

function TestConsumer () {
  const {
    currentView,
    sidebarOpen,
    selectedFolderPath,
    editingTrackId,
    playerExpanded,
    setView,
    toggleSidebar,
    selectFolder,
    setEditingTrack,
    togglePlayerExpanded,
  } = useUI()

  return (
    <div>
      <span data-testid='view'>{currentView}</span>
      <span data-testid='sidebar'>{sidebarOpen.toString()}</span>
      <span data-testid='folder'>{selectedFolderPath ?? 'null'}</span>
      <span data-testid='editing'>{editingTrackId ?? 'null'}</span>
      <span data-testid='expanded'>{playerExpanded.toString()}</span>
      <button onClick={() => setView('player')}>setView</button>
      <button onClick={toggleSidebar}>toggleSidebar</button>
      <button onClick={() => selectFolder('/test/path')}>selectFolder</button>
      <button onClick={() => setEditingTrack('track-1')}>setEditingTrack</button>
      <button onClick={togglePlayerExpanded}>togglePlayerExpanded</button>
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
    expect(screen.getByTestId('sidebar')).toHaveTextContent('false')
    expect(screen.getByTestId('folder')).toHaveTextContent('null')
    expect(screen.getByTestId('editing')).toHaveTextContent('null')
    expect(screen.getByTestId('expanded')).toHaveTextContent('false')
  })

  it('setView updates current view', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    await act(async () => {
      screen.getByText('setView').click()
    })

    expect(screen.getByTestId('view')).toHaveTextContent('player')
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
  })

  it('togglePlayerExpanded toggles player expanded state', async () => {
    render(
      <UIProvider>
        <TestConsumer />
      </UIProvider>
    )

    expect(screen.getByTestId('expanded')).toHaveTextContent('false')

    await act(async () => {
      screen.getByText('togglePlayerExpanded').click()
    })

    expect(screen.getByTestId('expanded')).toHaveTextContent('true')
  })

  it('throws error when useUI is used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TestConsumer />)).toThrow('useUI must be used within UIProvider')

    consoleError.mockRestore()
  })
})
