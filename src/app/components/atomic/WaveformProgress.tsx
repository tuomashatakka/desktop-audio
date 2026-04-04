import { useRef, useMemo, useCallback, useEffect, useState } from 'react'


interface WaveformProgressProps {
  readonly currentTime: number
  readonly duration:    number
  readonly onSeek:      (time: number) => void
  readonly bars?:       Float32Array | null
  readonly barCount?:   number
  readonly compact?:    boolean
}

/** Fallback: deterministic natural-looking amplitude shape via stacked sines */
function generateFallbackBars (count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / count
    const v =
      0.50 * Math.abs(Math.sin(t * Math.PI * 3.1)) +
      0.28 * Math.abs(Math.sin(t * Math.PI * 7.4 + 0.8)) +
      0.15 * Math.abs(Math.sin(t * Math.PI * 13.7 + 2.1)) +
      0.07 * Math.abs(Math.sin(t * Math.PI * 29.3 + 0.3))
    return Math.max(0.07, Math.min(1, v))
  })
}

export function WaveformProgress ({
  currentTime,
  duration,
  onSeek,
  bars: externalBars = null,
  barCount: barCountProp,
  compact = false,
}: WaveformProgressProps) {
  const [ derivedBarCount, setDerivedBarCount ] = useState(barCountProp ?? 70)
  const barCount = barCountProp ?? derivedBarCount

  const fallbackBars = useMemo(() =>
    generateFallbackBars(barCount), [ barCount ])
  const bars = externalBars ?? fallbackBars
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (barCountProp !== undefined)
      return // external override — skip ResizeObserver

    const el = containerRef.current
    if (!el)
      return

    const ro = new ResizeObserver(([ entry ]) => {
      const w = entry.contentRect.width
      setDerivedBarCount(Math.max(1, Math.floor(w / 6)))
    })
    ro.observe(el)
    return () =>
      ro.disconnect()
  }, [ barCountProp ])

  const progress = duration > 0 ? currentTime / duration : 0

  const seekFromEvent = useCallback((clientX: number) => {
    if (!containerRef.current || !duration)
      return

    const rect = containerRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
  }, [ duration, onSeek ])

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    seekFromEvent(e.clientX)
  }, [ seekFromEvent ])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!duration)
      return

    const step = duration * 0.02
    if (e.key === 'ArrowRight')
      onSeek(Math.min(duration, currentTime + step))
    if (e.key === 'ArrowLeft')
      onSeek(Math.max(0, currentTime - step))
  }, [ duration, currentTime, onSeek ])

  return (
    <div
      ref={containerRef}
      className={`waveform-progress ${compact ? 'compact' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role='slider'
      aria-label='Seek'
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      tabIndex={0}
    >
      {Array.from(bars).map((amp, i) => {
        const played = i / bars.length < progress
        return (
          <span
            key={i}
            className={`wf-bar ${played ? 'played' : ''}`}
            style={{ '--amp': amp } as React.CSSProperties}
          />
        )
      })}
    </div>
  )
}
