import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../../src/app/contexts/SettingsContext'
import { DataProvider } from '../../src/app/data/DataContext'
import { HostProvider } from '../../src/app/data/HostContext'
import type { DataSource } from '../../src/app/data/DataSource'
import type { HostBridge } from '../../src/app/data/HostBridge'

const mockDataSource: DataSource = {
  addRoot: vi.fn().mockResolvedValue(null),
  removeRoot: vi.fn().mockResolvedValue(undefined),
  listRoots: vi.fn().mockResolvedValue([]),
  getMusicDir: vi.fn().mockResolvedValue(null),
  scan: vi.fn(),
  load: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockReturnValue(() => {}),
  readBytes: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  readMetadata: vi.fn().mockResolvedValue({ duration: 0 }),
  upsertTrack: vi.fn().mockResolvedValue(undefined),
  deleteTrack: vi.fn().mockResolvedValue(undefined),
}

const mockHost: HostBridge = {
  minimizeWindow:      vi.fn(),
  maximizeWindow:      vi.fn(),
  closeWindow:         vi.fn(),
  isMaximized:         vi.fn().mockResolvedValue(false),
  onMediaPlayPause:    vi.fn().mockReturnValue(() => {}),
  onMediaNext:         vi.fn().mockReturnValue(() => {}),
  onMediaPrev:         vi.fn().mockReturnValue(() => {}),
  showContextMenu:     vi.fn(),
  hideContextMenu:     vi.fn(),
  onContextMenuAction: vi.fn().mockReturnValue(() => {}),
  updateMediaState:    vi.fn(),
  onMediaSeek:         vi.fn().mockReturnValue(() => {}),
  selectDirectory:     vi.fn().mockResolvedValue(null),
  getMusicDir:         vi.fn().mockResolvedValue(null),
}

function wrapWithData (ui: React.ReactNode) {
  return (
    <HostProvider value={mockHost}>
      <DataProvider value={mockDataSource}>
        {ui}
      </DataProvider>
    </HostProvider>
  )
}

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
}

function TestConsumer () {
  const {
    libraryPaths,
    theme,
    volume,
    repeatMode,
    addLibraryPath,
    removeLibraryPath,
    setTheme,
    setVolume,
    setRepeatMode,
  } = useSettings()

  return (
    <div>
      <span data-testid='paths'>{libraryPaths.join(',')}</span>
      <span data-testid='theme'>{theme}</span>
      <span data-testid='volume'>{volume.toString()}</span>
      <span data-testid='repeat'>{repeatMode}</span>
      <button onClick={() => addLibraryPath('/music')}>addPath</button>
      <button onClick={() => removeLibraryPath('/music')}>removePath</button>
      <button onClick={() => setTheme('light')}>setTheme</button>
      <button onClick={() => setVolume(0.5)}>setVolume</button>
      <button onClick={() => setRepeatMode('all')}>setRepeat</button>
    </div>
  )
}

describe('SettingsContext', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorageMock.getItem.mockReturnValue(null)
    localStorageMock.setItem.mockClear()
    vi.stubGlobal('electronAPI', {
      getMusicLibraryPath: vi.fn().mockResolvedValue(null),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('provides default values', () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    expect(screen.getByTestId('paths')).toHaveTextContent('Music')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('volume')).toHaveTextContent('0.8')
    expect(screen.getByTestId('repeat')).toHaveTextContent('none')
  })

  it('addLibraryPath adds path to list', async () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      screen.getByText('addPath').click()
    })

    expect(screen.getByTestId('paths')).toHaveTextContent('/music')
  })

  it('addLibraryPath does not duplicate paths', async () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      screen.getByText('addPath').click()
      screen.getByText('addPath').click()
    })

    expect(screen.getByTestId('paths')).toHaveTextContent('/music')
  })

  it('removeLibraryPath removes path from list', async () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      screen.getByText('addPath').click()
      screen.getByText('removePath').click()
    })

    expect(screen.getByTestId('paths')).toHaveTextContent('')
  })

  it('setTheme updates theme', async () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      screen.getByText('setTheme').click()
    })

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('setVolume clamps volume between 0 and 1', async () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      screen.getByText('setVolume').click()
    })

    expect(screen.getByTestId('volume')).toHaveTextContent('0.5')
  })

  it('setRepeatMode updates repeat mode', async () => {
    render(
      wrapWithData(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    await act(async () => {
      await new Promise(r => setTimeout(r, 10))
      screen.getByText('setRepeat').click()
    })

    expect(screen.getByTestId('repeat')).toHaveTextContent('all')
  })

  it('throws error when useSettings is used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    expect(() => render(<TestConsumer />)).toThrow('useSettings must be used within SettingsProvider')
    
    consoleError.mockRestore()
  })
})
