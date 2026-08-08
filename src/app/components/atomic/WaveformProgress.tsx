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

/**
 * Builds one compact SVG path instead of mounting a DOM node for every bar.
 * The path is memoized, so playback updates only move the played clip edge.
 */
function waveformPath (bars: Float32Array): string {
  return Array.from(bars, (amplitude, index) => {
    const height = Math.max(0.01, Math.min(1, amplitude))
    const top    = (1 - height) / 2

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
  const clipId     = `${waveformId}-played`
  const loaded     = Boolean(externalBars?.length)
  const barCount   = loaded
    ? externalBars!.length
    : Math.max(1, Math.round(barCountProp ?? DEFAULT_BAR_COUNT))
  const path = useMemo(() =>
    loaded ? waveformPath(externalBars!) : '', [ externalBars, loaded ])
  const safeDuration = Math.max(0, duration)
  const position     = Math.max(0, Math.min(safeDuration, currentTime))
  const progress     = safeDuration > 0 ? position / safeDuration : 0
  const playedWidth  = progress * barCount

  return <div
    className={ `waveform-progress ${compact ? 'compact' : ''}` }
    data-loaded={ loaded || undefined }>
    <svg
      className='waveform-svg'
      aria-hidden='true'
      viewBox={ `0 0 ${barCount} 1` }
      preserveAspectRatio='none'
      focusable='false'>
      <defs>
        <path id={ waveformId } d={ path } />

        <clipPath id={ clipId }>
          <rect width={ playedWidth } height='1' />
        </clipPath>
      </defs>

      <use className='waveform-shape waveform-unplayed' href={ `#${waveformId}` } />

      <use
        className='waveform-shape waveform-played'
        href={ `#${waveformId}` }
        clipPath={ `url(#${clipId})` } />

      <line className='waveform-line waveform-unplayed' x1='0' x2={ barCount } y1='0.5' y2='0.5' />
      <line className='waveform-line waveform-played' x1='0' x2={ playedWidth } y1='0.5' y2='0.5' />
    </svg>

    <input
      className='waveform-input'
      aria-label='Seek'
      type='range'
      min={ 0 }
      max={ safeDuration }
      step='any'
      value={ position }
      disabled={ safeDuration === 0 }
      onChange={ event =>
        onSeek(event.currentTarget.valueAsNumber) } />
  </div>
}
