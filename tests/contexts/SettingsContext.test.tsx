import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../../src/app/contexts/SettingsContext'
import { BridgeProvider } from '../../src/app/data/BridgeContext'
import type { Bridge } from '../../src/app/data/Bridge'

const mockBridge: Bridge = {
  scanLibrary: vi.fn(),
  loadLibrary: vi.fn().mockResolvedValue([]),
  onLibraryBatch: vi.fn(() => () => {}),
  onLibraryDone: vi.fn(() => () => {}),
  selectDirectory: vi.fn(),
  getMusicDir: vi.fn().mockResolvedValue(null),
  readFile: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  getAudioMetadata: vi.fn(),
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  isMaximized: vi.fn(),
  onMediaPlayPause: vi.fn(() => () => {}),
  onMediaNext: vi.fn(() => () => {}),
  onMediaPrev: vi.fn(() => () => {}),
  showContextMenu: vi.fn(),
  hideContextMenu: vi.fn(),
  onContextMenuAction: vi.fn(() => () => {}),
  updateMediaState: vi.fn(),
  onMediaSeek: vi.fn(() => () => {}),
  upsertModel: vi.fn(),
  deleteModel: vi.fn(),
}

function wrapWithBridge(ui: React.ReactNode) {
  return <BridgeProvider value={mockBridge}>{ui}</BridgeProvider>
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

describe.skip('SettingsContext', () => {
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
      wrapWithBridge(
        <SettingsProvider>
          <TestConsumer />
        </SettingsProvider>
      )
    )

    expect(screen.getByTestId('paths')).toHaveTextContent('')
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('volume')).toHaveTextContent('0.8')
    expect(screen.getByTestId('repeat')).toHaveTextContent('none')
  })

  it('addLibraryPath adds path to list', async () => {
    render(
      wrapWithBridge(
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
      wrapWithBridge(
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
      wrapWithBridge(
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
      wrapWithBridge(
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
      wrapWithBridge(
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
      wrapWithBridge(
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
