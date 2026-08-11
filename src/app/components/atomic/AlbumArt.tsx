/* eslint-disable react-strict/no-style-prop -- The cover colour is per-track data, not a presentation choice a stylesheet could know. */
import { useArtwork } from '../../hooks/useArtwork'
import type { ArtworkSize } from '../../data/DataSource'


/** Square and cropped by `.album-art` (views.css); the caller's class sizes it. */
interface AlbumArtProps {
  readonly trackId?:   string
  readonly color?:     string
  readonly size?:      ArtworkSize
  readonly className?: string
}

/**
 * Art arrives after the row does.
 *
 * Track DTOs carry no `albumArt` — it is fetched per track, downscaled to a
 * thumbnail host-side, and cached across mounts by {@link useArtwork}. The
 * `coverColor` block is not a placeholder so much as the resting state: most
 * tracks have no cover at all, and this is what they keep showing.
 */
export function AlbumArt ({ trackId, color, size = 'thumb', className = '' }: AlbumArtProps) {
  const src = useArtwork(trackId, size)
  const cls = `album-art ${className}`.trim()

  return src
    ? <img className={ cls } src={ src } alt='' loading='lazy' />
    : <span className={ cls } style={{ background: color }} />
}
