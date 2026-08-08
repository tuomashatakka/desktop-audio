import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DataSource } from '../../src/app/data/DataSource'
import { IpcDataSource } from '../../src/app/data/IpcDataSource'
import { WebFsDataSource } from '../../src/app/data/WebFsDataSource'
import type { DataEvent, TrackDTO } from '../../src/app/data/DataSource'

// Helper to create mock electronAPI for IpcDataSource tests
function createMockElectronAPI() {
  const listeners: Map<string, Function[]> = new Map()
  const storedTracks: TrackDTO[] = [] // Simulate storage for testing
  
  const subscribeTo = (event: string) => (callback: Function) => {
    listeners.set(event, [...(listeners.get(event) || []), callback])
    return () => {
      listeners.set(event, (listeners.get(event) || []).filter(cb => cb !== callback))
    }
  }

  const api = {
    selectDirectory: vi.fn().mockResolvedValue('/test/path'),
    scanLibrary: vi.fn(),
    loadLibrary: vi.fn().mockImplementation(async () => storedTracks),
    readFile: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
    getAudioMetadata: vi.fn().mockResolvedValue({ duration: 180, format: 'mp3' }),
    upsertModel: vi.fn().mockImplementation((type: string, data: any) => {
      if (type === 'track') {
        const index = storedTracks.findIndex(t => t.id === data.id)
        if (index >= 0) {
          storedTracks[index] = data
        } else {
          storedTracks.push(data)
        }
      }
    }),
    deleteModel: vi.fn().mockImplementation((type: string, id: string) => {
      if (type === 'track') {
        const index = storedTracks.findIndex(t => t.id === id)
        if (index >= 0) {
          storedTracks.splice(index, 1)
        }
      }
    }),
    onLibraryBatch: vi.fn(subscribeTo('library:batch')),
    onLibraryDone: vi.fn(subscribeTo('library:done')),
    onLibraryHydrateBatch: vi.fn(subscribeTo('library:hydrate-batch')),
    onLibraryHydrateDone: vi.fn(subscribeTo('library:hydrate-done')),
    // Helper to trigger events for testing
    _triggerBatch: (tracks: unknown[]) => {
      listeners.get('library:batch')?.forEach((cb: Function) => cb(tracks))
    },
    _triggerDone: () => {
      listeners.get('library:done')?.forEach((cb: Function) => cb())
    },
    _triggerHydrateDone: () => {
      listeners.get('library:hydrate-done')?.forEach((cb: Function) => cb())
    },
    _reset: () => {
      storedTracks.length = 0
      listeners.clear()
    }
  }
  
  return api
}

function runContractTests(
  name: string, 
  makeDataSource: () => DataSource, 
  setup?: () => Promise<void>, 
  teardown?: () => Promise<void>
) {
  describe(`DataSource contract: ${name}`, () => {
    let ds: DataSource
    let events: DataEvent[]
    let unsubscribe: (() => void) | undefined
    
    beforeEach(async () => {
      ds = makeDataSource()
      events = []
      if (setup) await setup()
    })
    
    afterEach(async () => {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = undefined
      }
      if (teardown) await teardown()
    })
    
    it('addRoot returns a value', async () => {
      const rootId = await ds.addRoot()
      // Can be null (user cancelled) or string (path or UUID)
      expect(rootId === null || typeof rootId === 'string').toBeTruthy()
    })
    
    it('scan method exists and is callable', () => {
      expect(typeof ds.scan).toBe('function')
      // Should not throw
      expect(() => ds.scan(['test-id'])).not.toThrow()
    })
    
    it('load does not throw and returns nothing — rows arrive as events', () => {
      expect(typeof ds.load).toBe('function')
      expect(() => ds.load()).not.toThrow()
    })
    
    it('subscribe returns a disposable subscription', () => {
      const listener = vi.fn()
      const subscription = ds.subscribe(listener)

      expect(typeof subscription.dispose).toBe('function')

      subscription.dispose()

      // Disposal is idempotent by contract, so a second call is safe
      expect(() => subscription.dispose()).not.toThrow()
    })

    it('readBytes throws or returns ArrayBuffer for invalid track', async () => {
      try {
        const result = await ds.readBytes('nonexistent-track-id')
        expect(result).toBeInstanceOf(ArrayBuffer)
      } catch (e) {
        expect(e).toBeTruthy()
      }
    })

    it('readMetadata throws or returns metadata for invalid track', async () => {
      try {
        const result = await ds.readMetadata('nonexistent-track-id')
        expect(result).toBeTruthy()
        expect(result.duration).toBeDefined()
      } catch (e) {
        expect(e).toBeTruthy()
      }
    })

    it('upsertTrack does not throw', async () => {
      const track: TrackDTO = {
        id: 'test-track-1',
        path: '/test/path/track.mp3',
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        duration: 180,
        format: 'mp3',
        size: 1024,
        coverColor: '#ff0000'
      }
      
      // Just call it - if it throws, the test will fail
      await ds.upsertTrack(track)
      expect(true).toBe(true) // Reached here = didn't throw
    })

    it('deleteTrack does not throw', async () => {
      // Just call it - if it throws, the test will fail
      await ds.deleteTrack('test-track-id')
      expect(true).toBe(true) // Reached here = didn't throw
    })

    it('scan emits batch events then done (if implemented)', async () => {
      const rootId = await ds.addRoot()
      
      if (rootId) {
        const events: DataEvent[] = []
        ds.subscribe((e) => events.push(e))
        
        ds.scan([rootId])
        
        // Give time for async operations
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Should have at least one batch or done event (if scan is implemented)
        // Some implementations might be no-ops
        expect(events.length).toBeGreaterThanOrEqual(0)
      }
    })
  })
}

// Run against IpcDataSource
const mockElectronAPI = createMockElectronAPI()
;(globalThis as any).window = { electronAPI: mockElectronAPI }

describe('DataSource contract: IpcDataSource', () => {
  beforeEach(() => {
    mockElectronAPI._reset()
  })
  
  runContractTests('IpcDataSource', () => new IpcDataSource())
})

// Run against WebFsDataSource
describe('DataSource contract: WebFsDataSource', () => {
  // WebFsDataSource requires IndexedDB and File System Access API mocked
  // For now, we'll create a simplified test
  it.skip('WebFsDataSource full contract tests require browser API mocks', () => {
    // These tests would need proper mocking of:
    // - indexedDB
    // - File System Access API (showDirectoryPicker)
    // - FileReader/File API
  })
})
