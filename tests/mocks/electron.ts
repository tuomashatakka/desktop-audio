import { vi } from 'vitest'

export const mockElectronAPI = {
  // Library
  scanLibrary:     vi.fn(),
  loadLibrary:     vi.fn().mockResolvedValue([]),
  onLibraryBatch:  vi.fn().mockReturnValue(() => {}),
  onLibraryDone:   vi.fn().mockReturnValue(() => {}),
  // Files
  selectDirectory: vi.fn().mockResolvedValue(null),
  getMusicDir:     vi.fn().mockResolvedValue(null),
  readFile:        vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  getAudioMetadata: vi.fn().mockResolvedValue({}),
  // Window
  minimizeWindow:  vi.fn(),
  maximizeWindow:  vi.fn(),
  closeWindow:     vi.fn(),
  isMaximized:     vi.fn().mockResolvedValue(false),
}

export function setupMockElectronAPI () {
  Object.defineProperty(window, 'electronAPI', {
    value:    mockElectronAPI,
    writable: true,
  })
}

export function resetMockElectronAPI () {
  mockElectronAPI.scanLibrary.mockReset()
  mockElectronAPI.loadLibrary.mockResolvedValue([])
  mockElectronAPI.onLibraryBatch.mockReturnValue(() => {})
  mockElectronAPI.onLibraryDone.mockReturnValue(() => {})
  mockElectronAPI.selectDirectory.mockResolvedValue(null)
  mockElectronAPI.getMusicDir.mockResolvedValue(null)
  mockElectronAPI.readFile.mockResolvedValue(new ArrayBuffer(0))
  mockElectronAPI.getAudioMetadata.mockResolvedValue({})
  mockElectronAPI.isMaximized.mockResolvedValue(false)
}
