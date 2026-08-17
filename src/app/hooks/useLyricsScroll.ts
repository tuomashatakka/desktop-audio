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
 * **Takeover is read from input events, not from scroll position.** The
 * obvious test — "did it end up somewhere other than where we put it?" — stops
 * working the moment the scroll is smooth, because a smooth scroll spends most
 * of its life somewhere other than its target and fires a `scroll` event on
 * every frame of the way there. A wheel, a drag or an arrow key is the reader
 * taking over; nothing else is.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { listenAll } from '../utils/events'


/** The gestures that hand the panel over. `scroll` is deliberately not one. */
const TAKEOVER_EVENTS = [ 'wheel', 'touchmove', 'pointerdown', 'keydown' ]

function clamp01 (value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/** Smooth is the whole point here, but not against the user's stated wishes. */
function scrollBehavior (): ScrollBehavior {
  const reduced = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  return reduced ? 'auto' : 'smooth'
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
  const lastKey = useRef(resetKey)

  // Reset in render rather than in an effect: these are refs, so there is
  // nothing to commit and nothing a discarded render could leave behind.
  if (lastKey.current !== resetKey) {
    lastKey.current = resetKey
    manual.current  = false
  }

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Binds DOM input listeners. There is no render-time way to notice the reader taking the panel over.
  useEffect(() => {
    const element = ref.current
    if (!element)
      return

    const take = () => {
      manual.current = true
    }

    const subscription = listenAll(
      element,
      Object.fromEntries(TAKEOVER_EVENTS.map(type =>
        [ type, take ]))
    )

    return () =>
      subscription.dispose()
  }, [])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Calls `scroll()` on an element. Scroll offset is not a rendered value; it exists only after layout and can only be set imperatively.
  useEffect(() => {
    const element = ref.current
    if (!element || manual.current)
      return

    const overflow = element.scrollHeight - element.clientHeight
    if (overflow <= 0)
      return

    element.scroll({
      top:      Math.round(overflow * clamp01(progress)),
      behavior: scrollBehavior(),
    })
  }, [ progress ])

  return ref
}
