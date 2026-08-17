import { describe, expect, it } from 'vitest'
import { axisFrequency, axisPosition, eqResponseDb } from '../../src/app/services/eqResponse'
import { EQ_BANDS } from '../../src/app/services/dspChain'


/** Gains array of the right length with a few bands lifted. */
function gainsWith (overrides: Record<number, number>): number[] {
  return EQ_BANDS.map((_, index) =>
    overrides[index] ?? 0)
}

const indexOfHz = (hz: number) =>
  EQ_BANDS.findIndex(band =>
    band.hz === hz)

describe('eqResponseDb', () => {
  it('is flat when every band is at zero', () => {
    const response = eqResponseDb(gainsWith({}), [ 20, 100, 1000, 10000, 20000 ])

    for (const db of response)
      expect(db).toBeCloseTo(0, 10)
  })

  /*
   * Ground truth, not a regression baseline: an RBJ peaking filter's magnitude
   * at its own centre frequency is exactly the gain it was given. If this drifts
   * the coefficients are wrong, whatever the curve looks like.
   */
  it('hits a peaking band’s gain exactly at its centre', () => {
    const index = indexOfHz(1250)
    const [ db ] = eqResponseDb(gainsWith({ [index]: 6 }), [ 1250 ])

    expect(db).toBeCloseTo(6, 6)
  })

  it('is symmetric: cutting a band mirrors boosting it', () => {
    const index = indexOfHz(500)
    const hz    = [ 250, 500, 1000 ]

    const boost = eqResponseDb(gainsWith({ [index]: 9 }), hz)
    const cut   = eqResponseDb(gainsWith({ [index]: -9 }), hz)

    boost.forEach((db, i) =>
      expect(db).toBeCloseTo(-(cut[i] ?? 0), 6))
  })

  /*
   * The reason the curve is evaluated rather than interpolated through the
   * fader values. At Q 1.4 the bands overlap deliberately (see `BAND_Q`), so
   * two neighbours at +6 sum to more than +6 between them — a spline through
   * the gains would draw a dip the chain does not play.
   */
  it('sums overlapping neighbours above either band alone', () => {
    const low  = indexOfHz(500)
    const high = indexOfHz(800)

    const [ between ] = eqResponseDb(gainsWith({ [low]: 6, [high]: 6 }), [ Math.sqrt(500 * 800) ])

    expect(between).toBeGreaterThan(6)
  })

  it('takes a low shelf to its full gain below the corner', () => {
    const index  = indexOfHz(25)
    const [ db ] = eqResponseDb(gainsWith({ [index]: 6 }), [ 5 ])

    expect(EQ_BANDS[index]?.type).toBe('lowshelf')
    expect(db).toBeCloseTo(6, 1)
  })

  it('takes a high shelf toward its full gain above the corner', () => {
    const index  = indexOfHz(15800)
    const [ db ] = eqResponseDb(gainsWith({ [index]: 6 }), [ 20000 ])

    expect(EQ_BANDS[index]?.type).toBe('highshelf')
    expect(db).toBeGreaterThan(3)
    expect(db).toBeLessThanOrEqual(6.01)
  })

  it('leaves untouched bands out of the sum entirely', () => {
    const index  = indexOfHz(8000)
    const [ db ] = eqResponseDb(gainsWith({ [index]: 12 }), [ 50 ])

    expect(db).toBeCloseTo(0, 2)
  })
})

describe('axisPosition', () => {
  it('puts the ends of the range at 0 and 1', () => {
    expect(axisPosition(20, 20, 20000)).toBeCloseTo(0, 10)
    expect(axisPosition(20000, 20, 20000)).toBeCloseTo(1, 10)
  })

  /* Logarithmic, so every decade takes the same width — that is the point. */
  it('spaces decades evenly', () => {
    const a = axisPosition(200, 20, 20000) - axisPosition(20, 20, 20000)
    const b = axisPosition(2000, 20, 20000) - axisPosition(200, 20, 20000)

    expect(a).toBeCloseTo(b, 10)
  })

  it('round-trips through axisFrequency', () => {
    for (const hz of [ 20, 440, 1000, 15800, 20000 ])
      expect(axisFrequency(axisPosition(hz, 20, 20000), 20, 20000)).toBeCloseTo(hz, 6)
  })
})
