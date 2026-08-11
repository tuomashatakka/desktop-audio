import { describe, expect, it } from 'vitest'
import { findPeaks, formatHz, frequencyToPitch } from '../../src/app/utils/pitch'


describe('frequencyToPitch', () => {
  it('names concert pitch exactly', () => {
    expect(frequencyToPitch(440)).toMatchObject({ name: 'A', octave: 4, cents: 0, label: 'A4' })
  })

  it('names notes across the register', () => {
    // Ground truth from equal temperament at A4 = 440.
    expect(frequencyToPitch(261.6256)?.label).toBe('C4')
    expect(frequencyToPitch(82.4069)?.label).toBe('E2')
    expect(frequencyToPitch(1046.502)?.label).toBe('C6')
    expect(frequencyToPitch(554.3653)?.label).toBe('C♯5')
  })

  it('reports how far off the tempered pitch a reading is', () => {
    expect(frequencyToPitch(440 * 2 ** (0.4 / 12))?.cents).toBe(40)
    expect(frequencyToPitch(442)?.cents).toBe(8)
    expect(frequencyToPitch(438)?.cents).toBe(-8)
  })

  it('picks a side at the quarter-tone, where either name is equally true', () => {
    // Exactly between A4 and A♯4. Which one it lands on is arbitrary; that it
    // reports the full half-semitone of deviation is not.
    expect(Math.abs(frequencyToPitch(440 * 2 ** (0.5 / 12))!.cents)).toBe(50)
  })

  it('rejects frequencies that cannot be a pitch', () => {
    expect(frequencyToPitch(0)).toBeNull()
    expect(frequencyToPitch(-100)).toBeNull()
    expect(frequencyToPitch(Number.NaN)).toBeNull()
  })
})

describe('findPeaks', () => {
  const SAMPLE_RATE = 44100
  const FFT_SIZE    = 4096

  /** Bins for a tone at `hz`, spread over its neighbours like a real FFT. */
  function spectrum (tones: readonly { hz: number; level: number }[]): Uint8Array {
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
    return bins
  }

  it('recovers a tone to within a few cents of its true frequency', () => {
    const peaks = findPeaks(spectrum([{ hz: 440, level: 255 }]), SAMPLE_RATE, FFT_SIZE)

    expect(peaks).toHaveLength(1)

    // A bin is ~10.8 Hz wide, so reading the bin centre could be 20+ cents
    // out. The residual here is the triangular test peak — a real windowed
    // sinusoid is closer to the parabola the estimator assumes — and 2 Hz at
    // 440 is under 8 cents, comfortably inside the right note.
    expect(Math.abs(peaks[0].hz - 440)).toBeLessThan(2)
    expect(frequencyToPitch(peaks[0].hz)?.label).toBe('A4')
  })

  it('finds several partials and orders them by strength', () => {
    const peaks = findPeaks(
      spectrum([
        { hz: 440, level: 200 },
        { hz: 659.26, level: 255 },
        { hz: 880, level: 150 },
      ]),
      SAMPLE_RATE,
      FFT_SIZE
    )

    expect(peaks.map(p =>
      frequencyToPitch(p.hz)?.label)).toEqual([ 'E5', 'A4', 'A5' ])
  })

  it('does not name the same partial twice from adjacent bins', () => {
    // One tone smeared across bins must yield one peak, not three.
    const peaks = findPeaks(spectrum([{ hz: 440, level: 255 }]), SAMPLE_RATE, FFT_SIZE, 3)
    expect(peaks).toHaveLength(1)
  })

  it('ignores the noise floor', () => {
    const quiet = new Uint8Array(FFT_SIZE / 2).fill(20)
    quiet[100]  = 40

    expect(findPeaks(quiet, SAMPLE_RATE, FFT_SIZE)).toEqual([])
  })

  it('honours the limit', () => {
    const peaks = findPeaks(
      spectrum([
        { hz: 220, level: 255 }, { hz: 440, level: 250 },
        { hz: 660, level: 245 }, { hz: 880, level: 240 },
      ]),
      SAMPLE_RATE, FFT_SIZE, 2
    )

    expect(peaks).toHaveLength(2)
  })
})

describe('formatHz', () => {
  it('switches to kHz where the digits stop being useful', () => {
    expect(formatHz(440)).toBe('440 Hz')
    expect(formatHz(82.41)).toBe('82 Hz')
    expect(formatHz(1234)).toBe('1.23 kHz')
  })
})
