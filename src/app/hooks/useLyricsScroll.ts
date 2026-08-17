/**
 * Scrolls a lyrics panel in step with playback, and yields to the reader for
 * good the moment they scroll it themselves.
 *
 * There is no timing data behind this. `common.lyrics` is a plain string and
 * synced frames are flattened before they ever reach the renderer, so the
 * panel is scrolled *proportionally*: 40% through the track, 40% of the
 * overflow has gone past. That is a guess, and being wrong about it is exactly
 * why taking over has to be free.
 *
 * The takeover is detected by comparing the element against what was last
 * written to it rather than by listening for wheel, touch and key separately:
 * a programmatic `scrollTop` assignment fires the same `scroll` event a human
 * does, but it lands on the value we asked for. Anything else is somebody else
 * driving.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { listen } from '../utils/events'


/** How far the panel may sit from where it was put before it counts as human. */
const MANUAL_EPSILON_PX = 4

function clamp01 (value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/**
 * @param progress 0–1 through the track.
 * @param resetKey Changing this starts following again — a new track, or the
 *   panel being reopened.
 */
export function useLyricsScroll<T extends HTMLElement> (
  progress: number,
  resetKey: string
): RefObject<T | null> {
  const ref     = useRef<T | null>(null)
  const manual  = useRef(false)
  const written = useRef(0)
  const lastKey = useRef(resetKey)

  // Reset in render rather than in an effect: these are refs, so there is
  // nothing to commit and nothing a discarded render could leave behind.
  if (lastKey.current !== resetKey) {
    lastKey.current = resetKey
    manual.current  = false
  }

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Binds a DOM `scroll` listener. There is no render-time way to notice the reader taking the panel over.
  useEffect(() => {
    const element = ref.current
    if (!element)
      return

    const subscription = listen(element, 'scroll', () => {
      if (Math.abs(element.scrollTop - written.current) > MANUAL_EPSILON_PX)
        manual.current = true
    })

    return () =>
      subscription.dispose()
  }, [])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes `scrollTop` on an element. Scroll offset is not a rendered value; it exists only after layout and can only be set imperatively.
  useEffect(() => {
    const element = ref.current
    if (!element || manual.current)
      return

    const overflow = element.scrollHeight - element.clientHeight
    if (overflow <= 0)
      return

    written.current   = Math.round(overflow * clamp01(progress))
    element.scrollTop = written.current
  }, [ progress ])

  return ref
}
