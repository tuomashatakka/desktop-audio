export class WaveformCache {
  static #instance: WaveformCache | null = null
  readonly #maxEntries = 32
  readonly #cache = new Map<string, Float32Array>()

  private constructor() {}

  static get instance(): WaveformCache {
    if (!WaveformCache.#instance)
      WaveformCache.#instance = new WaveformCache()
    return WaveformCache.#instance
  }

  get(trackId: string): Float32Array | undefined {
    const data = this.#cache.get(trackId)
    if (data) {
      // LRU: move to end
      this.#cache.delete(trackId)
      this.#cache.set(trackId, data)
    }
    return data
  }

  set(trackId: string, waveform: Float32Array): void {
    if (this.#cache.has(trackId)) {
      this.#cache.delete(trackId)
    } else if (this.#cache.size >= this.#maxEntries) {
      // Evict least recently used
      const firstKey = this.#cache.keys().next().value
      if (firstKey)
        this.#cache.delete(firstKey)
    }
    this.#cache.set(trackId, waveform)
  }

  clear(): void {
    this.#cache.clear()
  }

  get size(): number {
    return this.#cache.size
  }
}
