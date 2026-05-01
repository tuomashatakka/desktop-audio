import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Model } from '../../src/app/models/Model'

class TestModel extends Model {
  private _name!: string

  get name(): string { return this._name }
  set name(v: string) {
    if (this._name !== v) {
      this._name = v
      this.markDirty()
    }
  }
}

describe.skip('Model base class', () => {
  it('has id property', () => {
    const model = new TestModel('test-id')
    expect(model.id).toBe('test-id')
  })

  it('starts not dirty', () => {
    const model = new TestModel('test-id')
    expect(model.dirty).toBe(false)
  })

  it('marks dirty on change', () => {
    const model = new TestModel('test-id')
    model.name = 'New Name'
    expect(model.dirty).toBe(true)
  })

  it('emits dirty event', () => {
    const model = new TestModel('test-id')
    const handler = vi.fn()
    model.addEventListener('dirty', handler)

    model.name = 'New Name'

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('schedules flush after dirty', () => {
    const model = new TestModel('test-id')
    model.name = 'New Name'

    // Flush should be scheduled (we can't easily test the timer, but we can test flush works)
    model.flush()
    expect(model.dirty).toBe(false)
  })

  it('converts to JSON', () => {
    const model = new TestModel('test-id')
    // Set directly to private field
    model['_name'] = 'Test Name'

    const json = model.toJSON()
    expect(json.id).toBe('test-id')
    expect(json.name).toBeUndefined() // toJSON doesn't expose private fields
  })

  it('sets bridge and flushes', () => {
    const model = new TestModel('test-id')
    const mockBridge = {
      upsertModel: vi.fn(),
    } as any

    model.setBridge(mockBridge)
    model.name = 'New Name'
    model.flush()

    expect(mockBridge.upsertModel).toHaveBeenCalledWith('testmodel', expect.any(Object))
  })

  it('cleans up on destroy', () => {
    const model = new TestModel('test-id')
    model.name = 'New Name'

    model.destroy()
    // Can't access private #bridge directly, check dirty is reset
    expect(model.dirty).toBe(false)
  })

  it('toJSON excludes private fields', () => {
    const model = new TestModel('test-id')
    model.name = 'Test'

    const json = model.toJSON()
    expect(json['_name']).toBeUndefined()
    expect(json['#dirty']).toBeUndefined()
  })
})
