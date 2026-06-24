import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserHost } from '../../src/app/data/BrowserHost'

describe('BrowserHost', () => {
  let host: BrowserHost

  beforeEach(() => {
    // Mock window.showDirectoryPicker for BrowserHost
    ;(globalThis as any).window = {
      showDirectoryPicker: vi.fn().mockResolvedValue({
        name: 'test-folder',
        kind: 'directory'
      }),
    }
    host = new BrowserHost()
  })

  it('implements HostBridge interface - window controls', () => {
    expect(typeof host.minimizeWindow).toBe('function')
    expect(typeof host.maximizeWindow).toBe('function')
    expect(typeof host.closeWindow).toBe('function')
    expect(typeof host.isMaximized).toBe('function')
  })

  it('implements HostBridge interface - media keys', () => {
    expect(typeof host.onMediaPlayPause).toBe('function')
    expect(typeof host.onMediaNext).toBe('function')
    expect(typeof host.onMediaPrev).toBe('function')
  })

  it('implements HostBridge interface - context menu', () => {
    expect(typeof host.showContextMenu).toBe('function')
    expect(typeof host.hideContextMenu).toBe('function')
    expect(typeof host.onContextMenuAction).toBe('function')
  })

  it('window control methods are no-ops', () => {
    expect(() => host.minimizeWindow()).not.toThrow()
    expect(() => host.maximizeWindow()).not.toThrow()
    expect(() => host.closeWindow()).not.toThrow()
  })

  it('media state methods are no-ops', () => {
    expect(() => host.updateMediaState({ title: '', artist: '', album: '', isPlaying: false, position: 0, duration: 0 })).not.toThrow()
    expect(typeof host.onMediaSeek(() => {})).toBe('function')
  })

  it('selectDirectory calls showDirectoryPicker', async () => {
    const result = await host.selectDirectory()
    expect(window.showDirectoryPicker).toHaveBeenCalled()
    expect(result).toBeTruthy()
  })

  it('selectDirectory returns null when user cancels', async () => {
    const abortError = new DOMException('User cancelled', 'AbortError')
    ;(window as any).showDirectoryPicker.mockRejectedValue(abortError)

    const result = await host.selectDirectory()
    expect(result).toBeNull()
  })

  it('getMusicDir returns null in browser', async () => {
    const result = await host.getMusicDir()
    expect(result).toBeNull()
  })
})
