export const mockElectronAPI = {
  scanDirectory:    vi.fn().mockResolvedValue([]),
  scanLibrary:      vi.fn().mockResolvedValue([]),
  getAudioMetadata: vi.fn().mockResolvedValue({}),
  selectDirectory:  vi.fn().mockResolvedValue(null),
  readFile:         vi.fn().mockResolvedValue(new ArrayBuffer(0)),
}

export function setupMockElectronAPI () {
  Object.defineProperty(window, 'electronAPI', {
    value:    mockElectronAPI,
    writable: true,
  })
}

export function resetMockElectronAPI () {
  mockElectronAPI.scanDirectory.mockResolvedValue([])
  mockElectronAPI.scanLibrary.mockResolvedValue([])
  mockElectronAPI.getAudioMetadata.mockResolvedValue({})
  mockElectronAPI.selectDirectory.mockResolvedValue(null)
  mockElectronAPI.readFile.mockResolvedValue(new ArrayBuffer(0))
}
