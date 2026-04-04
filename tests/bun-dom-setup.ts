// Preload #1 — DOM environment only, NO static ESM imports.
// Using require() so jsdom is loaded synchronously before any module body runs.
// This ensures @testing-library/dom's `screen` sees document when it initialises.

// eslint-disable-next-line @typescript-eslint/no-require-imports
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><body></body>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

const g = globalThis as Record<string, unknown>
Object.assign(g, {
  window:               dom.window,
  document:             dom.window.document,
  navigator:            dom.window.navigator,
  location:             dom.window.location,
  HTMLElement:          dom.window.HTMLElement,
  Element:              dom.window.Element,
  Event:                dom.window.Event,
  CustomEvent:          dom.window.CustomEvent,
  localStorage:         dom.window.localStorage,
  sessionStorage:       dom.window.sessionStorage,
  MutationObserver:     dom.window.MutationObserver,
  getComputedStyle:     (el: Element) => dom.window.getComputedStyle(el),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 16),
  cancelAnimationFrame:  clearTimeout,
  // Audio constructor shorthand — jsdom has HTMLAudioElement but not window.Audio
  Audio: dom.window.HTMLAudioElement ?? function Audio () {},
})
