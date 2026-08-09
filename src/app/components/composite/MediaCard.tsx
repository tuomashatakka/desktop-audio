import { useId } from 'react'
import { AlbumArt, Icon } from '../atomic'


interface MediaCardProps {
  readonly title:     string
  readonly subtitle?: string
  readonly trackId?:  string
  readonly color?:    string

  /** Primary action: open the collection, or play the track. */
  readonly onOpen: () => void

  /** Secondary action. Omitted when opening already starts playback. */
  readonly onPlay?:    () => void
  readonly playLabel?: string
}

/**
 * One tile in the library grid — an album, artist, folder or track.
 *
 * The heading holds the button rather than the button holding the heading:
 * `<button>` accepts only *phrasing* content, so `<button><h3>…</h3></button>`
 * is invalid and quietly flattens the accessibility tree. `.card-open::after`
 * then stretches that button's hit area over the whole card, which is what
 * makes the tile clickable without wrapping it in a second control.
 *
 * The play button is a *sibling*, never a descendant — a button inside a
 * button is invalid too, and the browser unnests it silently.
 */
export function MediaCard ({
  title, subtitle, trackId, color, onOpen, onPlay, playLabel,
}: MediaCardProps) {
  const titleId = useId()

  return <article className='media-card' aria-labelledby={ titleId }>
    <AlbumArt className='card-cover' trackId={ trackId } color={ color } />

    <h3 className='card-title' id={ titleId }>
      <button className='card-open' type='button' onClick={ onOpen }>{title}</button>
    </h3>

    {subtitle && <p className='card-sub'>{subtitle}</p>}

    {onPlay &&
      <button
        className='card-play'
        aria-label={ playLabel ?? `Play ${title}` }
        type='button'
        onClick={ onPlay }>
        <Icon name='play' />
      </button>
    }
  </article>
}
