import { describe, it, expect, vi } from 'vitest'
import { Model } from '../../src/app/models/Model'

// Test with manual property setters (matching Track/FolderEntry implementation)
class TestModel extends Model {
  private _value!: string
  private _count!: number

  get value(): string { return this._value }
  set value(v: string) {
    if (this._value !== v) {
      this._value = v
      this.markDirty()
    }
  }

  get count(): number { return this._count }
  set count(v: number) {
    if (this._count !== v) {
      this._count = v
      this.markDirty()
    }
  }
}

describe('Model dirty tracking', () => {
  it('marks model dirty when property changes', () => {
    const model = new TestModel('test-id')
    model['_value'] = 'initial'

    const dirtyHandler = vi.fn()
    model.addEventListener('dirty', dirtyHandler)

    model.value = 'changed'

    expect(dirtyHandler).toHaveBeenCalledTimes(1)
    expect(model.dirty).toBe(true)
  })

  it('does not mark dirty when value stays the same', () => {
    const model = new TestModel('test-id')
    model.value = 'same'

    const dirtyHandler = vi.fn()
    model.addEventListener('dirty', dirtyHandler)

    // Setting to same value should not trigger dirty
    model.value = 'same'

    expect(dirtyHandler).not.toHaveBeenCalled()
    expect(model.dirty).toBe(true) // Still true from first set
  })

  it('getter returns current value', () => {
    const model = new TestModel('test-id')
    model.value = 'hello'
    model.count = 42

    expect(model.value).toBe('hello')
    expect(model.count).toBe(42)
  })

  it('supports numeric values', () => {
    const model = new TestModel('test-id')
    model['_count'] = 0

    const dirtyHandler = vi.fn()
    model.addEventListener('dirty', dirtyHandler)

    model.count = 100

    expect(dirtyHandler).toHaveBeenCalledTimes(1)
    expect(model.count).toBe(100)
  })

  it('flush resets dirty state', () => {
    const model = new TestModel('test-id')
    model.value = 'changed'

    expect(model.dirty).toBe(true)

    model.flush()

    expect(model.dirty).toBe(false)
  })

  it('does not trigger dirty event when value unchanged', () => {
    const model = new TestModel('test-id')
    model.value = 'test'

    const dirtyHandler = vi.fn()
    model.addEventListener('dirty', dirtyHandler)

    // Setting to same value should not trigger event
    model.value = 'test'
    model.value = 'test'
    model.value = 'test'

    expect(dirtyHandler).not.toHaveBeenCalled()
  })
})
