/**
 * Opens Now Playing when playback *starts* on a different track.
 *
 * Pressing play on something new is a decision to look at it; pressing play on
 * what was already loaded is a decision to carry on listening, and the queue
 * moving to the next track on its own is not a decision at all. Only the first
 * of the three opens the overlay.
 *
 * The rule is therefore two edges at once, which is why this needs refs rather
 * than a derivation: playback has to go from stopped to playing *and* the track
 * has to differ from the last one this opened for. `isPlaying` alone would fire
 * on every resume; the track id alone would fire on every auto-advance.
 *
 * It lives outside `AudioContext` because that provider is a sibling of
 * `UIProvider`, not a child of it, and so has no `openOverlay` to call — and
 * outside the overlay's own `Player`, which is only mounted once the overlay is
 * already open. `AppContent` sits inside both providers, which makes it the one
 * place that can see both halves.
 */
import { useEffect, useRef } from 'react'
import { useAudio, useUI } from '../contexts'


export function useAutoNowPlaying (): void {
  const { currentTrack, isPlaying } = useAudio()
  const { openOverlay }             = useUI()

  /** The track the overlay was last opened for. */
  const openedFor = useRef<string | null>(null)

  /** `isPlaying` as it was on the previous run, to catch the rising edge. */
  const wasPlaying = useRef(false)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Opens an overlay from a transition between two renders; a rising edge is not a value any render can read.
  useEffect(() => {
    const id = currentTrack?.id ?? null

    if (id && isPlaying) {
      if (!wasPlaying.current && id !== openedFor.current)
        openOverlay('player')

      openedFor.current = id
    }

    wasPlaying.current = isPlaying
  }, [ currentTrack?.id, isPlaying, openOverlay ])
}
