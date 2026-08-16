import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrequencyMatrix } from '../../../src/app/components/composite/FrequencyMatrix'


const SAMPLE_RATE = 44100
const FFT_SIZE    = 4096

/**
 * An analyser that reports a fixed spectrum.
 *
 * The component only ever asks for `getByteFrequencyData`, `fftSize`,
 * `frequencyBinCount` and the context's `sampleRate`, so a stub covering those
 * exercises the real render path with a spectrum whose true pitches are known.
 */
function analyserFor (tones: readonly { hz: number; level: number }[]): AnalyserNode {
  const bins  = new Uint8Array(FFT_SIZE / 2)
  const binHz = SAMPLE_RATE / FFT_SIZE

  for (const { hz, level } of tones) {
    const centre = hz / binHz
    const near   = Math.round(centre)
    for (let i = near - 3; i <= near + 3; i++) {
      if (i < 0 || i >= bins.length)
        continue
      const falloff = Math.max(0, 1 - Math.abs(i - centre) / 3)
      bins[i]       = Math.max(bins[i], Math.round(level * falloff))
    }
  }

  return {
    fftSize:           FFT_SIZE,
    frequencyBinCount: bins.length,
    context:           { sampleRate: SAMPLE_RATE },
    getByteFrequencyData (target: Uint8Array) {
      target.set(bins)
    },
  } as unknown as AnalyserNode
}

describe('FrequencyMatrix', () => {
  beforeEach(() => {
    // jsdom has no rAF budget of its own; drive it by hand so a "frame" is
    // deterministic rather than a race with the test runner.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() =>
        cb(performance.now()), 0) as unknown as number)
    vi.stubGlobal('cancelAnimationFrame', (id: number) =>
      clearTimeout(id))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the notes under the loudest partials', async () => {
    // An A major triad: A4 440, C#5 554.37, E5 659.26.
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([
            { hz: 440, level: 255 },
            { hz: 554.37, level: 230 },
            { hz: 659.26, level: 210 },
          ]) }
          active />
      )
    })

    const readout = screen.getByRole('region', { name: 'Frequency spectrum' })
    expect(readout.textContent).toContain('A4')
    expect(readout.textContent).toContain('C♯5')
    expect(readout.textContent).toContain('E5')
  })

  it('shows the frequency beside the note', async () => {
    await act(async () => {
      render(<FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active />)
    })

    const readout = screen.getByRole('region', { name: 'Frequency spectrum' })

    // Note and frequency sit in a <dt>/<dd> pair, so the pitch is named and
    // the number it was derived from is shown beside it.
    expect(readout.textContent).toContain('A4')
    expect(readout.textContent).toMatch(/4[34]\d Hz/)
  })

  it('resolves low notes a coarse FFT would smear together', async () => {
    // E2 is 82.4 Hz; at the old fftSize of 256 a bin was ~172 Hz wide, which
    // is more than an octave down here — the note would have been a guess.
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([{ hz: 82.4069, level: 255 }, { hz: 123.4708, level: 220 }]) }
          active />
      )
    })

    const readout = screen.getByRole('region', { name: 'Frequency spectrum' })
    expect(readout.textContent).toContain('E2')
    expect(readout.textContent).toContain('B2')
  })

  it('shows current and next chords, key, tempo, and the complete chord map', () => {
    const { container } = render(
      <FrequencyMatrix
        analyzer={ null }
        active
        currentTime={ 6 }
        status='ready'
        showChordAnalysis
        showKeyAnalysis
        analysis={{
          version:  1,
          duration: 20,
          tempo:    { bpm: 119.99, confidence: 0.9 },
          key:      { tonic: 'A', scale: 'minor', label: 'A minor', confidence: 0.8 },
          beats:    [],
          chords:   [
            { start: 0, end: 5, label: 'Am', confidence: 0.8, notes: [ 57, 60, 64 ]},
            { start: 5, end: 10, label: 'F', confidence: 0.8, notes: [ 53, 57, 60 ]},
            { start: 10, end: 20, label: 'C', confidence: 0.8, notes: [ 48, 52, 55 ]},
          ],
          warnings: [],
        }} />
    )

    // Current chord is prominent in the chord strip
    expect(container.querySelector('.chord-strip-current')).toHaveTextContent('F')
    // Next chord (data-next='1') is the chord after F, which is C
    expect(container.querySelector('[data-next="1"]')).toHaveTextContent('C')
    // Key and tempo are shown in the summary
    expect(screen.getByText('A minor')).toBeInTheDocument()
    expect(screen.getByText(/120\.0/)).toBeInTheDocument()
  })

  it('paints the mesh even before a frame is granted', () => {
    // requestAnimationFrame is suspended while a window is hidden or
    // occluded. The panel has to open showing a mesh, not an empty box.
    vi.stubGlobal('requestAnimationFrame', () =>
      0)

    const { container } = render(
      <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active />
    )

    expect(container.querySelector('.matrix-line-x')?.getAttribute('d')).toBeTruthy()
    expect(container.querySelector('.matrix-line-z')?.getAttribute('d')).toBeTruthy()
  })

  it('renders a resting mesh with no analyser at all', () => {
    const { container } = render(<FrequencyMatrix analyzer={ null } active />)

    expect(container.querySelector('.matrix-line-x')?.getAttribute('d')).toBeTruthy()
    expect(screen.queryByText(/Hz$/)).toBeNull()
  })

  it('runs no loop while inactive', () => {
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)

    render(<FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active={ false } />)

    expect(raf).not.toHaveBeenCalled()
  })

  it('keeps the mesh to two paths regardless of grid size', () => {
    const { container } = render(
      <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active />
    )

    // The whole point of the rewrite: one path per direction, not one per row.
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  it('places an octave the same distance apart in any register', async () => {
    /** Label positions, left to right, for one pair of pitches. */
    const spreadOf = async (low: number, high: number) => {
      const view = render(
        <FrequencyMatrix
          analyzer={ analyserFor([{ hz: low, level: 255 }, { hz: high, level: 240 }]) }
          active />
      )

      await act(async () => {})

      const lefts = [ ...view.container.querySelectorAll<HTMLElement>('.matrix-peak') ]
        .map(el =>
          Number.parseFloat(el.style.left))

      view.unmount()
      return Math.max(...lefts) - Math.min(...lefts)
    }

    // A2→A3 and A4→A5 are both one octave. On a linear axis the upper pair
    // would be four times wider; on a log axis they match.
    const low  = await spreadOf(110, 220)
    const high = await spreadOf(440, 880)

    expect(low).toBeGreaterThan(0)
    expect(high).toBeCloseTo(low, 0)
  })

  it('gives each partial its own position rather than stacking them', async () => {
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([
            { hz: 440, level: 255 },
            { hz: 554.37, level: 230 },
            { hz: 659.26, level: 210 },
          ]) }
          active />
      )
    })

    const lefts = [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        Number.parseFloat(el.style.left))

    expect(lefts).toHaveLength(3)
    expect(new Set(lefts).size).toBe(3)
  })

  it('stacks labels that would otherwise overlap', async () => {
    // A close voicing puts its partials within a few percent of each other
    // even on a log axis, so position alone cannot separate the chips.
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([
            { hz: 440, level: 255 },
            { hz: 554.37, level: 230 },
            { hz: 659.26, level: 210 },
          ]) }
          active />
      )
    })

    const lanes = [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        Number(el.style.getPropertyValue('--lane')))

    expect(lanes).toHaveLength(3)
    expect(new Set(lanes).size).toBe(3)
  })

  it('keeps well-separated labels on one lane', async () => {
    // Three octaves apart: no stacking needed, so none is applied.
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([{ hz: 110, level: 255 }, { hz: 3520, level: 240 }]) }
          active />
      )
    })

    const lanes = [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        Number(el.style.getPropertyValue('--lane')))

    expect(lanes.every(lane =>
      lane === 0)).toBe(true)
  })
})
