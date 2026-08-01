import { useEffect, useRef } from 'react'
import { useAudio } from '../../contexts'
import { noop } from '../../utils/noop'


export function Waveform () {
  const { isPlaying, analyzer } = useAudio()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  useEffect(() => {
    // Every path returns a cleanup so the effect's return type stays uniform.
    const canvas = canvasRef.current
    if (!canvas || !analyzer)
      return noop

    const ctx = canvas.getContext('2d')
    if (!ctx)
      return noop

    const bufferLength = analyzer.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      if (!isPlaying) {
        animationRef.current = null
        return
      }

      const { width, height } = canvas.parentElement?.getBoundingClientRect() || { width: 300, height: 100 }
      canvas.height = height - 48
      canvas.width = width - 48

      animationRef.current = requestAnimationFrame(draw)
      analyzer.getByteFrequencyData(dataArray)

      ctx.fillStyle = 'rgba(18, 18, 18, 0.3)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = canvas.width / bufferLength * 2.5
      // eslint-disable-next-line functional/no-let
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 255 * canvas.height * 0.9

        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height)
        gradient.addColorStop(0, '#ff5500')
        gradient.addColorStop(1, '#ff7733')

        ctx.fillStyle = gradient
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight)

        x += barWidth
      }
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [ analyzer, isPlaying ])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={100}
      className='waveform'
    />
  )
}
