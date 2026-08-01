/**
 * Window-height tiers for the collapsing player chrome.
 *
 * These key off the real window height rather than a CSS container query,
 * because the tiers have to collapse chrome that lives *outside* the
 * `.player-view` container (the titlebar and the player bar). The resulting
 * value is written to `data-height-tier` on `.app-shell` by `AppLayout`,
 * and every layout rule hangs off that attribute.
 */
import { useState, useEffect } from 'react'


/** Window-height bucket driving the player layout. */
export type HeightTier = 'normal' | 'compact' | 'mini'

/** Below this height the player goes side-by-side and chrome is hidden. */
export const COMPACT_MAX_HEIGHT = 300

/** Below this height only the title, art and next button survive. */
export const MINI_MAX_HEIGHT = 160

function tierFor (height: number): HeightTier {
  if (height < MINI_MAX_HEIGHT)
    return 'mini'
  if (height < COMPACT_MAX_HEIGHT)
    return 'compact'
  return 'normal'
}

/**
 * Current height tier, updated on window resize. Only the tier string is
 * held in state, so React bails out of re-rendering for the vast majority
 * of resize events — no throttling needed.
 */
export function useHeightTier (): HeightTier {
  const [ tier, setTier ] = useState<HeightTier>(() =>
    tierFor(window.innerHeight))

  useEffect(() => {
    const handler = () =>
      setTier(tierFor(window.innerHeight))

    // Re-check on mount: the window may have been resized before hydration.
    handler()

    window.addEventListener('resize', handler)
    return () =>
      window.removeEventListener('resize', handler)
  }, [])

  return tier
}
