import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Player } from '../../../src/app/components/composite/Player'


const setView = vi.fn()
const setVolume = vi.fn()
const toggleWindowScale = vi.fn()

const track = {
  id: 'track-1',
  path: '/music/song.mp3',
  title: 'One Song',
  artist: 'One Artist',
  album: 'One Album',
  duration: 225,
  albumArt: 'data:image/png;base64,art',
}

const audio = {
  currentTrack: track,
  isPlaying: true,
  currentTime: 65,
  duration: 225,
  volume: 0.8,
  waveformBars: null,
  pause: vi.fn(),
  resume: vi.fn(),
  seek: vi.fn(),
  setVolume,
  playNext: vi.fn(),
  playPrevious: vi.fn(),
}

vi.mock('../../../src/app/contexts', () => ({
  useUI: () => ({ setView }),
  useAudio: () => audio,
  useLibrary: () => ({ filteredTracks: [ track ] }),
}))

vi.mock('../../../src/app/hooks', () => ({
  useWindowScale: () => toggleWindowScale,
}))

vi.mock('../../../src/app/components/atomic/WaveformProgress', () => ({
  WaveformProgress: () => <div role='slider' aria-label='Seek' />,
}))

describe('Player', () => {
  beforeEach(() => {
    audio.currentTrack = track
    audio.isPlaying = true
  })

  it('renders one semantic player tree with machine-readable times', () => {
    render(<Player />)

    const player = screen.getByRole('article', { name: 'Now playing: One Song' })
    expect(within(player).getByRole('heading', { name: 'One Song' })).toBeInTheDocument()
    expect(within(player).getByRole('figure')).toBeInTheDocument()
    expect(within(player).getByRole('slider', { name: 'Seek' })).toBeInTheDocument()
    expect(within(player).getByText('1:05')).toHaveAttribute('datetime', 'PT1M5S')
    expect(within(player).getByText('3:45')).toHaveAttribute('datetime', 'PT3M45S')
  })

  it('opens now playing without remounting a second player', () => {
    const { container } = render(<Player />)

    fireEvent.click(screen.getByRole('button', { name: 'Open now playing' }))

    expect(setView).toHaveBeenCalledWith('player')
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })

  it('names transport and volume controls from their actions', () => {
    render(<Player />)

    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mute' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('0.8')
  })

  it('keeps the same tree in its empty state and disables playback actions', () => {
    audio.currentTrack = null
    audio.isPlaying = false
    const { container } = render(<Player />)

    expect(screen.getByRole('article', { name: 'Player' })).toHaveAttribute('data-empty', '')
    expect(screen.getByRole('heading', { name: 'Nothing playing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open now playing' })).toBeDisabled()
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })
})
