import { mockElectronAPI, setupMockElectronAPI } from '../mocks/electron'
import type { Track } from '../../src/app/services/types'

const makeMockTrack = (filePath: string, overrides: Partial<Track> = {}): Track => ({
  id:         filePath,
  path:       filePath,
  title:      filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '',
  artist:     'Unknown Artist',
  album:      'Unknown Album',
  duration:   0,
  format:     filePath.split('.').pop()?.toUpperCase() ?? '',
  size:       0,
  coverColor: 'hsl(300, 65%, 38%)',
  ...overrides,
})

describe('electronAPI bridge', () => {
  beforeEach(() => {
    setupMockElectronAPI()
  })

  describe('loadLibrary', () => {
    it('returns empty array when no electron API', async () => {
      Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true })
      const result = await (window.electronAPI as typeof mockElectronAPI | undefined)?.loadLibrary() ?? []
      expect(result).toHaveLength(0)
    })

    it('returns tracks from DB', async () => {
      mockElectronAPI.loadLibrary.mockResolvedValue([
        makeMockTrack('/music/track1.mp3', { title: 'track1', format: 'MP3' }),
        makeMockTrack('/music/track2.flac', { title: 'track2', format: 'FLAC' }),
      ])

      const tracks = await window.electronAPI!.loadLibrary()

      expect(tracks).toHaveLength(2)
      expect((tracks as Track[])[0]?.title).toBe('track1')
      expect((tracks as Track[])[1]?.format).toBe('FLAC')
    })

    it('returns default metadata values when tags are absent', async () => {
      mockElectronAPI.loadLibrary.mockResolvedValue([
        makeMockTrack('/music/song.mp3'),
      ])

      const tracks = await window.electronAPI!.loadLibrary() as Track[]

      expect(tracks[0]?.artist).toBe('Unknown Artist')
      expect(tracks[0]?.album).toBe('Unknown Album')
      expect(tracks[0]?.duration).toBe(0)
      expect(tracks[0]?.path).toBe('/music/song.mp3')
    })

    it('handles errors gracefully', async () => {
      mockElectronAPI.loadLibrary.mockRejectedValue(new Error('DB load failed'))

      await expect(window.electronAPI!.loadLibrary()).rejects.toThrow('DB load failed')
    })
  })

  describe('selectDirectory', () => {
    it('returns null when no electron API', async () => {
      Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true })
      const result = await (window.electronAPI as typeof mockElectronAPI | undefined)?.selectDirectory() ?? null
      expect(result).toBeNull()
    })

    it('returns selected directory path', async () => {
      mockElectronAPI.selectDirectory.mockResolvedValue('/selected/path')

      const result = await window.electronAPI!.selectDirectory()

      expect(result).toBe('/selected/path')
    })

    it('handles rejection gracefully', async () => {
      mockElectronAPI.selectDirectory.mockRejectedValue(new Error('Select failed'))

      await expect(window.electronAPI!.selectDirectory()).rejects.toThrow('Select failed')
    })
  })

  describe('onLibraryBatch / onLibraryDone', () => {
    it('onLibraryBatch returns an unsubscribe function', () => {
      const unsub = window.electronAPI!.onLibraryBatch(() => {})
      expect(typeof unsub).toBe('function')
    })

    it('onLibraryDone returns an unsubscribe function', () => {
      const unsub = window.electronAPI!.onLibraryDone(() => {})
      expect(typeof unsub).toBe('function')
    })
  })
})
