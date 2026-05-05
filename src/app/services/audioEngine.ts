/**
 * Standalone Web Audio playback engine (lazy singleton).
 *
 * Mostly superseded by the in-context graph in {@link AudioContext} but kept
 * for places that need a non-React handle to the analyzer or audio element
 * (e.g. legacy waveform routines). Constructs the AudioContext + AnalyserNode
 * on first use to avoid autoplay-policy issues.
 */
export class AudioEngine {
  private static instance: AudioEngine | null = null
  private audioContext:    AudioContext | null = null
  private analyser:        AnalyserNode | null = null
  private audioElement:    HTMLAudioElement | null = null

  private constructor () {}

  static getInstance (): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine()
    }
    return AudioEngine.instance
  }

  ensureContext (): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.connect(this.audioContext.destination)
    }
    return this.audioContext
  }

  getAnalyser (): AnalyserNode | null {
    this.ensureContext()
    return this.analyser
  }

  async loadAudio (url: string): Promise<HTMLAudioElement> {
    if (!this.audioElement) {
      this.audioElement = new Audio()
      this.audioElement.crossOrigin = 'anonymous'
    }

    this.ensureContext()

    if (this.audioContext && this.analyser) {
      const source = this.audioContext.createMediaElementSource(this.audioElement)
      source.connect(this.analyser)
    }

    this.audioElement.src = url
    await this.audioElement.load()
    return this.audioElement
  }

  async play (url?: string): Promise<void> {
    if (url && this.audioElement?.src !== url) {
      await this.loadAudio(url)
    }
    await this.audioElement?.play()
  }

  pause (): void {
    this.audioElement?.pause()
  }

  seek (time: number): void {
    if (this.audioElement) {
      this.audioElement.currentTime = time
    }
  }

  setVolume (volume: number): void {
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, volume))
    }
  }

  getCurrentTime (): number {
    return this.audioElement?.currentTime || 0
  }

  getDuration (): number {
    return this.audioElement?.duration || 0
  }

  isPlaying (): boolean {
    return this.audioElement ? !this.audioElement.paused : false
  }

  onTimeUpdate (callback: (time: number) => void): () => void {
    const handler = () =>
      callback(this.audioElement?.currentTime || 0)
    this.audioElement?.addEventListener('timeupdate', handler)
    return () =>
      this.audioElement?.removeEventListener('timeupdate', handler)
  }

  onEnded (callback: () => void): () => void {
    const handler = () =>
      callback()
    this.audioElement?.addEventListener('ended', handler)
    return () =>
      this.audioElement?.removeEventListener('ended', handler)
  }

  async getWaveformData (samples: number = 100): Promise<Float32Array> {
    if (!this.analyser || !this.audioElement) {
      return new Float32Array(samples)
    }

    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    return new Promise(resolve => {
      const draw = () => {
        this.analyser?.getByteFrequencyData(dataArray)

        const step = Math.floor(bufferLength / samples)
        const waveform = new Float32Array(samples)

        for (let i = 0; i < samples; i++) {
          waveform[i] = dataArray[i * step] / 255
        }

        resolve(waveform)
      }

      draw()
    })
  }

  drawWaveform (
    canvas: HTMLCanvasElement,
    waveformData: Float32Array,
    progress: number = 0,
    showProgress: boolean = true
  ): void {
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return

    const { width, height } = canvas
    const barWidth = width / waveformData.length
    const progressIndex = Math.floor(waveformData.length * progress)

    ctx.clearRect(0, 0, width, height)

    for (const [ index, value ] of waveformData.entries()) {
      const barHeight = value * height * 0.8
      const x = index * barWidth
      const y = (height - barHeight) / 2

      if (showProgress && index < progressIndex) {
        ctx.fillStyle = '#ff5500'
      }
      else {
        ctx.fillStyle = '#666666'
      }

      ctx.fillRect(x, y, barWidth - 1, barHeight)
    }
  }

  dispose (): void {
    this.audioElement?.pause()
    this.audioElement = null
    this.audioContext?.close().catch(console.error)
    this.audioContext = null
    this.analyser = null
  }
}
