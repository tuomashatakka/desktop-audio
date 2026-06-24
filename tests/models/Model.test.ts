import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Model } from '../../src/app/models/Model'
import { Track } from '../../src/app/models'

describe('Model base class', () => {
  it('has id property', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'Test'
    expect(model.id).toBeTruthy()
  })

  it('starts not dirty', () => {
    const model = new Track('/music/test.mp3')
    expect(model.dirty).toBe(false)
  })

  it('marks dirty on change', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'New Name'
    expect(model.dirty).toBe(true)
  })

  it('emits dirty event', () => {
    const model = new Track('/music/test.mp3')
    const handler = vi.fn()
    model.addEventListener('dirty', handler)

    model.title = 'New Name'

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('schedules flush after dirty', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'New Name'

    // Flush should be scheduled (we can't easily test the timer, but we can test flush works)
    model.flush()
    expect(model.dirty).toBe(false)
  })

  it('converts to JSON', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'Test'

    const json = model.toJSON()
    expect(json.id).toBeTruthy()
    expect(json).toHaveProperty('title', 'Test')
  })

  it('sets dataSource and flushes', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'Test'
    const mockDataSource = {
      upsertTrack: vi.fn().mockResolvedValue(undefined),
    } as any

    Model.dataSource = mockDataSource
    model.title = 'New Name'
    model.flush()

    expect(mockDataSource.upsertTrack).toHaveBeenCalledWith(expect.any(Object))
  })

  it('cleans up on destroy', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'New Name'

    model.destroy()
    // Can't access private #bridge directly, check dirty is reset
    expect(model.dirty).toBe(false)
  })

  it('toJSON excludes private fields', () => {
    const model = new Track('/music/test.mp3')
    model.title = 'Test'

    const json = model.toJSON()
    // toJSON should only include properties with getters, not private fields
    expect(json).toHaveProperty('id')
    expect(json).toHaveProperty('title')
    // Private fields like _path should not be in JSON
    expect(json).not.toHaveProperty('_path')
    expect(json).not.toHaveProperty('_title')
  })
})
