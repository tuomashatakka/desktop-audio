import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserBridge } from '../../src/app/data/BrowserBridge'

describe('BrowserBridge', () => {
  let bridge: BrowserBridge

  beforeEach(() => {
    // Mock window.showDirectoryPicker
    ;(globalThis as any).window = {
      showDirectoryPicker: vi.fn().mockResolvedValue({}),
    }
    bridge = new BrowserBridge()
  })

  it('implements Bridge interface', () => {
    expect(typeof bridge.scanLibrary).toBe('function')
    expect(typeof bridge.loadLibrary).toBe('function')
    expect(typeof bridge.onLibraryBatch).toBe('function')
    expect(typeof bridge.onLibraryDone).toBe('function')
  })

  it('scanLibrary is no-op in browser', () => {
    // Should not throw
    expect(() => bridge.scanLibrary(['/path'])).not.toThrow()
  })

  it('loadLibrary returns empty array initially', async () => {
    const tracks = await bridge.loadLibrary()
    expect(tracks).toEqual([])
  })

  it('selectDirectory returns null or path', async () => {
    const result = await bridge.selectDirectory()
    // In test env without showDirectoryPicker, returns null or mock path
    expect(result === null || typeof result === 'string').toBe(true)
  })

  it('upsertModel logs to console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    bridge.upsertModel('track', { id: '1' })
    expect(spy).toHaveBeenCalledWith('BrowserBridge: upsertModel called')
    spy.mockRestore()
  })

  it('deleteModel logs to console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    bridge.deleteModel('track', '1')
    expect(spy).toHaveBeenCalledWith('BrowserBridge: deleteModel called')
    spy.mockRestore()
  })

  it('window control methods are no-ops', () => {
    expect(() => bridge.minimizeWindow()).not.toThrow()
    expect(() => bridge.maximizeWindow()).not.toThrow()
    expect(() => bridge.closeWindow()).not.toThrow()
  })
})
