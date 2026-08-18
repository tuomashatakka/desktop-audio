/**
 * Drives the page-wide ambient wash — and the accent colour — from the current
 * track's album art.
 *
 * The art is drawn into a tiny offscreen canvas and quantised into colour
 * buckets, which are then read as *roles* rather than as an ordering: the most
 * saturated populous bucket is `vibrant` (this becomes the accent), the darkest
 * and lightest bracket the wash, and the mean luminance says how bright the
 * cover is so the backdrop can dim itself under a white sleeve.
 *
 * Every role is written to the root element as a custom property, all of which
 * are registered with `@property` in tokens.css — that registration is what
 * lets the browser *interpolate* them, so the whole page crossfades between
 * tracks with no JavaScript animating anything.
 *
 * The one thing CSS cannot do here is crossfade a `background-image`, so the
 * blurred-art layer is re-triggered by flipping `data-art-tick` between two
 * values that name two identical keyframes. Still no timers.
 *
 * Note this deliberately does *not* use `track.coverColor` as the primary
 * source — that's a hash of the title (see `generateCoverColor` in
 * scanner-worker), not anything to do with the artwork. It's only the
 * fallback for tracks with no embedded art.
 */
import { useEffect, useState } from 'react'
import { useAudio } from '../contexts'
import { toCss } from '../utils/color'
import type { Rgb } from '../utils/color'
import { useArtwork } from './useArtwork'


/** Edge length of the sampling canvas. 32² pixels is plenty for a wash. */
const SAMPLE_SIZE = 32

/** Bits dropped per channel when bucketing — 4 bits leaves 16 levels each. */
const QUANT_SHIFT = 4

/**
 * How many of the most-common buckets the roles are picked from.
 * Too few and a smooth cover yields near-identical colours; too many
 * and rare edge pixels start driving the wash.
 */
const POOL_SIZE = 16

/** Below this alpha a pixel is transparent enough to ignore. */
const MIN_ALPHA = 128

/** Channel offsets within the RGBA sample buffer. */
const ALPHA_OFFSET = 3

/** Bit positions that pack the quantised R/G/B into one bucket key. */
const RED_BUCKET_SHIFT   = 16
const GREEN_BUCKET_SHIFT = 8

/** A colour is only "colourful" enough to lead the palette above this. */
const MIN_SATURATION = 0.15

/** ...and only if at least this many of the pool clear that bar. */
const MIN_COLOURFUL_COUNT = 3

/**
 * Floor on the mid-luminance weighting when scoring `vibrant`. Without it a
 * single near-black but wildly saturated pixel run outscores the colour the
 * sleeve actually reads as.
 */
const LUMA_WEIGHT_FLOOR = 0.25

const CHANNEL_MAX = 255

/** The role properties, all registered as animatable in tokens.css. */
const ROLE_VARS = [ '--art-vibrant', '--art-muted', '--art-dark', '--art-light' ] as const

const LUM_VAR   = '--art-lum'
const IMAGE_VAR = '--art-image'
const TICK_ATTR = 'data-art-tick'

/** Colour roles read off a piece of album art. */
export interface ArtPalette {
  /** Most saturated populous colour — the one the sleeve reads as. */
  readonly vibrant: string
  /** A second, calmer stop for the wash. */
  readonly muted: string
  /** Darkest sampled colour. */
  readonly dark: string
  /** Lightest sampled colour. */
  readonly light: string
  /** Mean luminance of the whole image, 0–1. Drives the auto-scrim. */
  readonly lum: number
}

interface Bucket {
  count: number
  r: number
  g: number
  b: number
}

interface Sample {
  readonly rgb: Rgb
  readonly count: number
}

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

/**
 * How strongly a colour should be allowed to lead, weighing how much of the
 * cover it covers against how colourful it is — and discounting colours at
 * either extreme of lightness, which read as shadow or blowout rather than as
 * the record's colour.
 */
function vibrancy (sample: Sample): number {
  const l      = luminance(sample.rgb) / CHANNEL_MAX
  const midish = Math.max(LUMA_WEIGHT_FLOOR, 1 - Math.abs(l - 0.5) * 2)
  return saturation(sample.rgb) * Math.sqrt(sample.count) * midish
}

/** Reads the sampled pixels into quantised buckets plus a luminance mean. */
function bucketise (data: Uint8ClampedArray): { samples: Sample[]; lum: number } {
  const buckets = new Map<number, Bucket>()

  let lumSum = 0
  let counted = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + ALPHA_OFFSET] < MIN_ALPHA)
      continue

    const r   = data[i]
    const g   = data[i + 1]
    const b   = data[i + 2]
    const key = r >> QUANT_SHIFT << RED_BUCKET_SHIFT |
      g >> QUANT_SHIFT << GREEN_BUCKET_SHIFT |
      b >> QUANT_SHIFT

    lumSum += luminance([ r, g, b ])
    counted++

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count++
      bucket.r += r
      bucket.g += g
      bucket.b += b
    }
    else
      buckets.set(key, { count: 1, r, g, b })
  }

  // Each bucket reports its true average rather than the quantised
  // approximation it was keyed by.
  const samples: Sample[] = [ ...buckets.values() ]
    .sort((a, b) =>
      b.count - a.count)
    .map(({ count, r, g, b }) =>
      ({ rgb: [ r / count, g / count, b / count ] as Rgb, count }))

  return { samples, lum: counted === 0 ? 0 : lumSum / counted / CHANNEL_MAX }
}

/** Turns the sampled buckets into the four named roles. */
function toRoles (samples: Sample[], lum: number): ArtPalette | null {
  if (samples.length === 0)
    return null

  // Prefer colourful buckets — a wash built from the near-greys in an album
  // cover is just a grey wash. Fall back to the raw ranking if the artwork
  // genuinely is monochrome.
  const colourful = samples.filter(s =>
    saturation(s.rgb) > MIN_SATURATION)
  const pool = (colourful.length >= MIN_COLOURFUL_COUNT ? colourful : samples).slice(0, POOL_SIZE)

  const byLuma = [ ...pool ].sort((a, b) =>
    luminance(a.rgb) - luminance(b.rgb))
  const byVibrancy = [ ...pool ].sort((a, b) =>
    vibrancy(b) - vibrancy(a))

  const vibrant = byVibrancy[0].rgb
  const dark    = byLuma[0].rgb
  const light   = byLuma[byLuma.length - 1].rgb

  // The calmer second stop: the next most vibrant if there is one, otherwise
  // the mid-luminance sample, which on a monochrome cover is all there is.
  const muted = (byVibrancy[1] ?? byLuma[Math.floor(byLuma.length / 2)]).rgb

  return {
    vibrant: toCss(vibrant),
    muted:   toCss(muted),
    dark:    toCss(dark),
    light:   toCss(light),
    lum,
  }
}

/**
 * Colour roles for an image, or `null` if it can't be read (decode failure,
 * tainted canvas, fully transparent source).
 *
 * Exported for tests — the sampler is the part of this module with real
 * branching, and it is pure given an image source.
 */
export async function extractPalette (src: string): Promise<ArtPalette | null> {
  try {
    const img       = new Image()
    img.crossOrigin = 'anonymous'
    img.src         = src
    await img.decode()

    const canvas  = document.createElement('canvas')
    canvas.width  = SAMPLE_SIZE
    canvas.height = SAMPLE_SIZE

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx)
      return null

    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

    const { data }      = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    const { samples, lum } = bucketise(data)

    return toRoles(samples, lum)
  }
  catch {
    return null
  }
}

/** A palette standing in for artwork we don't have: one colour in every role. */
function flatPalette (colour: string): ArtPalette {
  return { vibrant: colour, muted: colour, dark: colour, light: colour, lum: 0.5 }
}

/**
 * Writes the ambient and art-role custom properties for the current track, and
 * returns the palette so a single caller can hand it to `useAppearance`.
 *
 * Returning rather than writing `--accent` here is deliberate: two hooks
 * writing the same custom property on the same element is a race whose winner
 * depends on effect ordering. `useAppearance` is the only writer of `--accent`;
 * this hook is the only reader of the artwork. Call this once, near the top of
 * the tree, and pass the result down.
 */
export function useAmbientPalette (): ArtPalette | null {
  const { currentTrack } = useAudio()

  // The thumbnail is plenty: the sampler downsizes to 32×32 anyway, so asking
  // for the full image would only make the first paint of the wash slower.
  const art      = useArtwork(currentTrack?.id, 'thumb')
  const fallback = currentTrack?.coverColor

  const [ palette, setPalette ] = useState<ArtPalette | null>(null)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Samples the artwork on a canvas and writes `--ambient-*`/`--art-*` onto the document root.
  useEffect(() => {
    const root = document.documentElement

    let cancelled = false

    const apply = (next: ArtPalette | null) => {
      if (cancelled)
        return

      setPalette(next)

      if (!next) {
        for (const name of [ ...ROLE_VARS, LUM_VAR, IMAGE_VAR ])
          root.style.removeProperty(name)
        root.removeAttribute(TICK_ATTR)
        return
      }

      const roles = [ next.vibrant, next.muted, next.dark, next.light ]
      for (const [ i, name ] of ROLE_VARS.entries())
        root.style.setProperty(name, roles[i])

      root.style.setProperty(LUM_VAR, next.lum.toFixed(3))

      if (art) {
        root.style.setProperty(IMAGE_VAR, `url("${art}")`)
        // Flip the tick so the fade-in keyframe re-triggers. A custom property
        // change alone won't restart an animation; a changed `animation-name`
        // will, and that's all the two ticks select between.
        root.setAttribute(TICK_ATTR, root.getAttribute(TICK_ATTR) === 'a' ? 'b' : 'a')
      }
      else {
        root.style.removeProperty(IMAGE_VAR)
        root.removeAttribute(TICK_ATTR)
      }
    }

    if (!art) {
      // No artwork: tint everything with the swatch colour rather than
      // snapping back to the default wash mid-playback.
      apply(fallback ? flatPalette(fallback) : null)
      return
    }

    extractPalette(art).then(next =>
      apply(next ?? (fallback ? flatPalette(fallback) : null)))
      .catch(() =>
        apply(null))

    return () => {
      cancelled = true
    }
  }, [ art, fallback ])

  return palette
}
