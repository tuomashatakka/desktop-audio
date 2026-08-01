/**
 * Drives the page-wide ambient wash from the current track's album art.
 *
 * The art is drawn into a tiny offscreen canvas and quantised into colour
 * buckets; the three most common buckets, ordered dark → light, become
 * `--ambient-1/2/3` on the root element. `body::before` in app.css builds its
 * gradient from those, so the whole app takes on the colour of what's playing.
 *
 * Note this deliberately does *not* use `track.coverColor` as the primary
 * source — that's a hash of the title (see `generateCoverColor` in
 * scanner-worker), not anything to do with the artwork. It's only the
 * fallback for tracks with no embedded art.
 */
import { useEffect } from 'react'
import { useAudio } from '../contexts'


/** Edge length of the sampling canvas. 24² pixels is plenty for a wash. */
const SAMPLE_SIZE = 24

/** Bits dropped per channel when bucketing — 4 bits leaves 16 levels each. */
const QUANT_SHIFT = 4

/**
 * How many of the most-common buckets the three stops are picked from.
 * Too few and a smooth cover yields three near-identical colours; too many
 * and rare edge pixels start driving the wash.
 */
const POOL_SIZE = 12

const VARS = [ '--ambient-1', '--ambient-2', '--ambient-3' ] as const

type Rgb = readonly [number, number, number]

/** Relative luminance (Rec. 709 weights), used to order stops dark → light. */
function luminance ([ r, g, b ]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** HSV saturation, used to prefer colourful buckets over near-greys. */
function saturation ([ r, g, b ]: Rgb): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

/** Formats a sampled colour as a CSS `rgb()` string. */
function toCss ([ r, g, b ]: Rgb): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

/**
 * Three representative colours from an image, ordered dark → light.
 * Returns `null` if the image can't be read (decode failure, tainted canvas).
 */
async function extractPalette (src: string): Promise<readonly [string, string, string] | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = src
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx)
      return null

    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    // Bucket by quantised colour, keeping a running sum so each bucket can
    // report its true average rather than the quantised approximation.
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128)
        continue

      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const key = r >> QUANT_SHIFT << 16 | g >> QUANT_SHIFT << 8 | b >> QUANT_SHIFT

      const bucket = buckets.get(key)
      if (bucket) {
        bucket.count++
        bucket.r += r
        bucket.g += g
        bucket.b += b
      }
      else {
        buckets.set(key, { count: 1, r, g, b })
      }
    }

    if (buckets.size === 0)
      return null

    const averaged: Rgb[] = [ ...buckets.values() ]
      .sort((a, b) =>
        b.count - a.count)
      .map(({ count, r, g, b }) =>
        [ r / count, g / count, b / count ] as Rgb)

    // Prefer colourful buckets — a wash built from the near-greys in an album
    // cover is just a grey wash. Fall back to the raw ranking if the artwork
    // genuinely is monochrome.
    const colourful = averaged.filter(c =>
      saturation(c) > 0.15)
    const pool = (colourful.length >= 3 ? colourful : averaged).slice(0, POOL_SIZE)

    const chosen = [ ...pool ].sort((a, b) =>
      luminance(a) - luminance(b))

    const dark = chosen[0]
    const light = chosen[chosen.length - 1]
    const mid = chosen[Math.floor(chosen.length / 2)]

    return [ toCss(dark), toCss(mid), toCss(light) ]
  }
  catch {
    return null
  }
}

/**
 * Writes `--ambient-1/2/3` to the root element for the current track.
 * Call once, near the top of the tree.
 */
export function useAmbientPalette (): void {
  const { currentTrack } = useAudio()

  const art = currentTrack?.albumArt
  const fallback = currentTrack?.coverColor

  useEffect(() => {
    const root = document.documentElement

    // eslint-disable-next-line functional/no-let
    let cancelled = false

    const apply = (palette: readonly string[] | null) => {
      if (cancelled)
        return
      if (!palette) {
        for (const name of VARS)
          root.style.removeProperty(name)
        return
      }
      for (const [ i, name ] of VARS.entries())
        root.style.setProperty(name, palette[i])
    }

    if (!art) {
      // No artwork: tint everything with the swatch colour rather than
      // snapping back to the default wash mid-playback.
      apply(fallback ? [ fallback, fallback, fallback ] : null)
      return
    }

    extractPalette(art).then(palette =>
      apply(palette ?? (fallback ? [ fallback, fallback, fallback ] : null)))
      .catch(() =>
        apply(null))

    return () => {
      cancelled = true
    }
  }, [ art, fallback ])
}
