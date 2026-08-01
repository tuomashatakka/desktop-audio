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
export type HeightTier = 'normal' | 'snug' | 'compact' | 'mini'

/**
 * Below this height the chrome (40px titlebar + 72px player bar) eats more of
 * the window than it earns, so it's hidden and PlayerView takes the lot.
 *
 * This is a hard geometric floor, not a styling preference — it's separate
 * from {@link COMPACT_MAX_HEIGHT} precisely so the *layout* can stay normal
 * for a while after the chrome goes.
 */
export const CHROME_MAX_HEIGHT = 480

/**
 * Below this height the player switches to the side-by-side compact layout.
 * Matches the 300px container-width breakpoint in player.css.
 */
export const COMPACT_MAX_HEIGHT = 300

/** Below this height only the title, art and next button survive. */
export const MINI_MAX_HEIGHT = 160

/** Maps a window height to its tier. See the threshold constants above. */
function tierFor (height: number): HeightTier {
  if (height < MINI_MAX_HEIGHT)
    return 'mini'
  if (height < COMPACT_MAX_HEIGHT)
    return 'compact'
  if (height < CHROME_MAX_HEIGHT)
    return 'snug'
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
    return () => {
      window.removeEventListener('resize', handler)
    }
  }, [])

  return tier
}
