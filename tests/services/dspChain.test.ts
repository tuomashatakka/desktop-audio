import { describe, expect, it, vi } from 'vitest'
import {
  createDspChain, dspNodeValues, normalizeDsp,
  withCompressor, withEqEnabled, withEqGain, withFlatEq, withLimiter,
  BAND_Q, DEFAULT_DSP, DSP_RANGES, EQ_BANDS,
} from '../../src/app/services/dspChain'
import type { DspSettings } from '../../src/app/services/dspChain'


/** Everything switched on, so the bypass path is never what is being measured. */
const LIVE: DspSettings = {
  eq:         { on: true, gains: EQ_BANDS.map(() => 0) },
  compressor: { on: true, threshold: -18, ratio: 4, attack: 10, release: 200 },
  limiter:    { on: true, threshold: -1, release: 100 },
}

function audioParam () {
  return { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }
}

/**
 * jsdom has no Web Audio at all, so the chain is built against a hand-rolled
 * context that records what was connected to what.
 */
function fakeContext (sampleRate = 44100) {
  const connections: [ unknown, unknown ][] = []

  const connectable = <T extends object>(node: T) =>
    Object.assign(node, {
      connect: vi.fn((target: unknown) =>
        connections.push([ node, target ])),
      disconnect: vi.fn(),
    })

  const filters: ReturnType<typeof makeFilter>[] = []
  const compressors: ReturnType<typeof makeCompressor>[] = []

  function makeFilter () {
    return connectable({
      type: 'peaking' as BiquadFilterType,
      frequency: audioParam(),
      Q: audioParam(),
      gain: audioParam(),
    })
  }

  function makeCompressor () {
    return connectable({
      threshold: audioParam(),
      knee: audioParam(),
      ratio: audioParam(),
      attack: audioParam(),
      release: audioParam(),
      reduction: 0,
    })
  }

  const ctx = {
    currentTime: 0,
    sampleRate,
    createGain: vi.fn(() =>
      connectable({ gain: audioParam() })),
    createBiquadFilter: vi.fn(() => {
      const filter = makeFilter()
      filters.push(filter)
      return filter
    }),
    createDynamicsCompressor: vi.fn(() => {
      const comp = makeCompressor()
      compressors.push(comp)
      return comp
    }),
  }

  return { ctx: ctx as unknown as BaseAudioContext, connections, filters, compressors }
}

describe('dspNodeValues', () => {
  it('converts attack and release from milliseconds to seconds, and nothing else', () => {
    const values = dspNodeValues(LIVE)

    expect(values.compressor.attack).toBeCloseTo(0.01)
    expect(values.compressor.release).toBeCloseTo(0.2)
    expect(values.limiter.release).toBeCloseTo(0.1)

    // dB and ratio are already in the node's units.
    expect(values.compressor.threshold).toBe(-18)
    expect(values.compressor.ratio).toBe(4)
    expect(values.limiter.threshold).toBe(-1)
  })

  it('welds the limiter to a fixed ratio, knee and attack', () => {
    const { limiter } = dspNodeValues(LIVE)

    expect(limiter.ratio).toBe(20)
    expect(limiter.knee).toBe(0)
    expect(limiter.attack).toBeCloseTo(0.001)
  })

  it('resolves a disabled module to unity rather than removing it', () => {
    const off = dspNodeValues(DEFAULT_DSP)

    // A compressor at ratio 1 / threshold 0 / knee 0 reduces nothing.
    expect(off.compressor).toMatchObject({ ratio: 1, threshold: 0, knee: 0 })
    expect(off.limiter).toMatchObject({ ratio: 1, threshold: 0, knee: 0 })
  })

  it('zeroes every EQ gain when the EQ is bypassed, whatever the faders say', () => {
    const boosted = withEqGain(withEqEnabled(DEFAULT_DSP, false), 4, 9)

    expect(dspNodeValues(boosted).eqGains.every(gain =>
      gain === 0)).toBe(true)

    // ...and passes them straight through when it is not.
    expect(dspNodeValues(withEqEnabled(boosted, true)).eqGains[4]).toBe(9)
  })
})

describe('EQ_BANDS', () => {
  it('is sixteen bands, ascending, shelved at both ends', () => {
    expect(EQ_BANDS).toHaveLength(16)
    expect(EQ_BANDS[0]!.type).toBe('lowshelf')
    expect(EQ_BANDS[15]!.type).toBe('highshelf')

    for (const band of EQ_BANDS.slice(1, -1))
      expect(band.type).toBe('peaking')

    const ascending = EQ_BANDS.every((band, i) =>
      i === 0 || band.hz > EQ_BANDS[i - 1]!.hz)
    expect(ascending).toBe(true)
  })

  it('corners the shelves at the band edge, not at a centre', () => {
    // A shelf cornered at the nominal 20 Hz only reaches full gain below ~15 Hz,
    // which makes its fader inaudible. The edge is the geometric mean of the
    // two bands it sits between.
    expect(EQ_BANDS[0]!.hz).toBeCloseTo(Math.sqrt(20 * 31.5), 0)
    expect(EQ_BANDS[15]!.hz).toBeCloseTo(Math.sqrt(12500 * 20000), -2)
  })
})

describe('createDspChain', () => {
  it('wires input → 16 filters → compressor → limiter → output, once', () => {
    const { ctx, connections, filters, compressors } = fakeContext()
    const chain = createDspChain(ctx)

    expect(filters).toHaveLength(16)
    expect(compressors).toHaveLength(2)

    // 16 hops into the filters, then compressor, limiter, output.
    expect(connections).toHaveLength(19)
    expect(connections[0]![0]).toBe(chain.input)
    expect(connections[0]![1]).toBe(filters[0])
    expect(connections.at(-1)![1]).toBe(chain.output)
  })

  it('sets Q on the peaking bands only, since shelves ignore it', () => {
    const { ctx, filters } = fakeContext()
    createDspChain(ctx)

    expect(filters[0]!.Q.value).toBe(0)
    expect(filters[15]!.Q.value).toBe(0)
    expect(filters[7]!.Q.value).toBe(BAND_Q)
  })

  it('clamps a band away from Nyquist without changing its label', () => {
    const { ctx, filters } = fakeContext(22050)
    createDspChain(ctx)

    // 0.45 × 22050 = 9922.5, so the top four bands all land on the ceiling.
    expect(filters[15]!.frequency.value).toBeCloseTo(9922.5)
    expect(EQ_BANDS[15]!.label).toBe('16k')
  })

  it('glides parameters rather than assigning them, so a drag cannot zipper', () => {
    const { ctx, filters } = fakeContext()
    const chain = createDspChain(ctx)

    chain.apply(withEqGain(withEqEnabled(DEFAULT_DSP, true), 3, 6))

    expect(filters[3]!.gain.setTargetAtTime).toHaveBeenCalledWith(6, 0, 0.01)
    expect(filters[3]!.gain.value).toBe(0)
  })

  it('writes only what moved on a second apply', () => {
    const { ctx, filters, compressors } = fakeContext()
    const chain = createDspChain(ctx)
    const live  = withEqEnabled(LIVE, true)

    chain.apply(live)
    filters.forEach(f =>
      f.gain.setTargetAtTime.mockClear())
    compressors.forEach(c =>
      c.threshold.setTargetAtTime.mockClear())

    // Identical settings: nothing should be scheduled at all.
    chain.apply(live)
    expect(filters.every(f =>
      f.gain.setTargetAtTime.mock.calls.length === 0)).toBe(true)
    expect(compressors.every(c =>
      c.threshold.setTargetAtTime.mock.calls.length === 0)).toBe(true)

    // Move one band, and only that band is rewritten.
    chain.apply(withEqGain(live, 2, -4))
    expect(filters[2]!.gain.setTargetAtTime).toHaveBeenCalledWith(-4, 0, 0.01)
    expect(filters[5]!.gain.setTargetAtTime).not.toHaveBeenCalled()
  })

  it('never re-plumbs the graph when a module is bypassed', () => {
    const { ctx, connections } = fakeContext()
    const chain = createDspChain(ctx)
    const wired = connections.length

    chain.apply(LIVE)
    chain.apply(DEFAULT_DSP)
    chain.apply(withCompressor(LIVE, { on: false }))

    // Splicing a compressor out would shift the stream by its ~6 ms pre-delay,
    // which is a click. Bypass is neutral parameters instead.
    expect(connections).toHaveLength(wired)
  })

  it('reports gain reduction per module', () => {
    const { ctx, compressors } = fakeContext()
    const chain = createDspChain(ctx)

    compressors[0]!.reduction = -7
    compressors[1]!.reduction = -2

    expect(chain.reductionOf('compressor')).toBe(-7)
    expect(chain.reductionOf('limiter')).toBe(-2)
  })
})

describe('normalizeDsp', () => {
  it('survives anything at all', () => {
    for (const junk of [ undefined, null, 42, 'nope', [], { eq: 7 } ])
      expect(normalizeDsp(junk).eq.gains).toHaveLength(EQ_BANDS.length)
  })

  it('pads a short gain array and truncates a long one', () => {
    // A short array is the dangerous one: it silently leaves the trailing
    // bands unwritten rather than failing.
    expect(normalizeDsp({ eq: { gains: [ 3, 4 ]}}).eq.gains)
      .toEqual([ 3, 4, ...Array.from({ length: 14 }, () => 0) ])

    expect(normalizeDsp({ eq: { gains: Array.from({ length: 40 }, () => 1) }}).eq.gains)
      .toHaveLength(16)
  })

  it('clamps every number to its documented range', () => {
    const wild = normalizeDsp({
      eq:         { gains: [ 999 ] },
      compressor: { threshold: -400, ratio: 1e6 },
      limiter:    { release: -50 },
    })

    expect(wild.eq.gains[0]).toBe(DSP_RANGES.eqGain.max)
    expect(wild.compressor.threshold).toBe(DSP_RANGES.compressorThreshold.min)
    expect(wild.compressor.ratio).toBe(DSP_RANGES.compressorRatio.max)
    expect(wild.limiter.release).toBe(DSP_RANGES.limiterRelease.min)
  })

  it('falls back to the default for a value that is not a finite number', () => {
    const bad = normalizeDsp({ compressor: { threshold: NaN, ratio: 'four', on: 'yes' }})

    expect(bad.compressor.threshold).toBe(DEFAULT_DSP.compressor.threshold)
    expect(bad.compressor.ratio).toBe(DEFAULT_DSP.compressor.ratio)
    expect(bad.compressor.on).toBe(DEFAULT_DSP.compressor.on)
  })
})

describe('combinators', () => {
  it('leave the original untouched', () => {
    const next = withEqGain(DEFAULT_DSP, 0, 11)

    expect(next.eq.gains[0]).toBe(11)
    expect(DEFAULT_DSP.eq.gains[0]).toBe(0)
  })

  it('rebuild the gain array at the band count, whatever went in', () => {
    const stunted = { ...DEFAULT_DSP, eq: { on: true, gains: [ 1 ]}}

    expect(withEqGain(stunted, 0, 5).eq.gains).toHaveLength(EQ_BANDS.length)
  })

  it('flatten every band without touching the enabled flag', () => {
    const flat = withFlatEq(withEqGain(withEqEnabled(DEFAULT_DSP, true), 9, -8))

    expect(flat.eq.on).toBe(true)
    expect(flat.eq.gains.every(gain =>
      gain === 0)).toBe(true)
  })

  it('patch one dynamics field at a time', () => {
    const next = withLimiter(withCompressor(DEFAULT_DSP, { ratio: 8 }), { release: 250 })

    expect(next.compressor.ratio).toBe(8)
    expect(next.compressor.threshold).toBe(DEFAULT_DSP.compressor.threshold)
    expect(next.limiter.release).toBe(250)
  })
})
