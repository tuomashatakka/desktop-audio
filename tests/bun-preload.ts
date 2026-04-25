// Preload #2 — browser API mocks, jest-dom matchers, vitest compat.
// Runs after bun-dom-setup.ts (which provides document/window).
import {
  vi, expect,
  afterEach,
} from 'bun:test'
import { vi as vitestVi } from 'vitest'
import { cleanup } from '@testing-library/react'

// ── Browser API mocks (mirror tests/setup.ts) ─────────────────────────────────
const g = globalThis as Record<string, unknown>

g.AudioContext = vi.fn().mockImplementation(() => ({
  createAnalyser:           vi.fn().mockReturnValue({
    fftSize: 256, frequencyBinCount: 128,
    connect: vi.fn(), disconnect: vi.fn(), getByteFrequencyData: vi.fn(),
  }),
  createMediaElementSource: vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() }),
  destination: {},
  close: vi.fn().mockResolvedValue(undefined),
}))

g.AnalyserNode = vi.fn().mockImplementation(() => ({
  fftSize: 256, frequencyBinCount: 128,
  connect: vi.fn(), disconnect: vi.fn(), getByteFrequencyData: vi.fn(),
}))

g.HTMLMediaElement = vi.fn().mockImplementation(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(), load: vi.fn(),
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
  currentTime: 0, duration: 0, paused: true, volume: 1, src: '', crossOrigin: '',
}))

// Audio() shorthand — jsdom's HTMLAudioElement can't be newed outside its registry
g.Audio = vi.fn().mockImplementation(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(), load: vi.fn(),
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
  currentTime: 0, duration: 0, paused: true, volume: 1, src: '', crossOrigin: '',
}))

// ── jest-dom matchers ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jestDomMatchers = require('@testing-library/jest-dom/matchers')
expect.extend(jestDomMatchers.default ?? jestDomMatchers)

// ── Polyfill vi.stubGlobal / vi.unstubAllGlobals on vitest's vi ───────────────
// When bun is the runner, vitest's vi isn't initialised by the vitest runner,
// so stubGlobal / unstubAllGlobals are undefined. Mutating the cached ES module
// singleton means every `import { vi } from 'vitest'` in test files sees the fix.
if (typeof (vitestVi as Record<string, unknown>).stubGlobal !== 'function') {
  const stubs = new Map<string, unknown>()
  Object.assign(vitestVi, {
    stubGlobal (name: string, val: unknown) {
      if (!stubs.has(name)) stubs.set(name, g[name])
      g[name] = val
    },
    unstubAllGlobals () {
      for (const [name, orig] of stubs) g[name] = orig
      stubs.clear()
    },
  })
}

// ── afterEach cleanup ─────────────────────────────────────────────────────────
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
