import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Ensure Event constructor is available in jsdom environment
if (typeof Event === 'undefined') {
  globalThis.Event = class Event {
    constructor(type: string) { this.type = type }
    type: string
    target: EventTarget | null = null
    currentTarget: EventTarget | null = null
    bubbles = false
    cancelable = false
    composed = false
    defaultPrevented = false
    eventPhase = 0
    isTrusted = false
    timeStamp = Date.now()
    preventDefault() { this.defaultPrevented = true }
    stopPropagation() {}
    stopImmediatePropagation() {}
    initEvent() {}
  } as unknown as typeof Event
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
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
