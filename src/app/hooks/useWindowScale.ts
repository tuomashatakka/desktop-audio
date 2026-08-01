/**
 * Toggles the window between its cached compact and expanded sizes.
 *
 * Both sizes live in {@link useSettings} so they survive a restart, and each
 * is re-captured on the way *out* of that size — resize the mini window and
 * that becomes the size you get next time. Shrinking forces the player view;
 * growing restores whichever view was active before.
 */
import { useCallback } from 'react'
import { useSettings, useUI } from '../contexts'
import { useHost } from '../data'
import { CHROME_MAX_HEIGHT } from './useHeightTier'


/** Returns a callback that toggles the window between compact and expanded. */
export function useWindowScale () {
  const { compactSize, expandedSize, setCompactSize, setExpandedSize } = useSettings()
  const { previousView, setView } = useUI()
  const host = useHost()

  return useCallback(() => {
    const current = { width: window.innerWidth, height: window.innerHeight }

    // "Am I currently the small window?" — that's the chrome threshold, not
    // the layout one: everything below it is a chrome-less mini window.
    if (current.height < CHROME_MAX_HEIGHT) {
      setCompactSize(current)
      setView(previousView ?? 'library')
      host.setWindowSize(expandedSize.width, expandedSize.height)
      return
    }

    setExpandedSize(current)
    setView('player')
    host.setWindowSize(compactSize.width, compactSize.height)
  }, [
    compactSize,
    expandedSize,
    setCompactSize,
    setExpandedSize,
    previousView,
    setView,
    host,
  ])
}
