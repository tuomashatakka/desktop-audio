import { describe, it, expect, beforeEach } from 'vitest'
import { WaveformCache } from '../../src/app/models/WaveformCache'

describe('WaveformCache', () => {
  let cache: WaveformCache

  beforeEach(() => {
    cache = WaveformCache.instance
    cache.clear()
  })

  it('is a singleton', () => {
    const a = WaveformCache.instance
    const b = WaveformCache.instance
    expect(a).toBe(b)
  })

  it('has max 32 entries', () => {
    // Fill cache to max (32)
    for (let i = 0; i < 32; i++) {
      cache.set(`track-${i}`, new Float32Array([i]))
    }
    expect(cache.size).toBe(32)
  })

  it('stores and retrieves waveforms', () => {
    const waveform = new Float32Array([0.1, 0.2, 0.3])
    cache.set('track-1', waveform)

    const retrieved = cache.get('track-1')
    expect(retrieved).toBe(waveform)
  })

  it('returns undefined for missing track', () => {
    expect(cache.get('non-existent')).toBeUndefined()
  })

  it('evicts least recently used when at capacity', () => {
    // Fill cache to max (32)
    for (let i = 0; i < 32; i++) {
      cache.set(`track-${i}`, new Float32Array([i]))
    }
    expect(cache.size).toBe(32)

    // Add one more - should evict track-0
    cache.set('track-32', new Float32Array([32]))

    expect(cache.size).toBe(32)
    expect(cache.get('track-0')).toBeUndefined()
    expect(cache.get('track-32')).toBeDefined()
  })

  it('updates LRU order on get', () => {
    // Fill cache to capacity
    for (let i = 0; i < 32; i++) {
      cache.set(`track-${i}`, new Float32Array([i]))
    }
    expect(cache.size).toBe(32)

    // Access track-0 to make it most recently used
    cache.get('track-0')

    // Add one more - should evict track-1 (now least recently used)
    cache.set('track-32', new Float32Array([32]))

    expect(cache.size).toBe(32)
    expect(cache.get('track-0')).toBeDefined() // Most recently used, should still be there
    expect(cache.get('track-1')).toBeUndefined() // Evicted
    expect(cache.get('track-32')).toBeDefined()
  })

  it('clears all entries', () => {
    cache.set('track-1', new Float32Array([1]))
    cache.set('track-2', new Float32Array([2]))
    expect(cache.size).toBe(2)

    cache.clear()
    expect(cache.size).toBe(0)
  })
})
