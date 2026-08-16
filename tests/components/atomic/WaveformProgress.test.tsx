import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WaveformProgress } from '../../../src/app/components/atomic/WaveformProgress'


describe('WaveformProgress', () => {
  it('uses an SVG waveform and a native range input', () => {
    const { container } = render(
      <WaveformProgress
        currentTime={25}
        duration={100}
        bars={new Float32Array([ 0.25, 0.5, 1 ])}
        onSeek={noop}
      />
    )

    const slider = screen.getByRole('slider', { name: 'Seek' })
    const svg = container.querySelector('svg.waveform-svg')
    const played = container.querySelector('line.waveform-line.waveform-played')

    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveValue('25')
    expect(svg).toHaveAttribute('viewBox', '0 0 3 1')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.waveform-progress')).toHaveAttribute('data-loaded')
    expect(container.querySelector('defs > path')).toHaveAttribute('d')
    expect(container.querySelectorAll('.waveform-beats')).toHaveLength(2)
    expect(played).toHaveAttribute('x2', '0.75')
  })

  it('starts as an SVG line until waveform data is available', () => {
    const { container } = render(
      <WaveformProgress
        currentTime={25}
        duration={100}
        onSeek={noop}
      />
    )

    expect(container.querySelector('.waveform-progress')).not.toHaveAttribute('data-loaded')
    expect(container.querySelector('path')).toHaveAttribute('d', '')
    expect(container.querySelector('line.waveform-unplayed')).toHaveAttribute('x2', '400')
  })

  it('draws ordinary beats and downbeats as separate compact paths', () => {
    const { container } = render(
      <WaveformProgress
        currentTime={ 0 }
        duration={ 100 }
        barCount={ 100 }
        markers={[
          { time: 25, strength: 0.7, source: 'beat', downbeat: false, bar: 1, beat: 1 },
          { time: 50, strength: 1, source: 'section', downbeat: true, bar: 2, beat: 0 },
        ]}
        onSeek={ noop }
      />
    )

    expect(container.querySelector('.waveform-beats:not(.waveform-downbeats)'))
      .toHaveAttribute('d', 'M25.000 0V1')
    expect(container.querySelector('.waveform-downbeats'))
      .toHaveAttribute('d', 'M50.000 0V1')
  })

  it('seeks continuously through the native control', () => {
    const onSeek = vi.fn()
    render(
      <WaveformProgress
        currentTime={0}
        duration={120}
        onSeek={onSeek}
      />
    )

    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), {
      target: { value: '42.5' },
    })

    expect(onSeek).toHaveBeenCalledWith(42.5)
  })

  it('disables seeking until a track duration is available', () => {
    render(
      <WaveformProgress
        currentTime={0}
        duration={0}
        onSeek={noop}
      />
    )

    expect(screen.getByRole('slider', { name: 'Seek' })).toBeDisabled()
  })
})

function noop () {}
