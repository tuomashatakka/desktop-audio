/**
 * The processing chain between the media source and the analyser.
 *
 * Three modules in series — 16-band graphic EQ, compressor, limiter — each
 * independently bypassable. No React: the chain owns Web Audio nodes and
 * nothing else, so it is testable without a renderer.
 *
 * **The graph is built once and never re-plumbed. Bypass is neutral
 * parameters, not disconnection**, which is the opposite of what it looks like
 * it should be:
 *
 * - A `peaking`/`lowshelf`/`highshelf` biquad at 0 dB is *exactly* unity — with
 *   `A = 10^(0/40) = 1` the RBJ numerator equals the denominator, so the filter
 *   passes every sample untouched. There is nothing to gain by removing it.
 * - A `DynamicsCompressorNode` at `ratio 1, threshold 0, knee 0` likewise
 *   reduces by 0 dB on every sample.
 * - And Chromium's compressor carries an unconditional ~6 ms pre-delay
 *   *whatever* its parameters are. Splicing one in or out therefore shifts the
 *   sample stream in time, which is a click no gain ramp can hide. Constant
 *   latency is inaudible; *changing* latency is not.
 *
 * So the two compressors cost ~12 ms of fixed latency, always. Nothing here is
 * lip-synced, and the alternative was audible.
 *
 * The UI works in dB and milliseconds throughout, because that is what the
 * labels say. `DynamicsCompressorNode` wants seconds, so {@link dspNodeValues}
 * is the single place the ÷1000 happens.
 *
 * Two limitations worth knowing before trusting this chain:
 *
 * - **The limiter is not a brickwall.** It is a fast, high-ratio compressor, so
 *   it has no true-peak detection and cannot guarantee a 0 dBFS ceiling. It is
 *   named for what it is for, not for what it is.
 * - **Volume is applied to the `<audio>` element, upstream of here**, so the
 *   compressor and limiter thresholds move relative to the programme material
 *   when the user changes volume. Fixing that means moving volume onto a
 *   `GainNode` after `output`, which is a change to the volume path.
 */

/** One band: what the fader says, what the node gets, and how it filters. */
export interface EqBand {
  readonly label: string
  readonly hz:    number
  readonly type:  BiquadFilterType
}

/**
 * The sixteen bands, low to high.
 *
 * The fourteen peaking centres are the ISO 1/3-octave preferred series taken
 * every other step, so they are the numbers printed on real hardware rather
 * than ones we invented — 2/3 of an octave apart.
 *
 * **The two shelves are cornered at the band edge, not at a centre.** A shelf's
 * `frequency` is the middle of its transition, so a lowshelf cornered at 20 Hz
 * only reaches full gain somewhere below 15 Hz and its fader does nothing you
 * can hear. Cornering it at √(20 × 31.5) ≈ 25 Hz puts the whole shelf under the
 * first peaking band, which is the range it is meant to own. Likewise
 * √(12500 × 20000) ≈ 15.8 kHz at the top.
 */
export const EQ_BANDS: readonly EqBand[] = [
  { label: '25', hz: 25, type: 'lowshelf' },
  { label: '31', hz: 31.5, type: 'peaking' },
  { label: '50', hz: 50, type: 'peaking' },
  { label: '80', hz: 80, type: 'peaking' },
  { label: '125', hz: 125, type: 'peaking' },
  { label: '200', hz: 200, type: 'peaking' },
  { label: '315', hz: 315, type: 'peaking' },
  { label: '500', hz: 500, type: 'peaking' },
  { label: '800', hz: 800, type: 'peaking' },
  { label: '1.2k', hz: 1250, type: 'peaking' },
  { label: '2k', hz: 2000, type: 'peaking' },
  { label: '3.1k', hz: 3150, type: 'peaking' },
  { label: '5k', hz: 5000, type: 'peaking' },
  { label: '8k', hz: 8000, type: 'peaking' },
  { label: '12k', hz: 12500, type: 'peaking' },
  { label: '16k', hz: 15800, type: 'highshelf' },
]

/**
 * Filter width, shared by every peaking band. Ignored on the two shelves — the
 * spec does not use `Q` for `lowshelf`/`highshelf`, so setting it there would
 * only suggest it did something.
 *
 * The width-matched value for a 2/3-octave band is `√(2^N)/(2^N−1)` ≈ 2.15, but
 * that is the right Q for a band working alone. A 16-fader EQ is a
 * curve-drawing tool: neighbours get moved together, and at 2.15 two adjacent
 * +6 dB bands leave a visible dip between them. 1.4 overlaps on purpose so the
 * result looks like the line the faders draw.
 */
export const BAND_Q = 1.4

/** Faders travel ±this many dB. */
export const EQ_GAIN_LIMIT = 12

/**
 * How close to Nyquist a band centre may sit.
 *
 * 15.8 kHz is comfortable at 44.1 kHz, but a device that opens at 22.05 kHz
 * would make it plainly invalid. The *label* never changes — only the
 * coefficient is clamped.
 */
const NYQUIST_MARGIN = 0.45

/** Seconds. How fast a parameter glides to a new value. */
const PARAM_GLIDE = 0.01

/** A limiter is a compressor with the knobs welded down. */
const LIMITER_RATIO  = 20
const LIMITER_KNEE   = 0
const LIMITER_ATTACK = 0.001

/**
 * The compressor's knee, in dB. Web Audio defaults to 30, which is so soft that
 * the ratio knob barely reads as doing anything.
 */
const COMPRESSOR_KNEE = 6

export interface EqSettings {
  readonly on:    boolean
  readonly gains: readonly number[]
}

export interface CompressorSettings {
  readonly on: boolean

  /** dB. */
  readonly threshold: number

  /** N : 1. */
  readonly ratio: number

  /** Milliseconds. */
  readonly attack: number

  /** Milliseconds. */
  readonly release: number
}

export interface LimiterSettings {
  readonly on: boolean

  /** dB. */
  readonly threshold: number

  /** Milliseconds. */
  readonly release: number
}

export interface DspSettings {
  readonly eq:         EqSettings
  readonly compressor: CompressorSettings
  readonly limiter:    LimiterSettings
}

/** Which dynamics module a gain-reduction reading is about. */
export type DynamicsModule = 'compressor' | 'limiter'

/** What one `DynamicsCompressorNode` should be set to. Seconds, not milliseconds. */
export interface DynamicsNodeValues {
  readonly threshold: number
  readonly knee:      number
  readonly ratio:     number
  readonly attack:    number
  readonly release:   number
}

/** Settings resolved to what the nodes actually get, bypass included. */
export interface DspNodeValues {
  readonly eqGains:    readonly number[]
  readonly compressor: DynamicsNodeValues
  readonly limiter:    DynamicsNodeValues
}

export interface DspChain {

  /** Connect the media source here. */
  readonly input: AudioNode

  /** Connect the analyser here. */
  readonly output: AudioNode

  /** Push settings onto the nodes. Idempotent, and diffed, so a drag is cheap. */
  apply (dsp: DspSettings): void

  /** Current gain reduction in dB — negative, or `0` when idle. */
  reductionOf (module: DynamicsModule): number
  dispose (): void
}

/** What each control accepts, in the units the UI shows. */
export const DSP_RANGES = {
  eqGain:              { min: -EQ_GAIN_LIMIT, max: EQ_GAIN_LIMIT, step: 0.5 },
  compressorThreshold: { min: -60, max: 0, step: 0.5 },
  compressorRatio:     { min: 1, max: 20, step: 0.1 },
  compressorAttack:    { min: 1, max: 200, step: 1 },
  compressorRelease:   { min: 10, max: 1000, step: 5 },
  limiterThreshold:    { min: -24, max: 0, step: 0.5 },
  limiterRelease:      { min: 10, max: 500, step: 5 },
} as const

/**
 * Everything off and flat.
 *
 * All three modules default off, so a fresh install's chain is bit-exact unity
 * and DSP is something you opt into.
 */
export const DEFAULT_DSP: DspSettings = {
  eq: {
    on:    false,
    gains: EQ_BANDS.map(() =>
      0),
  },

  compressor: {
    on:        false,
    threshold: -18,
    ratio:     4,
    attack:    10,
    release:   200,
  },

  limiter: {
    on:        false,
    threshold: -1,
    release:   100,
  },
}

/** A module doing nothing at all: unity gain on every sample. */
const NEUTRAL_DYNAMICS: DynamicsNodeValues = {
  threshold: 0,
  knee:      0,
  ratio:     1,
  attack:    0.003,
  release:   0.25,
}

function clamp (value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Resolve settings to node values — the only place milliseconds become seconds,
 * and the only place "off" becomes a set of numbers.
 *
 * Pure, so the unit conversion and the bypass semantics are testable without
 * an audio context anywhere near them.
 */
export function dspNodeValues (dsp: DspSettings): DspNodeValues {
  return {
    eqGains: EQ_BANDS.map((_, index) =>
      dsp.eq.on ? dsp.eq.gains[index] ?? 0 : 0),

    compressor: dsp.compressor.on
      ? {
        threshold: dsp.compressor.threshold,
        knee:      COMPRESSOR_KNEE,
        ratio:     dsp.compressor.ratio,
        attack:    dsp.compressor.attack / 1000,
        release:   dsp.compressor.release / 1000,
      }
      : NEUTRAL_DYNAMICS,

    limiter: dsp.limiter.on
      ? {
        threshold: dsp.limiter.threshold,
        knee:      LIMITER_KNEE,
        ratio:     LIMITER_RATIO,
        attack:    LIMITER_ATTACK,
        release:   dsp.limiter.release / 1000,
      }
      : NEUTRAL_DYNAMICS,
  }
}

/** See module docstring. */
export function createDspChain (ctx: BaseAudioContext): DspChain {
  const input   = ctx.createGain()
  const output  = ctx.createGain()
  const ceiling = ctx.sampleRate * NYQUIST_MARGIN

  const bands = EQ_BANDS.map(band => {
    const filter           = ctx.createBiquadFilter()
    filter.type            = band.type
    filter.frequency.value = Math.min(band.hz, ceiling)
    filter.gain.value      = 0

    // Not on the shelves: the spec ignores Q there.
    if (band.type === 'peaking')
      filter.Q.value = BAND_Q

    return filter
  })

  const compressor = ctx.createDynamicsCompressor()
  const limiter    = ctx.createDynamicsCompressor()

  // Wired once, here, and never touched again.
  let node: AudioNode = input
  for (const filter of bands) {
    node.connect(filter)
    node = filter
  }
  node.connect(compressor)
  compressor.connect(limiter)
  limiter.connect(output)

  /** The last values written, so a drag does not re-schedule what has not moved. */
  let applied: DspNodeValues | null = null

  function glide (param: AudioParam, value: number, now: number): void {
    // Never `param.value = …` on a live graph: a dragged fader zippers audibly.
    param.setTargetAtTime(value, now, PARAM_GLIDE)
  }

  function applyDynamics (
    target: DynamicsCompressorNode,
    next: DynamicsNodeValues,
    previous: DynamicsNodeValues | undefined,
    now: number
  ): void {
    if (previous?.threshold !== next.threshold)
      glide(target.threshold, next.threshold, now)
    if (previous?.knee !== next.knee)
      glide(target.knee, next.knee, now)
    if (previous?.ratio !== next.ratio)
      glide(target.ratio, next.ratio, now)
    if (previous?.attack !== next.attack)
      glide(target.attack, next.attack, now)
    if (previous?.release !== next.release)
      glide(target.release, next.release, now)
  }

  return {
    input,
    output,

    apply (dsp) {
      const next = dspNodeValues(dsp)
      const now  = ctx.currentTime

      for (const [ index, filter ] of bands.entries())
        if (applied?.eqGains[index] !== next.eqGains[index])
          glide(filter.gain, next.eqGains[index] ?? 0, now)

      applyDynamics(compressor, next.compressor, applied?.compressor, now)
      applyDynamics(limiter, next.limiter, applied?.limiter, now)

      applied = next
    },

    reductionOf (module) {
      return module === 'limiter' ? limiter.reduction : compressor.reduction
    },

    dispose () {
      input.disconnect()
      for (const filter of bands)
        filter.disconnect()
      compressor.disconnect()
      limiter.disconnect()
      output.disconnect()
      applied = null
    },
  }
}

/**
 * Immutable edits, so `SettingsContext` never learns what an EQ band is.
 *
 * Each returns a whole new `DspSettings` for `updateDsp`, which normalises it —
 * so these do not have to clamp, and a caller cannot corrupt the shape.
 */
export function withEqGain (dsp: DspSettings, index: number, gain: number): DspSettings {
  return {
    ...dsp,
    eq: {
      ...dsp.eq,

      // Rebuilt from EQ_BANDS rather than spliced, so the array can never come
      // out a different length than the chain expects.
      gains: EQ_BANDS.map((_, i) =>
        i === index ? gain : dsp.eq.gains[i] ?? 0),
    },
  }
}

export function withFlatEq (dsp: DspSettings): DspSettings {
  return { ...dsp, eq: { ...dsp.eq, gains: DEFAULT_DSP.eq.gains }}
}

export function withEqEnabled (dsp: DspSettings, on: boolean): DspSettings {
  return { ...dsp, eq: { ...dsp.eq, on }}
}

export function withCompressor (dsp: DspSettings, patch: Partial<CompressorSettings>): DspSettings {
  return { ...dsp, compressor: { ...dsp.compressor, ...patch }}
}

export function withLimiter (dsp: DspSettings, patch: Partial<LimiterSettings>): DspSettings {
  return { ...dsp, limiter: { ...dsp.limiter, ...patch }}
}

function num (value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback
}

function bool (value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function record (value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
}

/**
 * Coerce anything at all into usable settings.
 *
 * `SettingsContext` hydrates with a *shallow* merge over the defaults, so a
 * stored `dsp` replaces the whole subtree — a build that predates a field, or a
 * hand-edited `localStorage`, hands us an object with keys missing or an
 * `eq.gains` of the wrong length. A short array silently leaves the trailing
 * bands unwritten, which is the kind of bug you chase for an hour.
 *
 * This lives next to the ranges it enforces so the clamp cannot drift from the
 * constants the UI is built from.
 */
export function normalizeDsp (value: unknown): DspSettings {
  const raw  = record(value)
  const eq   = record(raw.eq)
  const comp = record(raw.compressor)
  const lim  = record(raw.limiter)

  const stored = Array.isArray(eq.gains) ? eq.gains as unknown[] : []
  const r      = DSP_RANGES

  return {
    eq: {
      on: bool(eq.on, DEFAULT_DSP.eq.on),

      // Length comes from EQ_BANDS, never from the stored value.
      gains: EQ_BANDS.map((_, index) =>
        num(stored[index], 0, r.eqGain.min, r.eqGain.max)),
    },

    compressor: {
      on:        bool(comp.on, DEFAULT_DSP.compressor.on),
      threshold: num(comp.threshold, DEFAULT_DSP.compressor.threshold, r.compressorThreshold.min, r.compressorThreshold.max),
      ratio:     num(comp.ratio, DEFAULT_DSP.compressor.ratio, r.compressorRatio.min, r.compressorRatio.max),
      attack:    num(comp.attack, DEFAULT_DSP.compressor.attack, r.compressorAttack.min, r.compressorAttack.max),
      release:   num(comp.release, DEFAULT_DSP.compressor.release, r.compressorRelease.min, r.compressorRelease.max),
    },

    limiter: {
      on:        bool(lim.on, DEFAULT_DSP.limiter.on),
      threshold: num(lim.threshold, DEFAULT_DSP.limiter.threshold, r.limiterThreshold.min, r.limiterThreshold.max),
      release:   num(lim.release, DEFAULT_DSP.limiter.release, r.limiterRelease.min, r.limiterRelease.max),
    },
  }
}
