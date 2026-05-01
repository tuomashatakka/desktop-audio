import { Bridge } from '../data/Bridge'


const DB_WRITE_DEBOUNCE_MS = 150

export class Model extends EventTarget {
  readonly id: string
  #dirty = false
  #flushTimer: ReturnType<typeof setTimeout> | null = null
  #bridge:     Bridge | null = null

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

  setBridge (bridge: Bridge): void {
    this.#bridge = bridge
  }

  toJSON (): Record<string, unknown> {
    const result: Record<string, unknown> = { id: this.id }
    const allKeys = Object.getOwnPropertyNames(this)
    for (const key of allKeys) {
      if (key.startsWith('_') || key.startsWith('#') || key === 'id')
        continue

      const descriptor = Object.getOwnPropertyDescriptor(this, key)
      if (descriptor && typeof descriptor.get === 'function')
        result[key] = descriptor.get.call(this)
    }
    return result
  }

  flush (): void {
    if (!this.#dirty)
      return
    this.#dirty = false
    if (this.#bridge) {
      const payload = this.toJSON()
      const kind = this.constructor.name.toLowerCase()
      this.#bridge.upsertModel(kind, payload)
    }
    this.dispatchEvent(new Event('flush'))
  }

  // Call this after constructing to enable persistence
  static initModel<T extends Model>(model: T, bridge: Bridge): T {
    model.setBridge(bridge)
    return model
  }

  destroy (): void {
    if (this.#flushTimer)
      clearTimeout(this.#flushTimer)
    this.#dirty = false
    this.#bridge = null
  }
}
