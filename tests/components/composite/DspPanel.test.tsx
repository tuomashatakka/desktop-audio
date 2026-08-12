import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DspPanel } from '../../../src/app/components/composite/DspPanel'
import { DEFAULT_DSP, EQ_BANDS } from '../../../src/app/services/dspChain'
import type { DspSettings } from '../../../src/app/services/dspChain'


const updateDsp = vi.fn()
const reductionOf = vi.fn(() => 0)

let dsp: DspSettings = DEFAULT_DSP

/** Only the two hooks are replaced; the DSP combinators stay real. */
vi.mock('../../../src/app/contexts', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/app/contexts')>(),
  useSettings: () => ({ dsp, updateDsp }),
  useAudio: () => ({ reductionOf }),
}))

/** What the change function passed to `updateDsp` produces, applied to `dsp`. */
function lastResult (): DspSettings {
  const change = updateDsp.mock.calls.at(-1)![0] as (d: DspSettings) => DspSettings
  return change(dsp)
}

describe('DspPanel', () => {
  beforeEach(() => {
    dsp = DEFAULT_DSP
    vi.clearAllMocks()
  })

  it('is a named region, like the other player panels', () => {
    render(<DspPanel />)
    expect(screen.getByRole('region', { name: 'Audio processing' })).toBeInTheDocument()
  })

  it('gives every band its own fader, labelled by frequency', () => {
    render(<DspPanel />)

    expect(screen.getAllByRole('slider')).toHaveLength(EQ_BANDS.length + 6)
    expect(screen.getByRole('slider', { name: '1.2k Hz' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: '16k Hz' })).toBeInTheDocument()
  })

  it('offers exactly the knobs each dynamics module has', () => {
    render(<DspPanel />)

    for (const name of [ 'Threshold', 'Ratio', 'Attack', 'Ceiling' ])
      expect(screen.getByRole('slider', { name })).toBeInTheDocument()

    // Ratio, knee and attack are welded on the limiter, so they are not shown.
    // Both modules have a Release, and each is scoped by its own <fieldset> —
    // which is also how the labels read on hardware.
    expect(screen.getAllByRole('slider', { name: 'Release' })).toHaveLength(2)
    expect(screen.getAllByRole('slider', { name: 'Attack' })).toHaveLength(1)
  })

  it('bypasses a module through a switch, not a checkbox that says "on"', () => {
    render(<DspPanel />)

    const eq = screen.getByRole('switch', { name: 'Equaliser enabled' })
    expect(eq).not.toBeChecked()

    fireEvent.click(eq)
    expect(lastResult().eq.on).toBe(true)
  })

  it('routes a fader to the band it belongs to', () => {
    render(<DspPanel />)

    fireEvent.change(screen.getByRole('slider', { name: '500 Hz' }), { target: { value: '7' }})
    expect(lastResult().eq.gains[7]).toBe(7)
  })

  it('routes a knob to its own parameter', () => {
    render(<DspPanel />)

    fireEvent.change(screen.getByRole('slider', { name: 'Ratio' }), { target: { value: '12' }})
    expect(lastResult().compressor.ratio).toBe(12)
  })

  it('flattens every band without switching the EQ off', () => {
    dsp = {
      ...DEFAULT_DSP,
      eq: { on: true, gains: EQ_BANDS.map(() => 5) },
    }
    render(<DspPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Flat' }))

    const flat = lastResult()
    expect(flat.eq.on).toBe(true)
    expect(flat.eq.gains.every(gain =>
      gain === 0)).toBe(true)
  })

  it('locks a bypassed module’s controls but still shows its curve', () => {
    render(<DspPanel />)

    const eqGroup = screen.getByRole('group', { name: /Equaliser/ })
    expect(within(eqGroup).getByRole('slider', { name: '80 Hz' })).toBeDisabled()
  })

  it('meters gain reduction for both dynamics modules', () => {
    render(<DspPanel />)

    expect(screen.getByLabelText('Compressor gain reduction')).toBeInTheDocument()
    expect(screen.getByLabelText('Limiter gain reduction')).toBeInTheDocument()
    expect(reductionOf).toHaveBeenCalledWith('compressor')
    expect(reductionOf).toHaveBeenCalledWith('limiter')
  })
})
