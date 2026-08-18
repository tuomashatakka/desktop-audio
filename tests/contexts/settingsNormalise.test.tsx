import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../../src/app/contexts/SettingsContext'
import {
  MIN_FONT_SCALE,
  MAX_FONT_SCALE,
  MIN_AMBIENT_STRENGTH,
  MAX_AMBIENT_STRENGTH,
} from '../../src/app/contexts/SettingsContext'
import { DataProvider } from '../../src/app/data/DataContext'
import { HostProvider } from '../../src/app/data/HostContext'
import type { DataSource } from '../../src/app/data/DataSource'
import type { HostBridge } from '../../src/app/data/HostBridge'


const mockDataSource: DataSource = {
  addRoot:     vi.fn().mockResolvedValue(null),
  removeRoot:  vi.fn().mockResolvedValue(undefined),
  listRoots:   vi.fn().mockResolvedValue([]),
  getMusicDir: vi.fn().mockResolvedValue(null),
  scan:        vi.fn(),
  load:        vi.fn().mockResolvedValue([]),
  subscribe:   vi.fn().mockReturnValue(() => {}),
  readBytes:   vi.fn().mockResolvedValue(new ArrayBuffer(0)),
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

function Consumer () {
  const s = useSettings()
  return (
    <div>
      <span data-testid='theme'>{s.theme}</span>
      <span data-testid='uiFont'>{s.uiFont}</span>
      <span data-testid='monoFont'>{s.monoFont}</span>
      <span data-testid='accentSource'>{s.accentSource}</span>
      <span data-testid='uiDensity'>{s.uiDensity}</span>
      <span data-testid='cornerStyle'>{s.cornerStyle}</span>
      <span data-testid='fontScale'>{s.fontScale}</span>
      <span data-testid='ambientStrength'>{s.ambientStrength}</span>
    </div>
  )
}

function wrap (ui: React.ReactNode) {
  return (
    <HostProvider value={mockHost}>
      <DataProvider value={mockDataSource}>
        {ui}
      </DataProvider>
    </HostProvider>
  )
}

const localStorageMock = {
  getItem:  vi.fn(),
  setItem:  vi.fn(),
  clear:    vi.fn(),
  removeItem: vi.fn(),
}

describe('loadSettings normalisation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('electronAPI', {
      getMusicLibraryPath: vi.fn().mockResolvedValue(null),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back junk values to defaults and clamps out-of-range numbers', async () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      theme:           'neon',
      uiFont:          'comic',
      monoFont:        42,
      accentSource:    null,
      uiDensity:       'huge',
      cornerStyle:     undefined,
      fontScale:       99,
      ambientStrength: -5,
    }))

    await act(async () => {
      render(wrap(
        <SettingsProvider>
          <Consumer />
        </SettingsProvider>
      ))
      await new Promise(r => setTimeout(r, 20))
    })

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('uiFont')).toHaveTextContent('montserrat')
    expect(screen.getByTestId('monoFont')).toHaveTextContent('geist-mono')
    expect(screen.getByTestId('accentSource')).toHaveTextContent('artwork')
    expect(screen.getByTestId('uiDensity')).toHaveTextContent('comfortable')
    expect(screen.getByTestId('cornerStyle')).toHaveTextContent('sharp')
    expect(screen.getByTestId('fontScale')).toHaveTextContent(String(MAX_FONT_SCALE))
    expect(screen.getByTestId('ambientStrength')).toHaveTextContent(String(MIN_AMBIENT_STRENGTH))
  })
})
