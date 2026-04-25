import { AudioProvider, useAudio } from '../../src/app/contexts/AudioContext'
import type { Track } from '../../src/app/services/types'
import { render, act, screen } from '@testing-library/react'

const mockTrack: Track = {
  id: 'track-1',
  path: '/music/test.mp3',
  title: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  duration: 180,
  format: 'MP3',
  size: 69,
  coverColor: 'hsl(300, 65%, 38%)',
}

function TestConsumer () {
  const {
    isPlaying,
    currentTime,
    duration,
    currentTrack,
    volume,
    isLoading,
    play,
    pause,
    resume,
    stop,
    seek,
    setVolume,
    playNext,
    playPrevious,
  } = useAudio()

  const tracks: Track[] = [mockTrack]

  return (
    <div>
      <span data-testid='playing'>{isPlaying.toString()}</span>
      <span data-testid='time'>{currentTime.toString()}</span>
      <span data-testid='duration'>{duration.toString()}</span>
      <span data-testid='track'>{currentTrack?.title ?? 'null'}</span>
      <span data-testid='vol'>{volume.toString()}</span>
      <span data-testid='loading'>{isLoading.toString()}</span>
      <button onClick={() => play(mockTrack)}>play</button>
      <button onClick={pause}>pause</button>
      <button onClick={resume}>resume</button>
      <button onClick={stop}>stop</button>
      <button onClick={() => seek(60)}>seek</button>
      <button onClick={() => setVolume(0.5)}>setVolume</button>
      <button onClick={() => playNext(tracks)}>next</button>
      <button onClick={() => playPrevious(tracks)}>prev</button>
    </div>
  )
}

describe('AudioContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('provides default values', () => {
    render(
      <AudioProvider>
        <TestConsumer />
      </AudioProvider>
    )

    expect(screen.getByTestId('playing')).toHaveTextContent('false')
    expect(screen.getByTestId('time')).toHaveTextContent('0')
    expect(screen.getByTestId('duration')).toHaveTextContent('0')
    expect(screen.getByTestId('track')).toHaveTextContent('null')
    expect(screen.getByTestId('vol')).toHaveTextContent('0.8')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('setVolume updates volume', async () => {
    render(
      <AudioProvider>
        <TestConsumer />
      </AudioProvider>
    )

    await act(async () => {
      screen.getByText('setVolume').click()
    })

    expect(screen.getByTestId('vol')).toHaveTextContent('0.5')
  })

  it('setVolume clamps volume between 0 and 1', async () => {
    render(
      <AudioProvider>
        <TestConsumer />
      </AudioProvider>
    )

    await act(async () => {
      screen.getByText('setVolume').click()
    })

    const vol = parseFloat(screen.getByTestId('vol').textContent || '0')
    expect(vol).toBeGreaterThanOrEqual(0)
    expect(vol).toBeLessThanOrEqual(1)
  })

  it('throws error when useAudio is used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<TestConsumer />)).toThrow('useAudio must be used within AudioProvider')

    consoleError.mockRestore()
  })
})
