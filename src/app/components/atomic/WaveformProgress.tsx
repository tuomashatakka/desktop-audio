import { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import { noop } from '../../utils/noop'


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
  const containerRef = useRef<HTMLDivElement>(null)
  const [ containerWidth, setContainerWidth ] = useState(0)
  const [ animatedBars, setAnimatedBars ] = useState<Float32Array | null>(null)

  // Calculate bar count based on container width for responsive display
  const computedBarCount = barCountProp ?? (containerWidth > 0
    ? Math.min(400, Math.max(50, Math.floor(containerWidth / 3)))
    : 400)

  const fallbackBars = useMemo(() =>
    new Float32Array(generateFallbackBars(computedBarCount)), [ computedBarCount ])

  const bars = animatedBars ?? externalBars ?? fallbackBars

  // Animate bars in when data loads
  useEffect(() => {
    if (!externalBars || animatedBars)
      return

    // Start with zero height and animate to full amplitude
    const zeroBars = new Float32Array(externalBars.length).fill(0)
    setAnimatedBars(zeroBars)

    const animationDuration = 300
    const startTime = performance.now()
    const startBars = zeroBars
    const targetBars = externalBars

    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(1, elapsed / animationDuration)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)

      const newBars = new Float32Array(startBars.length)
      for (const [ i, startBar ] of startBars.entries()) {
        newBars[i] = startBar + (targetBars[i] - startBar) * eased
      }

      setAnimatedBars(newBars)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
      else {
        setAnimatedBars(null) // Use the real bars directly
      }
    }

    requestAnimationFrame(animate)
  }, [ externalBars ])

  const progress = duration > 0 ? currentTime / duration : 0

  // Measure container width for responsive bar count
  useEffect(() => {
    // Every path returns a cleanup so the effect's return type stays uniform.
    if (!containerRef.current)
      return noop

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
    }
  }, [])

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
      style={{ '--bar-count': computedBarCount } as React.CSSProperties}
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
