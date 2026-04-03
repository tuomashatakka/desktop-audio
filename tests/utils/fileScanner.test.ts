import {
  scanDirectory,
  selectDirectory,
} from '../../src/app/services/fileScanner'
import { mockElectronAPI, setupMockElectronAPI } from '../mocks/electron'

const makeMockTrack = (filePath: string, overrides = {}) => ({
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

describe('fileScanner utilities', () => {
  beforeEach(() => {
    setupMockElectronAPI()
  })

  describe('scanDirectory', () => {
    it('returns empty arrays when no electron API', async () => {
      Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true })
      const result = await scanDirectory('/music')
      expect(result.folders).toHaveLength(0)
      expect(result.tracks).toHaveLength(0)
    })

    it('scans directory and returns enriched tracks from scanLibrary', async () => {
      mockElectronAPI.scanLibrary.mockResolvedValue([
        makeMockTrack('/music/track1.mp3', { title: 'track1', format: 'MP3' }),
        makeMockTrack('/music/track2.flac', { title: 'track2', format: 'FLAC' }),
      ])
      mockElectronAPI.scanDirectory.mockResolvedValue([
        '/music/track1.mp3',
        '/music/track2.flac',
      ])

      const result = await scanDirectory('/music')

      expect(result.tracks).toHaveLength(2)
      expect(result.tracks[0]?.title).toBe('track1')
      expect(result.tracks[0]?.format).toBe('MP3')
      expect(result.tracks[1]?.title).toBe('track2')
      expect(result.tracks[1]?.format).toBe('FLAC')
    })

    it('sets default values for track metadata when tags are absent', async () => {
      mockElectronAPI.scanLibrary.mockResolvedValue([
        makeMockTrack('/music/song.mp3'),
      ])
      mockElectronAPI.scanDirectory.mockResolvedValue([ '/music/song.mp3' ])

      const result = await scanDirectory('/music')

      expect(result.tracks[0]?.artist).toBe('Unknown Artist')
      expect(result.tracks[0]?.album).toBe('Unknown Album')
      expect(result.tracks[0]?.duration).toBe(0)
      expect(result.tracks[0]?.id).toBeDefined()
      expect(result.tracks[0]?.path).toBe('/music/song.mp3')
    })

    it('handles errors gracefully', async () => {
      mockElectronAPI.scanLibrary.mockRejectedValue(new Error('Scan failed'))

      const result = await scanDirectory('/music')

      expect(result.folders).toHaveLength(0)
      expect(result.tracks).toHaveLength(0)
    })
  })

  describe('selectDirectory', () => {
    it('returns null when no electron API', async () => {
      Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true })
      const result = await selectDirectory()
      expect(result).toBeNull()
    })

    it('returns selected directory path', async () => {
      mockElectronAPI.selectDirectory.mockResolvedValue('/selected/path')

      const result = await selectDirectory()

      expect(result).toBe('/selected/path')
    })

    it('handles errors gracefully', async () => {
      mockElectronAPI.selectDirectory.mockRejectedValue(new Error('Select failed'))

      const result = await selectDirectory()

      expect(result).toBeNull()
    })
  })
})
