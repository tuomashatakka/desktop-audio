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

  // Off by default: the mesh is wallpaper behind the chord lane, and a row of
  // note names over it was the clutter being removed.
  it('names nothing unless the notes are switched on', async () => {
    await act(async () => {
      render(<FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active />)
    })

    expect(document.querySelectorAll('.matrix-peak')).toHaveLength(0)
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
          active showNotes />
      )
    })

    const readout = screen.getByRole('region', { name: 'Frequency spectrum' })
    expect(readout.textContent).toContain('A4')
    expect(readout.textContent).toContain('C♯5')
    expect(readout.textContent).toContain('E5')
  })

  it('shows the frequency beside the note', async () => {
    await act(async () => {
      render(<FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active showNotes />)
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
          active showNotes />
      )
    })

    const readout = screen.getByRole('region', { name: 'Frequency spectrum' })
    expect(readout.textContent).toContain('E2')
    expect(readout.textContent).toContain('B2')
  })

  it('paints the mesh even before a frame is granted', () => {
    // requestAnimationFrame is suspended while a window is hidden or
    // occluded. The panel has to open showing a mesh, not an empty box.
    vi.stubGlobal('requestAnimationFrame', () =>
      0)

    const { container } = render(
      <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active showNotes />
    )

    // The frequency geometry lives on the shared `<path>`; the two `<use>`s
    // that paint it near and far both reference it.
    expect(container.querySelector('#matrix-freq')?.getAttribute('d')).toBeTruthy()
    expect(container.querySelector('.matrix-line-z')?.getAttribute('d')).toBeTruthy()
  })

  it('renders a resting mesh with no analyser at all', () => {
    const { container } = render(<FrequencyMatrix analyzer={ null } active showNotes />)

    expect(container.querySelector('#matrix-freq')?.getAttribute('d')).toBeTruthy()
    expect(screen.queryByText(/Hz$/)).toBeNull()
  })

  it('runs no loop while inactive', () => {
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)

    render(<FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active={ false } />)

    expect(raf).not.toHaveBeenCalled()
  })

  it('keeps the mesh to three paths regardless of grid size', () => {
    const { container } = render(
      <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active showNotes />
    )

    // The whole point of the rewrite: one path per direction, not one per row.
    // The third is the newest row, split out so the depth mask and the blur
    // cannot reach it. The depth of field adds `<use>`s, not geometry.
    expect(container.querySelectorAll('path')).toHaveLength(3)
    expect(container.querySelectorAll('use')).toHaveLength(2)
  })

  /**
   * Later subpaths paint over earlier ones, so the emission order *is* the
   * depth order. Walking forward drew the oldest, faintest row over everything
   * in front of it.
   */
  it('emits the history oldest first, so near rows paint in front', async () => {
    let container!: HTMLElement

    await act(async () => {
      ({ container } = render(
        <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active showNotes />
      ))
    })

    // Rows recede *upward*, so a row's baseline Y shrinks with its age. Emitting
    // oldest first therefore has to come out ascending — and because later
    // subpaths paint over earlier ones, that is also what puts the near rows in
    // front of the far ones.
    const history = container.querySelector('#matrix-freq')?.getAttribute('d') ?? ''

    const baselines = history
      .split('M')
      .slice(1)
      .map(subpath =>
        Number(subpath.split(',')[1]?.split('L')[0]))

    expect(baselines.length).toBeGreaterThan(1)
    expect([ ...baselines ].sort((a, b) =>
      a - b)).toEqual(baselines)
  })

  /*
   * The whole point of the flip: the live edge is the nearest thing on screen,
   * with every older slice behind and above it. It used to be the other way
   * round, which put the faintest, oldest data closest to the viewer.
   */
  it('draws the current row in front of, and below, all its history', async () => {
    let container!: HTMLElement

    await act(async () => {
      ({ container } = render(
        <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active showNotes />
      ))
    })

    const firstY = (selector: string) => {
      const d = container.querySelector(selector)?.getAttribute('d') ?? ''
      return Number(d.split('M')[1]?.split(',')[1]?.split('L')[0])
    }

    const history = (container.querySelector('#matrix-freq')?.getAttribute('d') ?? '')
      .split('M')
      .slice(1)
      .map(subpath =>
        Number(subpath.split(',')[1]?.split('L')[0]))

    expect(firstY('.matrix-current')).toBeGreaterThan(Math.max(...history))

    // …and it is the last element painted, so nothing covers it.
    const painted = [ ...container.querySelectorAll('svg > *') ]
    expect(painted.at(-1)).toHaveClass('matrix-current')
  })

  it('closes the current row so it can carry a fill, like the EQ curve', async () => {
    let container!: HTMLElement

    await act(async () => {
      ({ container } = render(
        <FrequencyMatrix analyzer={ analyserFor([{ hz: 440, level: 255 }]) } active showNotes />
      ))
    })

    expect(container.querySelector('.matrix-current')?.getAttribute('d')).toMatch(/Z$/)
  })

  it('places an octave the same distance apart in any register', async () => {
    /** Label positions, left to right, for one pair of pitches. */
    const spreadOf = async (low: number, high: number) => {
      const view = render(
        <FrequencyMatrix
          analyzer={ analyserFor([{ hz: low, level: 255 }, { hz: high, level: 240 }]) }
          active showNotes />
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
          active showNotes />
      )
    })

    const lefts = [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        Number.parseFloat(el.style.left))

    expect(lefts).toHaveLength(3)
    expect(new Set(lefts).size).toBe(3)
  })

  /** Label positions, left to right, as percentages of the mesh's width. */
  function labelPositions (): number[] {
    return [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        Number.parseFloat(el.style.left))
      .sort((a, b) =>
        a - b)
  }

  it('spreads labels that would otherwise overlap along the row', async () => {
    // A close voicing puts its partials within a few percent of each other
    // even on a log axis, so position alone cannot separate the names. They
    // are nudged sideways rather than stacked: vertical position in this
    // component already means age.
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([
            { hz: 440, level: 255 },
            { hz: 554.37, level: 230 },
            { hz: 659.26, level: 210 },
          ]) }
          active showNotes />
      )
    })

    const positions = labelPositions()

    expect(positions).toHaveLength(3)
    expect(new Set(positions).size).toBe(3)

    // None of them takes a second row — `top` is not data any more.
    const tops = [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        el.style.top)

    expect(new Set(tops).size).toBe(1)
  })

  it('leaves well-separated labels where their own frequency puts them', async () => {
    // Three octaves apart: no nudging needed, so none is applied and the gap
    // between them stays the honest one.
    await act(async () => {
      render(
        <FrequencyMatrix
          analyzer={ analyserFor([{ hz: 110, level: 255 }, { hz: 3520, level: 240 }]) }
          active showNotes />
      )
    })

    // Five octaves of a nine-octave axis, drawn across the mesh's half-width:
    // comfortably more than the minimum gap, so nothing is nudged.
    const [ low, high ] = labelPositions()

    expect(high! - low!).toBeGreaterThan(20)
  })

  /**
   * A named peak outlives the tick that found it. It used to be replaced
   * wholesale every 160 ms, so a note dropping out of the top three vanished
   * instantly and the readout flickered instead of reading.
   */
  it('holds a label after its peak stops being one of the loudest', async () => {
    const loud = analyserFor([{ hz: 440, level: 255 }, { hz: 880, level: 240 }])
    const { rerender } = render(<FrequencyMatrix analyzer={ loud } active showNotes />)

    await act(async () => {
      rerender(<FrequencyMatrix analyzer={ loud } active showNotes />)
    })

    const named = [ ...document.querySelectorAll('.matrix-peak dt') ]
      .map(el =>
        el.textContent)

    expect(named).toContain('A4')
    expect(named).toContain('A5')

    // Every held label carries a fade, and a just-heard one is at full strength.
    const fades = [ ...document.querySelectorAll<HTMLElement>('.matrix-peak') ]
      .map(el =>
        Number(el.style.getPropertyValue('--peak-fade')))

    expect(fades.every(fade =>
      fade > 0 && fade <= 1)).toBe(true)
  })
})
