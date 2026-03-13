import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

global.AudioContext = vi.fn().mockImplementation(() => ({
  createAnalyser: vi.fn().mockReturnValue({
    fftSize: 256,
    frequencyBinCount: 128,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
  }),
  createMediaElementSource: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  destination: {},
  close: vi.fn().mockResolvedValue(undefined),
})) as unknown as typeof AudioContext

global.AnalyserNode = vi.fn().mockImplementation(() => ({
  fftSize: 256,
  frequencyBinCount: 128,
  connect: vi.fn(),
  disconnect: vi.fn(),
  getByteFrequencyData: vi.fn(),
})) as unknown as typeof AnalyserNode

global.HTMLMediaElement = vi.fn().mockImplementation(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  currentTime: 0,
  duration: 0,
  paused: false,
  volume: 1,
  src: '',
  crossOrigin: '',
})) as unknown as typeof HTMLMediaElement
