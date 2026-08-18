import { describe, expect, it, afterEach, vi } from 'vitest'
import { extractPalette } from '../../src/app/hooks/useAmbientPalette'
import { parseColor } from '../../src/app/utils/color'


const SAMPLE_SIZE = 32
const TOTAL_PIXELS = SAMPLE_SIZE * SAMPLE_SIZE

function makeBuffer (fill: (i: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(TOTAL_PIXELS * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = fill(i)       // R
    data[i + 1] = fill(i + 1)   // G
    data[i + 2] = fill(i + 2)   // B
    data[i + 3] = 255            // A
  }
  return data
}

const originalGetContext = HTMLCanvasElement.prototype.getContext
const originalDecode = HTMLImageElement.prototype.decode

let fakeData: Uint8ClampedArray | null = null

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({ data: fakeData }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext

  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined) as unknown as typeof HTMLImageElement.prototype.decode
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
  HTMLImageElement.prototype.decode = originalDecode
  fakeData = null
  vi.restoreAllMocks()
})

describe('extractPalette', () => {
  it('returns vibrant distinct from dark for a saturated image', async () => {
    fakeData = makeBuffer((i) => {
      const pixel = Math.floor(i / 4)
      // Top half: strong red; bottom half: near-black
      return pixel < TOTAL_PIXELS / 2 ? 220 : 8
    })

    const palette = await extractPalette('data:image/png;base64,fake')
    expect(palette).not.toBeNull()
    expect(palette!.vibrant).not.toBe(palette!.dark)
  })

  it('returns null for a fully-transparent buffer', async () => {
    fakeData = new Uint8ClampedArray(TOTAL_PIXELS * 4) // all zeros (alpha = 0)

    const palette = await extractPalette('data:image/png;base64,fake')
    expect(palette).toBeNull()
  })

  it('returns lum near 0 for an all-black buffer', async () => {
    fakeData = makeBuffer(() => 0)

    const palette = await extractPalette('data:image/png;base64,fake')
    expect(palette).not.toBeNull()
    expect(palette!.lum).toBeLessThan(0.05)
  })

  it('returns lum near 1 for an all-white buffer', async () => {
    fakeData = makeBuffer(() => 255)

    const palette = await extractPalette('data:image/png;base64,fake')
    expect(palette).not.toBeNull()
    expect(palette!.lum).toBeGreaterThan(0.95)
  })

  it('every returned colour is a valid rgb() string parseColor accepts', async () => {
    fakeData = makeBuffer((i) => {
      const pixel = Math.floor(i / 4)
      return pixel % 3 === 0 ? 200 : pixel % 3 === 1 ? 100 : 50
    })

    const palette = await extractPalette('data:image/png;base64,fake')
    expect(palette).not.toBeNull()

    for (const role of [ palette!.vibrant, palette!.muted, palette!.dark, palette!.light ]) {
      expect(role).toMatch(/^rgb\(/)
      expect(parseColor(role)).not.toBeNull()
    }
  })
})
