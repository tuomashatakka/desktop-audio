import type { HostBridge } from '../../src/app/data/HostBridge'
import type { SerializableMenuItem, MediaState } from '../../src/app/services/types'

export function makeMockHost(overrides: Partial<HostBridge> = {}): HostBridge {
  const contextMenuHandlers: ((i: number) => void)[] = []
  const mediaPlayPauseHandlers: (() => void)[] = []
  const mediaNextHandlers: (() => void)[] = []
  const mediaPrevHandlers: (() => void)[] = []
  const mediaSeekHandlers: ((delta: number) => void)[] = []

  const host: HostBridge = {
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
    onMediaPlayPause: vi.fn((cb: () => void) => {
      mediaPlayPauseHandlers.push(cb)
      return () => {}
    }),
    onMediaNext: vi.fn((cb: () => void) => {
      mediaNextHandlers.push(cb)
      return () => {}
    }),
    onMediaPrev: vi.fn((cb: () => void) => {
      mediaPrevHandlers.push(cb)
      return () => {}
    }),
    showContextMenu: vi.fn(),
    hideContextMenu: vi.fn(),
    onContextMenuAction: vi.fn((cb: (i: number) => void) => {
      contextMenuHandlers.push(cb)
      return () => {}
    }),
    updateMediaState: vi.fn(),
    onMediaSeek: vi.fn((cb: (delta: number) => void) => {
      mediaSeekHandlers.push(cb)
      return () => {}
    }),
    // Helper to trigger events in tests
    _triggerContextMenu: (i: number) => contextMenuHandlers.forEach(cb => cb(i)),
    _triggerPlayPause: () => mediaPlayPauseHandlers.forEach(cb => cb()),
    _triggerNext: () => mediaNextHandlers.forEach(cb => cb()),
    _triggerPrev: () => mediaPrevHandlers.forEach(cb => cb()),
    _triggerSeek: (delta: number) => mediaSeekHandlers.forEach(cb => cb(delta)),
  }

  return { ...host, ...overrides }
}
