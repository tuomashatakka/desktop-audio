import type { Bridge } from '../../src/app/data/Bridge'
import type { TrackDTO, SerializableMenuItem, MediaState } from '../../src/app/services/types'

export function makeMockBridge(overrides: Partial<Bridge> = {}): Bridge {
  const batchHandlers: ((t: TrackDTO[]) => void)[] = []
  const doneHandlers: (() => void)[] = []
  const contextMenuHandlers: ((i: number) => void)[] = []
  const mediaPlayPauseHandlers: (() => void)[] = []
  const mediaNextHandlers: (() => void)[] = []
  const mediaPrevHandlers: (() => void)[] = []
  const mediaSeekHandlers: ((delta: number) => void)[] = []
  const tracks: TrackDTO[] = []

  const bridge: Bridge = {
    scanLibrary: vi.fn(),
    loadLibrary: vi.fn().mockResolvedValue(tracks),
    onLibraryBatch: vi.fn((cb: (t: TrackDTO[]) => void) => {
      batchHandlers.push(cb)
      return () => {}
    }),
    onLibraryDone: vi.fn((cb: () => void) => {
      doneHandlers.push(cb)
      return () => {}
    }),
    selectDirectory: vi.fn().mockResolvedValue('/mock/path'),
    getMusicDir: vi.fn().mockResolvedValue('/music'),
    readFile: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    getAudioMetadata: vi.fn().mockResolvedValue({
      title: '', artist: '', album: '', isPlaying: false, position: 0, duration: 0
    } as MediaState),
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
    upsertModel: vi.fn(),
    deleteModel: vi.fn(),
    // Helper to trigger events in tests
    _triggerBatch: (t: TrackDTO[]) => batchHandlers.forEach(cb => cb(t)),
    _triggerDone: () => doneHandlers.forEach(cb => cb()),
    _triggerContextMenu: (i: number) => contextMenuHandlers.forEach(cb => cb(i)),
    _triggerPlayPause: () => mediaPlayPauseHandlers.forEach(cb => cb()),
    _triggerNext: () => mediaNextHandlers.forEach(cb => cb()),
    _triggerPrev: () => mediaPrevHandlers.forEach(cb => cb()),
    _triggerSeek: (delta: number) => mediaSeekHandlers.forEach(cb => cb(delta)),
  }

  return bridge
}
