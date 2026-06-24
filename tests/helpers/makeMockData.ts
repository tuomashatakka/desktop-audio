import type { DataSource, DataEvent, TrackDTO, LibraryRoot, AudioMetadata } from '../../src/app/data/DataSource'

export function makeMockDataSource(overrides: Partial<DataSource> = {}): DataSource {
  const listeners: DataListener[] = []
  const mockTracks: TrackDTO[] = []
  
  const mockDataSource: DataSource = {
    addRoot: vi.fn().mockResolvedValue('mock-root-id'),
    removeRoot: vi.fn().mockResolvedValue(undefined),
    listRoots: vi.fn().mockResolvedValue([
      { id: 'mock-root-1', label: 'Mock Music' }
    ] as LibraryRoot[]),
    scan: vi.fn().mockImplementation((rootIds: readonly string[]) => {
      // Simulate async scan by emitting batch and done events
      setTimeout(() => {
        const event: DataEvent = { type: 'batch', tracks: mockTracks }
        listeners.forEach(l => l(event))
        setTimeout(() => {
          const doneEvent: DataEvent = { type: 'done', totalCount: mockTracks.length }
          listeners.forEach(l => l(doneEvent))
        }, 10)
      }, 0)
    }),
    load: vi.fn().mockResolvedValue(mockTracks),
    subscribe: vi.fn().mockImplementation((l: DataListener) => {
      listeners.push(l)
      return () => {
        const index = listeners.indexOf(l)
        if (index > -1) listeners.splice(index, 1)
      }
    }),
    readBytes: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
    readMetadata: vi.fn().mockResolvedValue({
      title: 'Mock Title',
      artist: 'Mock Artist',
      album: 'Mock Album',
      duration: 180,
      format: 'mp3',
      bitrate: 320,
      sampleRate: 44100,
      channels: 2
    } as AudioMetadata),
    upsertTrack: vi.fn().mockImplementation(async (track: TrackDTO) => {
      const index = mockTracks.findIndex(t => t.id === track.id)
      if (index >= 0) {
        mockTracks[index] = track
      } else {
        mockTracks.push(track)
      }
    }),
    deleteTrack: vi.fn().mockImplementation(async (trackId: string) => {
      const index = mockTracks.findIndex(t => t.id === trackId)
      if (index >= 0) {
        mockTracks.splice(index, 1)
      }
    }),
    // Helper methods for tests
    _getListeners: () => listeners,
    _getMockTracks: () => mockTracks,
    _setMockTracks: (tracks: TrackDTO[]) => { mockTracks.length = 0; mockTracks.push(...tracks) },
    _triggerEvent: (event: DataEvent) => listeners.forEach(l => l(event))
  }

  return { ...mockDataSource, ...overrides }
}

export type DataListener = (e: DataEvent) => void
