import { AudioProvider, useAudio } from '../../src/app/contexts/AudioContext'
import type { Track } from '../../src/app/services/types'
import { render, act, screen } from '@testing-library/react'
import { HostProvider } from '../../src/app/data/HostContext'
import { DataProvider } from '../../src/app/data/DataContext'
import type { HostBridge, DataSource } from '../../src/app/data'

const mockHost: HostBridge = {
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  isMaximized: vi.fn(),
  onMediaPlayPause: vi.fn(() => () => {}),
  onMediaNext: vi.fn(() => () => {}),
  onMediaPrev: vi.fn(() => () => {}),
  showContextMenu: vi.fn(),
  hideContextMenu: vi.fn(),
  onContextMenuAction: vi.fn(() => () => {}),
  updateMediaState: vi.fn(),
  onMediaSeek: vi.fn(() => () => {}),
}

const mockDataSource: DataSource = {
  addRoot: vi.fn(),
  removeRoot: vi.fn(),
  listRoots: vi.fn(),
  scan: vi.fn(),
  load: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  readBytes: vi.fn(),
  readMetadata: vi.fn(),
  // A current track pulls its full-size art for the OS media session.
  readArtwork: vi.fn(async () => null),
  upsertTrack: vi.fn(),
  deleteTrack: vi.fn(),
}

function wrapWithProviders(ui: React.ReactNode) {
  return (
    <HostProvider value={mockHost}>
      <DataProvider value={mockDataSource}>
        {ui}
      </DataProvider>
    </HostProvider>
  )
}

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

/** Three tracks so next/previous have somewhere to go. */
const album: Track[] = [
  mockTrack,
  { ...mockTrack, id: 'track-2', title: 'Second' },
  { ...mockTrack, id: 'track-3', title: 'Third' },
]

const extraTrack: Track = { ...mockTrack, id: 'track-4', title: 'Fourth' }

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
    playQueue,
    enqueue,
    queue,
    queueIndex,
  } = useAudio()

  return (
    <div>
      <span data-testid='playing'>{isPlaying.toString()}</span>
      <span data-testid='time'>{currentTime.toString()}</span>
      <span data-testid='duration'>{duration.toString()}</span>
      <span data-testid='track'>{currentTrack?.title ?? 'null'}</span>
      <span data-testid='vol'>{volume.toString()}</span>
      <span data-testid='loading'>{isLoading.toString()}</span>
      <span data-testid='queue'>{queue.map(t => t.id).join(',') || 'empty'}</span>
      <span data-testid='queue-index'>{queueIndex.toString()}</span>
      <button onClick={() => play(mockTrack)}>play</button>
      <button onClick={pause}>pause</button>
      <button onClick={resume}>resume</button>
      <button onClick={stop}>stop</button>
      <button onClick={() => seek(60)}>seek</button>
      <button onClick={() => setVolume(0.5)}>setVolume</button>
      <button onClick={playNext}>next</button>
      <button onClick={playPrevious}>prev</button>
      <button onClick={() => playQueue(album, 1)}>playQueue</button>
      <button onClick={() => enqueue([extraTrack])}>enqueue</button>
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
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
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
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    await act(async () => {
      screen.getByText('setVolume').click()
    })

    expect(screen.getByTestId('vol')).toHaveTextContent('0.5')
  })

  it('setVolume clamps volume between 0 and 1', async () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
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

  it('starts with an empty queue and no position in it', () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    expect(screen.getByTestId('queue')).toHaveTextContent('empty')
    expect(screen.getByTestId('queue-index')).toHaveTextContent('-1')
  })

  it('playQueue takes the whole list and starts where it was told', async () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    await act(async () => {
      screen.getByText('playQueue').click()
    })

    expect(screen.getByTestId('queue')).toHaveTextContent('track-1,track-2,track-3')
    expect(screen.getByTestId('queue-index')).toHaveTextContent('1')
    expect(screen.getByTestId('track')).toHaveTextContent('Second')
  })

  it('next and previous walk the queue that was handed over', async () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    await act(async () => {
      screen.getByText('playQueue').click()
    })

    await act(async () => {
      screen.getByText('next').click()
    })
    expect(screen.getByTestId('track')).toHaveTextContent('Third')

    await act(async () => {
      screen.getByText('prev').click()
    })
    expect(screen.getByTestId('track')).toHaveTextContent('Second')
  })

  it('stops at the end of the queue with repeat off', async () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    await act(async () => {
      screen.getByText('playQueue').click()
    })
    await act(async () => {
      screen.getByText('next').click()
    })

    // Already on the last track; there is nowhere further to go.
    await act(async () => {
      screen.getByText('next').click()
    })

    expect(screen.getByTestId('queue-index')).toHaveTextContent('2')
    expect(screen.getByTestId('track')).toHaveTextContent('Third')
  })

  it('a bare play is a queue of one, so next has nowhere to go', async () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    await act(async () => {
      screen.getByText('play').click()
    })

    expect(screen.getByTestId('queue')).toHaveTextContent('track-1')
    expect(screen.getByTestId('queue-index')).toHaveTextContent('0')
  })

  it('enqueue appends without disturbing the current position', async () => {
    render(
      wrapWithProviders(
        <AudioProvider>
          <TestConsumer />
        </AudioProvider>
      )
    )

    await act(async () => {
      screen.getByText('playQueue').click()
    })
    await act(async () => {
      screen.getByText('enqueue').click()
    })

    expect(screen.getByTestId('queue')).toHaveTextContent('track-1,track-2,track-3,track-4')
    expect(screen.getByTestId('queue-index')).toHaveTextContent('1')
    expect(screen.getByTestId('track')).toHaveTextContent('Second')
  })
})
