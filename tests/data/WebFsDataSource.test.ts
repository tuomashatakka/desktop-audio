import { describe, it, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { WebFsDataSource } from '../../src/app/data/WebFsDataSource'
import type { DataEvent, TrackDTO } from '../../src/app/data/DataSource'
import { idbGetAll } from '../../src/app/data/idb'

vi.mock('../../src/app/data/idb', () => ({
  idbGet:    vi.fn(),
  idbSet:    vi.fn(),
  idbDelete: vi.fn(),
  idbGetAll: vi.fn(),
}))

// Mock IndexedDB
function createMockIndexedDB() {
  const stores: Map<string, Map<string, any>> = new Map()
  
  const mockDB = {
    objectStoreNames: {
      contains: vi.fn((name: string) => stores.has(name))
    },
    createObjectStore: vi.fn((name: string) => {
      stores.set(name, new Map())
      return {
        put: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn(),
        delete: vi.fn()
      }
    }),
    transaction: vi.fn((storeName: string, mode: string) => {
      const store = stores.get(storeName)
      return {
        objectStore: vi.fn(() => ({
          put: vi.fn((data: any) => ({
            onsuccess: null,
            onerror: null
          })),
          get: vi.fn((key: string) => ({
            result: store?.get(key),
            onsuccess: null,
            onerror: null
          })),
          getAll: vi.fn(() => ({
            result: Array.from(store?.values() || []),
            onsuccess: null,
            onerror: null
          })),
          delete: vi.fn((key: string) => ({
            onsuccess: null,
            onerror: null
          }))
        })),
        oncomplete: null,
        onerror: null
      }
    })
  }
  
  return {
    open: vi.fn((name: string, version: number) => {
      const request: any = {
        result: mockDB,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null
      }
      // Simulate async
      setTimeout(() => {
        if (request.onsuccess) request.onsuccess()
      }, 0)
      return request
    }),
    deleteDatabase: vi.fn()
  }
}

// Mock File System Access API
function createMockFileHandle(name: string, content: string = 'mock audio content') {
  const mockFile = new File([content], name, { type: 'audio/mpeg' })  
  return {
    kind: 'file' as const,
    name,
    getFile: vi.fn().mockResolvedValue(mockFile)
  }
}

describe('WebFsDataSource', () => {
  // WebFsDataSource requires browser APIs (IndexedDB, File System Access API)
  // that are complex to mock properly. Most tests are skipped.
  
  it('has required DataSource methods', () => {
    const ds = new WebFsDataSource()
    expect(typeof ds.addRoot).toBe('function')
    expect(typeof ds.scan).toBe('function')
    expect(typeof ds.load).toBe('function')
    expect(typeof ds.subscribe).toBe('function')
    expect(typeof ds.readBytes).toBe('function')
    expect(typeof ds.readMetadata).toBe('function')
    expect(typeof ds.upsertTrack).toBe('function')
    expect(typeof ds.deleteTrack).toBe('function')
  })

  it('subscribe returns a disposable subscription', () => {
    const ds = new WebFsDataSource()
    const listener = vi.fn()
    const subscription = ds.subscribe(listener)

    expect(typeof subscription.dispose).toBe('function')
    subscription.dispose()
    // Disposal is idempotent by contract
    expect(() => subscription.dispose()).not.toThrow()
  })

  it.skip('addRoot returns null when user cancels picker', async () => {
    // This test requires proper File System Access API mocking
  })
  
  it('yields between streamed hydrate batches', async () => {
    const tracks = Array.from({ length: 401 }, (_, index): TrackDTO =>
      ({
        id:         `track-${index}`,
        title:      `Track ${index}`,
        artist:     'Artist',
        album:      'Album',
        duration:   180,
        format:     'mp3',
        size:       1024,
        coverColor: '#123456',
        path:       `/music/track-${index}.mp3`,
      }))
    vi.mocked(idbGetAll).mockResolvedValue(tracks.map((value, index) =>
      ({ key: String(index), value })))

    const events: DataEvent[] = []
    const ds                  = new WebFsDataSource()
    ds.subscribe(event =>
      events.push(event))

    ds.load()
    await Promise.resolve()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'hydrate-batch', tracks: expect.arrayContaining([ tracks[0] ]) })

    await waitFor(() =>
      expect(events.at(-1)).toEqual({ type: 'hydrate-done', totalCount: tracks.length }))

    expect(events.filter(event =>
      event.type === 'hydrate-batch')).toHaveLength(3)
  })

  it.skip('listRoots returns an array', async () => {
    // This test requires proper IndexedDB mocking
  })

  it.skip('removeRoot does not throw', async () => {
    // This test requires proper IndexedDB mocking
  })

  it.skip('deleteTrack does not throw', async () => {
    // This test requires proper IndexedDB mocking
  })

  it.skip('readBytes throws for invalid track', async () => {
    // This test requires proper IndexedDB and File System Access API mocking
  })

  it.skip('readMetadata throws for invalid track', async () => {
    // This test requires proper IndexedDB and File System Access API mocking
  })
})
