import { useId, useMemo } from 'react'


interface WaveformProgressProps {
  readonly currentTime: number
  readonly duration:    number
  readonly onSeek:      (time: number) => void
  readonly bars?:       Float32Array | null
  readonly barCount?:   number
  readonly compact?:    boolean
}

const DEFAULT_BAR_COUNT = 400

/** Fallback: deterministic natural-looking amplitude shape via stacked sines. */
function generateFallbackBars (count: number): Float32Array {
  return Float32Array.from({ length: count }, (_, index) => {
    const time = index / count
    const amplitude =
      0.50 * Math.abs(Math.sin(time * Math.PI * 3.1)) +
      0.28 * Math.abs(Math.sin(time * Math.PI * 7.4 + 0.8)) +
      0.15 * Math.abs(Math.sin(time * Math.PI * 13.7 + 2.1)) +
      0.07 * Math.abs(Math.sin(time * Math.PI * 29.3 + 0.3))

    return Math.max(0.07, Math.min(1, amplitude))
  })
}

/**
 * Builds one compact SVG path instead of mounting a DOM node for every bar.
 * The path is memoized, so playback updates only move the played clip edge.
 */
function waveformPath (bars: Float32Array): string {
  return Array.from(bars, (amplitude, index) => {
    const height = Math.max(0.01, Math.min(1, amplitude))
    const top = (1 - height) / 2

    return `M${index} ${top.toFixed(3)}h1v${height.toFixed(3)}h-1z`
  }).join('')
}

export function WaveformProgress ({
  currentTime,
  duration,
  onSeek,
  bars: externalBars = null,
  barCount: barCountProp,
  compact = false,
}: WaveformProgressProps) {
  const waveformId = useId()
  const clipId = `${waveformId}-played`
  const fallbackBarCount = Math.max(1, Math.round(barCountProp ?? DEFAULT_BAR_COUNT))
  const fallbackBars = useMemo(
    () =>
      generateFallbackBars(fallbackBarCount),
    [ fallbackBarCount ]
  )
  const bars = externalBars?.length ? externalBars : fallbackBars
  const path = useMemo(() =>
    waveformPath(bars), [ bars ])
  const safeDuration = Math.max(0, duration)
  const position = Math.max(0, Math.min(safeDuration, currentTime))
  const progress = safeDuration > 0 ? position / safeDuration : 0
  const playedWidth = progress * bars.length

  return (
    <div className={`waveform-progress ${compact ? 'compact' : ''}`}>
      <svg
        className='waveform-svg'
        viewBox={`0 0 ${bars.length} 1`}
        preserveAspectRatio='none'
        aria-hidden='true'
        focusable='false'
      >
        <defs>
          <path id={waveformId} d={path} />

          <clipPath id={clipId}>
            <rect width={playedWidth} height='1' />
          </clipPath>
        </defs>

        <use className='waveform-shape waveform-unplayed' href={`#${waveformId}`} />

        <use
          className='waveform-shape waveform-played'
          href={`#${waveformId}`}
          clipPath={`url(#${clipId})`}
        />

        <rect className='waveform-line waveform-unplayed' width={bars.length} height='1' />
        <rect className='waveform-line waveform-played' width={playedWidth} height='1' />
      </svg>

      <input
        className='waveform-input'
        type='range'
        min={0}
        max={safeDuration}
        step='any'
        value={position}
        aria-label='Seek'
        disabled={safeDuration === 0}
        onChange={event =>
          onSeek(event.currentTarget.valueAsNumber)}
      />
    </div>
  )
}
