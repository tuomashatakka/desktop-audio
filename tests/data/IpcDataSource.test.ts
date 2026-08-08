import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IpcDataSource } from '../../src/app/data/IpcDataSource'
import type { TrackDTO } from '../../src/app/data/DataSource'
import type { DataEvent } from '../../src/app/data/DataSource'

describe('IpcDataSource', () => {
  let ds: IpcDataSource
  let mockElectronAPI: any
  let batchListeners: Function[]
  let doneListeners: Function[]
  let hydrateBatchListeners: Function[]
  let hydrateDoneListeners: Function[]

  beforeEach(() => {
    batchListeners = []
    doneListeners = []
    hydrateBatchListeners = []
    hydrateDoneListeners = []
    
    mockElectronAPI = {
      selectDirectory: vi.fn().mockResolvedValue('/test/music'),
      scanLibrary: vi.fn(),
      loadLibrary: vi.fn(),
      readFile: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
      getAudioMetadata: vi.fn().mockResolvedValue({
        title: 'Test Song',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        format: 'mp3',
        bitrate: 320,
        sampleRate: 44100,
        channels: 2
      }),
      upsertModel: vi.fn(),
      deleteModel: vi.fn(),
      onLibraryBatch: vi.fn((callback: Function) => {
        batchListeners.push(callback)
        return () => {
          batchListeners = batchListeners.filter(cb => cb !== callback)
        }
      }),
      onLibraryDone: vi.fn((callback: Function) => {
        doneListeners.push(callback)
        return () => {
          doneListeners = doneListeners.filter(cb => cb !== callback)
        }
      }),
      onLibraryHydrateBatch: vi.fn((callback: Function) => {
        hydrateBatchListeners.push(callback)
        return () => {
          hydrateBatchListeners = hydrateBatchListeners.filter(cb => cb !== callback)
        }
      }),
      onLibraryHydrateDone: vi.fn((callback: Function) => {
        hydrateDoneListeners.push(callback)
        return () => {
          hydrateDoneListeners = hydrateDoneListeners.filter(cb => cb !== callback)
        }
      })
    }
    
    ;(globalThis as any).window = {
      electronAPI: mockElectronAPI
    }
    
    ds = new IpcDataSource()
  })
  
  afterEach(() => {
    vi.clearAllMocks()
    batchListeners = []
    doneListeners = []
    hydrateBatchListeners = []
    hydrateDoneListeners = []
  })
  
  it('addRoot calls selectDirectory', async () => {
    const result = await ds.addRoot()
    
    expect(mockElectronAPI.selectDirectory).toHaveBeenCalledTimes(1)
    expect(result).toBe('/test/music')
  })
  
  it('addRoot returns null when selectDirectory returns null', async () => {
    mockElectronAPI.selectDirectory.mockResolvedValue(null)
    
    const result = await ds.addRoot()
    
    expect(result).toBeNull()
  })
  
  it('scan calls scanLibrary with rootIds', async () => {
    const rootIds = ['root-1', 'root-2']
    
    ds.scan(rootIds)
    
    expect(mockElectronAPI.scanLibrary).toHaveBeenCalledWith(rootIds)
  })
  
  it('load asks the main process to stream the library', () => {
    ds.load()

    expect(mockElectronAPI.loadLibrary).toHaveBeenCalledTimes(1)
  })

  // Regression: tracks restored from SQLite arrive as hydrate batches, not as
  // scan batches. Hydration used to skip indexing, so on every app restart the
  // library rendered fine but playback threw "No path found for trackId".
  it('indexes track paths from hydrate batches so playback works without a rescan', async () => {
    const mockTracks: TrackDTO[] = [
      {
        id: '/music/song1.mp3',
        path: '/music/song1.mp3',
        title: 'Song 1',
        artist: 'Artist 1',
        album: 'Album 1',
        duration: 180,
        format: 'mp3',
        size: 1024,
        coverColor: '#ff0000'
      }
    ]

    ds.subscribe(() => {})
    ds.load()
    hydrateBatchListeners.forEach(callback => callback(mockTracks))

    // No scan batch at all — exactly the cold-start path
    await ds.readBytes('/music/song1.mp3')
    expect(mockElectronAPI.readFile).toHaveBeenCalledWith('/music/song1.mp3')

    await ds.readMetadata('/music/song1.mp3')
    expect(mockElectronAPI.getAudioMetadata).toHaveBeenCalledWith('/music/song1.mp3')
  })

  it('relays hydrate batches and the hydrate done event', () => {
    const events: DataEvent[] = []
    ds.subscribe((e) => events.push(e))

    const mockBatch = [
      { id: 'track-1', path: '/music/song1.mp3', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180, format: 'mp3', size: 1024, coverColor: '#ff0000' }
    ]

    hydrateBatchListeners.forEach(callback => callback(mockBatch))
    hydrateDoneListeners.forEach(callback => callback())

    expect(events.map(e => e.type)).toEqual([ 'hydrate-batch', 'hydrate-done' ])
    expect(events[0].tracks).toEqual(mockBatch)
  })

  it('subscribe receives batch events', async () => {
    const events: DataEvent[] = []
    const subscription = ds.subscribe((e) => events.push(e))

    expect(typeof subscription.dispose).toBe('function')
    
    // Simulate batch event from IPC
    const mockBatch = [
      { id: 'track-1', path: '/music/song1.mp3', title: 'Song 1', artist: 'Artist 1', album: 'Album 1', duration: 180, format: 'mp3', size: 1024, coverColor: '#ff0000' }
    ]
    
    batchListeners.forEach(callback => callback(mockBatch))
    
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('batch')
    expect(events[0].tracks).toEqual(mockBatch)
    
    subscription.dispose()
  })

  it('subscribe receives done event', async () => {
    const events: DataEvent[] = []
    ds.subscribe((e) => events.push(e))
    
    // Simulate done event from IPC
    doneListeners.forEach(callback => callback())
    
    const doneEvent = events.find(e => e.type === 'done')
    expect(doneEvent).toBeTruthy()
    expect(doneEvent.type).toBe('done')
  })
  
  it('readBytes calls readFile with correct path', async () => {
    // First, set up a track with known path
    const trackId = 'track-1'
    const trackPath = '/music/song1.mp3'
    const mockBatch = [{
      id: trackId,
      path: trackPath,
      title: 'Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
      duration: 180,
      format: 'mp3',
      size: 1024,
      coverColor: '#ff0000'
    }]

    // Subscribe to populate trackIdToPath map
    const events: DataEvent[] = []
    ds.subscribe((e) => events.push(e))

    // Simulate receiving the batch to populate trackIdToPath map
    batchListeners.forEach(callback => callback(mockBatch))

    // Verify the batch was received
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('batch')

    const result = await ds.readBytes(trackId)

    expect(mockElectronAPI.readFile).toHaveBeenCalledWith(trackPath)
    expect(result).toBeInstanceOf(ArrayBuffer)
  })
  
  it('readBytes throws error for unknown trackId', async () => {
    await expect(ds.readBytes('nonexistent-track')).rejects.toThrow(
      'No path found for trackId: nonexistent-track'
    )
  })
  
  it('readMetadata calls getAudioMetadata with correct path', async () => {
    // Set up track
    const trackId = 'track-1'
    const trackPath = '/music/song1.mp3'
    const mockBatch = [{
      id: trackId,
      path: trackPath,
      title: 'Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
      duration: 180,
      format: 'mp3',
      size: 1024,
      coverColor: '#ff0000'
    }]

    // Subscribe to populate trackIdToPath map
    const events: DataEvent[] = []
    ds.subscribe((e) => events.push(e))

    // Simulate receiving the batch to populate trackIdToPath map
    batchListeners.forEach(callback => callback(mockBatch))

    // Verify the batch was received
    expect(events.length).toBe(1)

    const metadata = await ds.readMetadata(trackId)

    expect(mockElectronAPI.getAudioMetadata).toHaveBeenCalledWith(trackPath)
    expect(metadata).toBeTruthy()
    expect(metadata.duration).toBe(180)
  })
  
  it('readMetadata throws error for unknown trackId', async () => {
    await expect(ds.readMetadata('nonexistent-track')).rejects.toThrow(
      'No path found for trackId: nonexistent-track'
    )
  })
  
  it('upsertTrack calls upsertModel with track data', async () => {
    const track: TrackDTO = {
      id: 'track-1',
      path: '/music/song1.mp3',
      title: 'Song 1',
      artist: 'Artist 1',
      album: 'Album 1',
      duration: 180,
      format: 'mp3',
      size: 1024,
      coverColor: '#ff0000'
    }
    
    await ds.upsertTrack(track)
    
    expect(mockElectronAPI.upsertModel).toHaveBeenCalledWith('track', expect.objectContaining(track))
  })
  
  it('deleteTrack calls deleteModel with track id', async () => {
    const trackId = 'track-1'
    
    await ds.deleteTrack(trackId)
    
    expect(mockElectronAPI.deleteModel).toHaveBeenCalledWith('track', trackId)
  })
  
  
  it('subscribe returns unsubscribe function that removes listeners', async () => {
    const listener1 = vi.fn()
    const listener2 = vi.fn()
    
    const sub1 = ds.subscribe(listener1)
    const sub2 = ds.subscribe(listener2)
    
    // Simulate events
    batchListeners.forEach(callback => callback([{ id: 'test' }]))
    
    expect(listener1).toHaveBeenCalled()
    expect(listener2).toHaveBeenCalled()
    
    // Unsubscribe first listener
    sub1.dispose()
    
    // Clear mock calls
    ;(listener1 as any).mockClear()
    ;(listener2 as any).mockClear()
    
    // Simulate more events
    batchListeners.forEach(callback => callback([{ id: 'test2' }]))
    
    expect(listener1).not.toHaveBeenCalled()
    expect(listener2).toHaveBeenCalled()
    
    sub2.dispose()
  })
  
  it('handles multiple batch events correctly', async () => {
    const events: DataEvent[] = []
    ds.subscribe((e) => events.push(e))
    
    const batch1 = [{ id: 'track-1', path: '/music/1.mp3', title: 'Song 1', artist: 'A', album: 'B', duration: 180, format: 'mp3', size: 1024, coverColor: '#000' }]
    const batch2 = [{ id: 'track-2', path: '/music/2.mp3', title: 'Song 2', artist: 'C', album: 'D', duration: 200, format: 'mp3', size: 2048, coverColor: '#fff' }]
    
    batchListeners.forEach(callback => callback(batch1))
    batchListeners.forEach(callback => callback(batch2))
    
    const batchEvents = events.filter(e => e.type === 'batch')
    expect(batchEvents.length).toBe(2)
    expect(batchEvents[0].tracks[0].id).toBe('track-1')
    expect(batchEvents[1].tracks[0].id).toBe('track-2')
  })
})
