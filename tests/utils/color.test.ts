import { describe, expect, it } from 'vitest'
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  contrastLift,
  toCss,
  ACCENT_CONTRAST_TARGET,
} from '../../src/app/utils/color'


describe('parseColor', () => {
  it('parses #rrggbb hex', () => {
    expect(parseColor('#ff8800')).toEqual([ 255, 136, 0 ])
  })

  it('parses #rgb short hex', () => {
    expect(parseColor('#f0f')).toEqual([ 255, 0, 255 ])
  })

  it('parses rgb(r, g, b) with commas', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual([ 10, 20, 30 ])
  })

  it('parses rgb(r g b) with spaces', () => {
    expect(parseColor('rgb(10 20 30)')).toEqual([ 10, 20, 30 ])
  })

  it('returns null for color-mix()', () => {
    expect(parseColor('color-mix(in oklab, red, blue)')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseColor('')).toBeNull()
  })

  it('returns null for arbitrary text', () => {
    expect(parseColor('notacolor')).toBeNull()
  })

  it('returns null for incomplete hex', () => {
    expect(parseColor('#12')).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('black is 0', () => {
    expect(relativeLuminance([ 0, 0, 0 ])).toBeCloseTo(0, 5)
  })

  it('white is 1', () => {
    expect(relativeLuminance([ 255, 255, 255 ])).toBeCloseTo(1, 5)
  })
})

describe('contrastRatio', () => {
  it('black vs white is 21', () => {
    expect(contrastRatio([ 0, 0, 0 ], [ 255, 255, 255 ])).toBeCloseTo(21, 0)
  })

  it('a colour against itself is 1', () => {
    expect(contrastRatio([ 128, 64, 32 ], [ 128, 64, 32 ])).toBeCloseTo(1, 5)
  })
})

describe('contrastLift', () => {
  it('lifts a near-black vibrant against a near-black background to meet the target', () => {
    const vibrant: [number, number, number] = [ 8, 6, 12 ]
    const bg: [number, number, number] = [ 10, 10, 14 ]
    const result = contrastLift(vibrant, bg)
    expect(contrastRatio(result, bg)).toBeGreaterThanOrEqual(ACCENT_CONTRAST_TARGET)
  })

  it('returns the colour unchanged when it already clears the target', () => {
    const white = [ 255, 255, 255 ] as const
    const black = [ 0, 0, 0 ] as const
    const result = contrastLift(white, black)
    expect(result).toBe(white)
  })

  it('darkens on a light background (lower luminance than input)', () => {
    const colour: [number, number, number] = [ 200, 200, 200 ]
    const lightBg: [number, number, number] = [ 244, 244, 248 ]
    const result = contrastLift(colour, lightBg)
    expect(relativeLuminance(result)).toBeLessThan(relativeLuminance(colour))
  })

  it('lightens on a dark background (higher luminance than input)', () => {
    const colour: [number, number, number] = [ 30, 30, 30 ]
    const darkBg: [number, number, number] = [ 10, 10, 14 ]
    const result = contrastLift(colour, darkBg)
    expect(relativeLuminance(result)).toBeGreaterThan(relativeLuminance(colour))
  })
})

describe('toCss', () => {
  it('serialises to space-separated rgb()', () => {
    expect(toCss([ 255, 128, 0 ])).toBe('rgb(255 128 0)')
  })
})
