/**
 * Opening Now Playing when playback starts on something new.
 *
 * Three cases sit right next to each other and only one of them should open the
 * overlay: pressing play on a different track (yes), resuming the one that was
 * paused (no), and the queue advancing on its own while you are already
 * listening (no). The hook is driven here through fake contexts rather than
 * through `AudioProvider`, because what is under test is the edge detection —
 * the audio graph has its own suite.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAutoNowPlaying } from '../../src/app/hooks/useAutoNowPlaying'


const openOverlay = vi.fn()

let playback = { currentTrack: null as { id: string } | null, isPlaying: false }

vi.mock('../../src/app/contexts', () => ({
  useAudio: () =>
    playback,
  useUI: () =>
    ({ openOverlay }),
}))

function Harness () {
  useAutoNowPlaying()
  return <output data-testid='ok'>ok</output>
}

/** Sets the playback state and lets the hook see the transition. */
function play (state: { currentTrack: { id: string } | null; isPlaying: boolean }) {
  playback = state
  return render(<Harness />)
}

describe('useAutoNowPlaying', () => {
  it('opens on a track that is not the one that was paused', () => {
    openOverlay.mockClear()

    const view = play({ currentTrack: { id: 'a' }, isPlaying: false })
    expect(openOverlay).not.toHaveBeenCalled()

    playback = { currentTrack: { id: 'b' }, isPlaying: true }
    view.rerender(<Harness />)

    expect(openOverlay).toHaveBeenCalledWith('player')
  })

  it('stays out of the way when the paused track resumes', () => {
    openOverlay.mockClear()

    const view = play({ currentTrack: { id: 'a' }, isPlaying: true })
    expect(openOverlay).toHaveBeenCalledTimes(1)

    playback = { currentTrack: { id: 'a' }, isPlaying: false }
    view.rerender(<Harness />)

    playback = { currentTrack: { id: 'a' }, isPlaying: true }
    view.rerender(<Harness />)

    expect(openOverlay).toHaveBeenCalledTimes(1)
  })

  // The queue moving on is not a decision to look at anything.
  it('stays out of the way when the queue auto-advances', () => {
    openOverlay.mockClear()

    const view = play({ currentTrack: { id: 'a' }, isPlaying: true })
    openOverlay.mockClear()

    playback = { currentTrack: { id: 'b' }, isPlaying: true }
    view.rerender(<Harness />)

    expect(openOverlay).not.toHaveBeenCalled()
    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  it('does nothing with an empty player', () => {
    openOverlay.mockClear()

    const view = play({ currentTrack: null, isPlaying: false })
    playback = { currentTrack: null, isPlaying: true }
    view.rerender(<Harness />)

    expect(openOverlay).not.toHaveBeenCalled()
  })
})
