/**
 * Base class for persistent domain models (Track, Album, Artist, FolderEntry).
 *
 * Subclasses set fields via setters, call {@link Model#markDirty}, and the
 * change is debounced and flushed to the shared {@link DataSource}. Includes
 * a tiny event-emitter for observing dirty/flush transitions and a
 * reflection-based {@link Model#toJSON} that walks getters on the prototype
 * chain so persisted payloads stay in sync with declared fields.
 */
import type { DataSource } from '../data/DataSource'


const DB_WRITE_DEBOUNCE_MS = 150

type ModelEventListener = (eventType: string) => void

/** Persistable, observable base class. See module docstring. */
export class Model {
  readonly id:       string
  #dirty = false
  #flushTimer:       ReturnType<typeof setTimeout> | null = null
  static dataSource: DataSource | null = null
  #listeners = new Set<ModelEventListener>()

  constructor (id: string) {
    this.id = id
  }

  static [Symbol.hasInstance] (instance: unknown): boolean {
    return typeof instance === 'object' && instance !== null && 'id' in (instance as object)
  }

  get dirty (): boolean {
    return this.#dirty
  }

  addEventListener (_type: string, cb: ModelEventListener): void {
    this.#listeners.add(cb)
  }

  removeEventListener (_type: string, cb: ModelEventListener): void {
    this.#listeners.delete(cb)
  }

  // Protected: dispatch event to all listeners
  dispatchEvent (type: string): void {
    for (const listener of this.#listeners) {
      try {
        listener(type)
      }
      catch {}
    }
  }

  markDirty (): void {
    if (!this.#dirty) {
      this.#dirty = true
      this.dispatchEvent('dirty')
    }
    this.#scheduleFlush()
  }

  #scheduleFlush (): void {
    if (this.#flushTimer)
      clearTimeout(this.#flushTimer)
    this.#flushTimer = setTimeout(() =>
      this.flush(), DB_WRITE_DEBOUNCE_MS)
  }

  /** Getter names declared anywhere on `proto`'s chain, up to `Object.prototype`. */
  #collectPrototypeGetterKeys (proto: object | null): string[] {
    if (!proto || proto === Object.prototype)
      return []

    const keys = Object.getOwnPropertyNames(proto).filter(key =>
      key !== 'constructor' && typeof Object.getOwnPropertyDescriptor(proto, key)?.get === 'function')

    return [ ...keys, ...this.#collectPrototypeGetterKeys(Object.getPrototypeOf(proto)) ]
  }

  toJSON (): Record<string, unknown> {
    const result: Record<string, unknown> = { id: this.id }

    // Get all property names from the instance
    const instanceKeys = Object.getOwnPropertyNames(this)

    // Also get property names from the prototype chain to find getters
    const protoKeys = this.#collectPrototypeGetterKeys(Object.getPrototypeOf(this))

    const allKeys = [ ...new Set([ ...instanceKeys, ...protoKeys ]) ]

    for (const key of allKeys) {
      if (key.startsWith('_') || key.startsWith('#') || key === 'id')
        continue

      // Try to get the value - check prototype chain
      const descriptor = Object.getOwnPropertyDescriptor(this, key) ||
                        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), key)
      if (descriptor && typeof descriptor.get === 'function') {
        try {
          result[key] = descriptor.get.call(this)
        }
        catch {
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
    this.dispatchEvent('flush')
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
