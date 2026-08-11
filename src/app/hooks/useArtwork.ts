/**
 * useArtwork — album art for one track, fetched on demand.
 *
 * Art is not carried on track DTOs. The blobs are base64 data URLs running to
 * megabytes each (372 MB across this library), and shipping them inline put
 * roughly twice that into the renderer's string heap on every scan. The list
 * therefore renders from `coverColor` until the real image arrives.
 *
 * Two module-level maps make that affordable, in the same spirit as
 * `trackCache` in `useLibraryScanner`: `resolved` survives remounts so a
 * scrolled-past row repaints instantly, and `inFlight` collapses the duplicate
 * requests a virtualized list produces when the same rows mount, unmount and
 * mount again within one flick of the wheel.
 */
import { useEffect, useState } from 'react'
import { useOptionalData } from '../data'
import type { ArtworkSize } from '../data/DataSource'


/** `null` is a known-absent cover, and is cached as eagerly as a hit. */
const resolved = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()

const keyOf = (trackId: string, size: ArtworkSize) =>
  `${size}:${trackId}`

export function useArtwork (
  trackId: string | undefined,
  size: ArtworkSize = 'thumb'
): string | undefined {
  // Optional: a cover is decoration, so a row still renders without a data
  // source above it — which is also what keeps `TrackTable` testable alone.
  const data = useOptionalData()

  const [ art, setArt ] = useState<string | undefined>(() =>
    trackId ? resolved.get(keyOf(trackId, size)) ?? undefined : undefined)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Fetches artwork asynchronously and guards the state write, because a row can unmount mid-flight.
  useEffect(() => {
    if (!trackId || !data)
      return

    const key    = keyOf(trackId, size)
    const cached = resolved.get(key)

    if (cached !== undefined) {
      setArt(cached ?? undefined)
      return
    }

    // A row can unmount mid-flight — the scroll that revealed it is the same
    // scroll that hides it — so the result is cached either way and only the
    // state write is guarded.
    let live = true

    const request = inFlight.get(key) ?? (() => {
      const p = data.readArtwork(trackId, size)
        .catch(() =>
          null)
        .then(result => {
          resolved.set(key, result)
          inFlight.delete(key)
          return result
        })
      inFlight.set(key, p)
      return p
    })()

    void request.then(result => {
      if (live)
        setArt(result ?? undefined)
    })

    return () => {
      live = false
    }
  }, [ data, trackId, size ])

  return art
}
