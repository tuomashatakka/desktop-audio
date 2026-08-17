import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { Player } from '../../../src/app/components/composite/Player'
import { DEFAULT_DSP } from '../../../src/app/services/dspChain'
import type { PlayerMode } from '../../../src/app/contexts/UIContext'


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
  analyzer: null,
  reductionOf: () => 0,
}

const analysisState = {
  analysis: {
    version:  1,
    duration: 225,
    tempo:    { bpm: 120, confidence: 0.9 },
    key:      { tonic: 'C', scale: 'major' as const, label: 'C major', confidence: 0.9 },
    beats:    [
      { time: 0, strength: 1, source: 'section' as const, downbeat: true, bar: 0, beat: 0 },
    ],
    chords:  [],
    warnings: [],
  },
  status: 'ready' as const,
  error:  null,
}

const settings = {
  shuffle: false,
  setShuffle: vi.fn(),
  repeatMode: 'none' as const,
  setRepeatMode: vi.fn(),
  dsp: DEFAULT_DSP,
  updateDsp: vi.fn(),
  showBeatMarkers: true,
  showChordAnalysis: true,
  showKeyAnalysis: true,
}

/**
 * Only the three hooks are replaced — the DSP constants and combinators the
 * panel imports from the same barrel stay real, so this mock does not have to
 * grow a stub every time one is added.
 *
 * `useUI` has to be *stateful*: `playerMode` and `lyricsOpen` moved out of
 * `Player` and into `UIContext`, so a frozen object would leave every button
 * up there a no-op.
 */
vi.mock('../../../src/app/contexts', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/app/contexts')>(),
  useUI: () => {
    const [ playerMode, setPlayerMode ] = useState<PlayerMode>('default')
    const [ lyricsOpen, setLyricsOpen ] = useState(false)

    return {
      openOverlay,
      closeOverlay,
      playerMode,
      setPlayerMode,
      lyricsOpen,
      toggleLyrics: () =>
        setLyricsOpen(open =>
          !open),
    }
  },
  useAudio: () => audio,
  useSettings: () => settings,
}))

vi.mock('../../../src/app/hooks', () => ({
  useTrackAnalysis: () => analysisState,
  useWindowScale:   () => toggleWindowScale,
  useLyricsScroll:  () => ({ current: null }),
}))

vi.mock('../../../src/app/components/atomic/WaveformProgress', () => ({
  WaveformProgress: ({ markers }: { markers?: readonly unknown[] }) =>
    <div role='slider' aria-label='Seek' data-marker-count={ markers?.length ?? 0 } />,
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

  /*
   * The lyrics layer is mounted the whole time — `display` is what animates it
   * in and out, and an unmounted element has nothing to animate — so it is
   * `aria-hidden` while closed rather than absent. Being unreachable by role is
   * the assertion; the element being in the DOM is an implementation detail.
   */
  it('keeps the lyrics out of the accessibility tree until they are asked for', () => {
    render(<Player expanded />)

    expect(screen.queryByRole('region', { name: 'Lyrics' })).toBeNull()
  })

  it('lays the lyrics over the player without taking the transport away', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show lyrics' }))

    // A layer, not a mode: what it used to replace is still on screen.
    expect(screen.getByRole('region', { name: 'Lyrics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide lyrics' })).toBeInTheDocument()
  })

  it('stacks the lyrics over whichever mode is showing', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show frequency spectrum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show lyrics' }))

    expect(screen.getByRole('region', { name: 'Frequency spectrum' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lyrics' })).toBeInTheDocument()
  })

  it('shows the frequency spectrum, and only one panel at a time', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show frequency spectrum' }))
    expect(screen.getByRole('region', { name: 'Frequency spectrum' })).toBeInTheDocument()

    // The modes claim the same space, so asking for one has to put the other
    // away rather than stacking them.
    fireEvent.click(screen.getByRole('button', { name: 'Show audio processing' }))
    expect(screen.getByRole('region', { name: 'Audio processing' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Frequency spectrum' })).toBeNull()
  })

  it('shows the DSP page as a third panel, exclusive with the other two', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show audio processing' }))
    expect(screen.getByRole('region', { name: 'Audio processing' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show frequency spectrum' }))
    expect(screen.queryByRole('region', { name: 'Audio processing' })).toBeNull()
  })

  it('leaves the DSP button live with no track, unlike the other two', () => {
    audio.currentTrack = null
    render(<Player expanded />)

    // Lyrics need tags and the spectrum needs signal; an EQ curve is worth
    // editing in silence. (The lyrics button is a layer toggle now, but it
    // still has nothing to show without a track.)
    expect(screen.getByRole('button', { name: 'Show lyrics' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Show frequency spectrum' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Show audio processing' })).toBeEnabled()
  })

  it('returns to the artwork when the active mode is clicked again', () => {
    render(<Player expanded />)

    fireEvent.click(screen.getByRole('button', { name: 'Show frequency spectrum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show album art' }))

    expect(screen.queryByRole('region', { name: 'Frequency spectrum' })).toBeNull()
  })

  it('shows beat markers only in the full now-playing view', () => {
    const { unmount } = render(<Player />)
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('data-marker-count', '0')
    unmount()

    render(<Player expanded />)
    expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('data-marker-count', '1')
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
