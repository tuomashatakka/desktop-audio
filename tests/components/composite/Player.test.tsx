import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Player } from '../../../src/app/components/composite/Player'


const openOverlay = vi.fn()
const closeOverlay = vi.fn()
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

const settings = {
  shuffle: false,
  setShuffle: vi.fn(),
  repeatMode: 'none' as const,
  setRepeatMode: vi.fn(),
}

vi.mock('../../../src/app/contexts', () => ({
  useUI: () => ({ openOverlay, closeOverlay }),
  useAudio: () => audio,
  useSettings: () => settings,
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

  it('opens the now-playing overlay from the bar without remounting a second player', () => {
    const { container } = render(<Player />)

    fireEvent.click(screen.getByRole('button', { name: 'Open now playing' }))

    expect(openOverlay).toHaveBeenCalledWith('player')
    expect(container.querySelectorAll('.player-view')).toHaveLength(1)
  })

  it('drops the promote button in the overlay, where it would be redundant', () => {
    render(<Player expanded />)

    expect(screen.queryByRole('button', { name: 'Open now playing' })).toBeNull()
  })

  it('names transport controls from their actions', () => {
    render(<Player />)

    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has no volume control — the footer bar and system volume already own that', () => {
    render(<Player />)

    expect(screen.queryByRole('slider', { name: 'Volume' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mute' })).not.toBeInTheDocument()
  })

  it('has a close button in the overlay, and none in the bar', () => {
    const { unmount } = render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Close player' }))
    expect(closeOverlay).toHaveBeenCalled()
    unmount()

    render(<Player />)
    expect(screen.queryByRole('button', { name: 'Close player' })).toBeNull()
  })

  it('names the playback modes by their current state, not their icon', () => {
    render(<Player />)

    expect(screen.getByRole('button', { name: 'Shuffle off' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Repeat off' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Shuffle off' }))
    expect(settings.setShuffle).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Repeat off' }))
    expect(settings.setRepeatMode).toHaveBeenCalledWith('all')
  })

  it('swaps the transport for lyrics on demand, in the overlay only', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show lyrics' }))

    expect(screen.getByRole('region', { name: 'Lyrics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show album art' })).toBeInTheDocument()
  })

  it('shows the frequency spectrum, and only one panel at a time', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show frequency spectrum' }))
    expect(screen.getByRole('region', { name: 'Frequency spectrum' })).toBeInTheDocument()

    // Lyrics and the spectrum claim the same space, so asking for one has to
    // put the other away rather than stacking them.
    fireEvent.click(screen.getByRole('button', { name: 'Show lyrics' }))
    expect(screen.getByRole('region', { name: 'Lyrics' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Frequency spectrum' })).toBeNull()
  })

  it('returns to the artwork when the active mode is clicked again', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show frequency spectrum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show album art' }))

    expect(screen.queryByRole('region', { name: 'Frequency spectrum' })).toBeNull()
  })

  it('offers neither panel in the footer bar, which has nowhere to put them', () => {
    render(<Player />)

    expect(screen.queryByRole('button', { name: 'Show frequency spectrum' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show lyrics' })).toBeNull()
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
