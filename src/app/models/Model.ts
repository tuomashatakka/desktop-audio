import type { DataSource } from '../data/DataSource'

const DB_WRITE_DEBOUNCE_MS = 150

export class Model extends EventTarget {
  readonly id: string
  #dirty = false
  #flushTimer: ReturnType<typeof setTimeout> | null = null
  static dataSource: DataSource | null = null

  constructor (id: string) {
    super()
    this.id = id
  }

  static [Symbol.hasInstance] (instance: unknown): boolean {
    return typeof instance === 'object' && instance !== null && 'id' in instance!
  }

  get dirty (): boolean {
    return this.#dirty
  }

  markDirty (): void {
    if (!this.#dirty) {
      this.#dirty = true
      this.dispatchEvent(new Event('dirty'))
    }
    this.#scheduleFlush()
  }

  #scheduleFlush (): void {
    if (this.#flushTimer)
      clearTimeout(this.#flushTimer)
    this.#flushTimer = setTimeout(() =>
      this.flush(), DB_WRITE_DEBOUNCE_MS)
  }

  toJSON (): Record<string, unknown> {
    const result: Record<string, unknown> = { id: this.id }

    // Get all property names from the instance
    const instanceKeys = Object.getOwnPropertyNames(this)

    // Also get property names from the prototype chain to find getters
    let proto = Object.getPrototypeOf(this)
    const protoKeys: string[] = []
    while (proto && proto !== Object.prototype) {
      const keys = Object.getOwnPropertyNames(proto)
      for (const key of keys) {
        // Skip constructor and other non-property methods
        if (key === 'constructor') continue

        const descriptor = Object.getOwnPropertyDescriptor(proto, key)
        // Only include properties with getters (not methods)
        if (descriptor && typeof descriptor.get === 'function') {
          protoKeys.push(key)
        }
      }
      proto = Object.getPrototypeOf(proto)
    }

    const allKeys = [...new Set([...instanceKeys, ...protoKeys])]

    for (const key of allKeys) {
      if (key.startsWith('_') || key.startsWith('#') || key === 'id')
        continue

      // Try to get the value - check prototype chain
      const descriptor = Object.getOwnPropertyDescriptor(this, key) ||
                        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), key)
      if (descriptor && typeof descriptor.get === 'function') {
        try {
          result[key] = descriptor.get.call(this)
        } catch {
          // Skip properties that throw when accessed
        }
      }
    }
    return result
  }

  flush (): void {
    if (!this.#dirty)
      return
    this.#dirty = false
    if (Model.dataSource) {
      const payload = this.toJSON()
      const kind = this.constructor.name.toLowerCase()
      // Use upsertTrack for tracks
      if (kind === 'track') {
        Model.dataSource.upsertTrack(payload as never).catch(console.error)
      }
    }
    this.dispatchEvent(new Event('flush'))
  }

  // Call this after constructing to enable persistence (kept for backward compatibility)
  static initModel<T extends Model>(model: T, _dataSource?: DataSource): T {
    // dataSource is now set globally via DataProvider
    return model
  }

  destroy (): void {
    if (this.#flushTimer)
      clearTimeout(this.#flushTimer)
    this.#dirty = false
  }
}
