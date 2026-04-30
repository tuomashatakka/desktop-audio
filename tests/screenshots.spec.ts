import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const SCREENSHOT_DIR = 'public/screenshots'

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.electronAPI = {
      scanLibrary:     () => {},
      loadLibrary:     () => Promise.resolve([]),
      onLibraryBatch:  () => () => {},
      onLibraryDone:   () => () => {},
      selectDirectory: () => Promise.resolve(null),
      getMusicDir:     () => Promise.resolve(''),
      readFile:        () => Promise.resolve(new ArrayBuffer(0)),
      getAudioMetadata:() => Promise.resolve({}),
      minimizeWindow:  () => {},
      maximizeWindow:  () => {},
      closeWindow:     () => {},
      isMaximized:     () => Promise.resolve(false),
      onMediaPlayPause:() => () => {},
      onMediaNext:     () => () => {},
      onMediaPrev:     () => () => {},
    }

    globalThis.AudioContext = class {
      createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, connect: () => {}, disconnect: () => {}, getByteFrequencyData: () => {} } }
      createMediaElementSource() { return { connect: () => {}, disconnect: () => {} } }
      destination = {}
      close() { return Promise.resolve() }
    }

    globalThis.AnalyserNode = class {
      fftSize = 256
      frequencyBinCount = 128
      connect() {}
      disconnect() {}
      getByteFrequencyData() {}
    }

    globalThis.Audio = function() { return { play: () => Promise.resolve(), pause: () => {}, addEventListener: () => {}, removeEventListener: () => {}, currentTime: 0, duration: 0, volume: 1, src: '' } }

    globalThis.MediaMetadata = class { constructor() {} }
    Object.defineProperty(globalThis.navigator, 'mediaSession', { value: null, writable: true })
  })
})

test('screenshot: library view', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.app-layout', { timeout: 10000 })
  await page.waitForTimeout(500)

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/library-view.png`,
    fullPage: true,
  })
})

test('screenshot: player view', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.app-layout', { timeout: 10000 })

  await page.getByRole('button', { name: 'Player' }).click()
  await page.waitForSelector('.player-view', { timeout: 10000 })
  await page.waitForTimeout(1000)

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/player-view.png`,
    fullPage: true,
  })
})

test('screenshot: settings view', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.app-layout', { timeout: 10000 })

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.waitForSelector('.settings-view', { timeout: 10000 })
  await page.waitForTimeout(1000)

  await page.screenshot({
    path: `${SCREENSHOT_DIR}/settings-view.png`,
    fullPage: true,
  })
})
