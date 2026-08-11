/**
 * The bridge between playback and the OS's own media controls — the macOS Now
 * Playing panel, MPRIS on Linux.
 *
 * It lives outside `AudioContext` because it is self-contained: nothing else in
 * the provider reads the artwork it fetches or the timer it debounces with, and
 * both directions of the bridge — push state out, take seeks back — belong
 * together rather than sitting as two loose effects among thirty other
 * statements.
 *
 * Pushes are debounced because `currentTime` ticks several times a second and
 * the host does real work per update; the OS panel does not need every frame.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useHost } from '../data'
import { useArtwork } from './useArtwork'
import type { Track } from '../contexts/LibraryContext'


/** The slice of playback state the OS controls actually care about. */
export interface NativeMediaState {
  readonly currentTrack: Track | null
  readonly isPlaying:    boolean
  readonly currentTime:  number
  readonly duration:     number
}

/** How long to sit on a change before telling the host about it. */
const PUSH_DEBOUNCE_MS = 500

/** Microseconds per second — the unit MPRIS sends its seek deltas in. */
const US_PER_SECOND = 1e6

/** See module docstring. */
export function useNativeMediaControls (
  { currentTrack, isPlaying, currentTime, duration }: NativeMediaState,
  audioRef: RefObject<HTMLAudioElement | null>,
  onSeek: (time: number) => void
) {
  const host        = useHost()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const albumArt    = useArtwork(currentTrack?.id, 'full')

  // The subscription below is registered once per host, so it reaches the
  // current callback through a ref rather than closing over the one that
  // existed when it was first bound.
  const onSeekRef   = useRef(onSeek)
  onSeekRef.current = onSeek

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Debounces a push to the host; the timer has to outlive the render that scheduled it.
  useEffect(() => {
    if (!currentTrack)
      return

    if (debounceRef.current)
      clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      host.updateMediaState({
        title:    currentTrack.title,
        artist:   currentTrack.artist,
        album:    currentTrack.album,
        albumArt,
        isPlaying,
        position: currentTime,
        duration,
      })
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current)
        clearTimeout(debounceRef.current)
    }
  }, [ currentTrack, isPlaying, currentTime, duration, host, albumArt ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Subscribes to the host's media-seek channel.
  useEffect(() =>
    host.onMediaSeek((delta: number) => {
      const audio = audioRef.current
      if (!audio)
        return

      const time        = Math.max(0, audio.currentTime + delta / US_PER_SECOND)
      audio.currentTime = time
      onSeekRef.current(time)
    }), [ host, audioRef ])
}
