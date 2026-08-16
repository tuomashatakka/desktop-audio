/* eslint-disable react-strict/no-style-prop -- Virtual item offsets and measured card widths are runtime geometry; CSS still owns presentation. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { BucketGrouping, GridDensity, Grouping, GroupScope, Track } from '../../contexts'
import { buildGroups } from '../../utils/grouping'
import type { GroupBlock } from '../../utils/grouping'
import { basename } from './Breadcrumbs'
import { MediaCard } from './MediaCard'


interface LibraryGridProps {
  readonly tracks:   readonly Track[]
  readonly grouping: Grouping
  readonly density:  GridDensity

  /** Drill into a bucket. Never called when `grouping` is `none`. */
  readonly onOpen: (scope: GroupScope) => void
  readonly onPlay: (tracks: readonly Track[], startIndex: number) => void
}

interface GridLayout {
  readonly density:   GridDensity
  readonly columns:   number
  readonly cardWidth: number
  readonly gap:       number
}

const CARD_WIDTH_BY_DENSITY: Record<GridDensity, number> = {
  'grid-sm': 128,
  'grid-lg': 200,
}

/** Fallback for `--sp-2` before computed styles are measurable. */
const DEFAULT_GRID_GAP = 8

/** Cover plus the two single-line labels and the card's own padding. */
const CARD_CHROME_HEIGHT = 52

/** Two extra rows make a fast trackpad fling look continuous. */
const GRID_OVERSCAN_ROWS = 2

/** Lets tests and the first pre-measure render show useful content. */
const INITIAL_VIEWPORT_HEIGHT = 800

function initialLayout (density: GridDensity): GridLayout {
  return {
    density,
    columns:   1,
    cardWidth: CARD_WIDTH_BY_DENSITY[density],
    gap:       DEFAULT_GRID_GAP,
  }
}

function useGridLayout (
  scrollRef: React.RefObject<HTMLDivElement | null>,
  density: GridDensity
): GridLayout {
  const [ measured, setMeasured ] = useState<GridLayout>(() =>
    initialLayout(density))

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- ResizeObserver is the browser's subscription for the scroll viewport whose width determines the virtualizer's lane count.
  useEffect(() => {
    const element = scrollRef.current
    if (!element || typeof ResizeObserver === 'undefined')
      return

    const measure = (contentWidth: number) => {
      const style    = getComputedStyle(element)
      const minWidth = Number.parseFloat(style.getPropertyValue('--card')) ||
        CARD_WIDTH_BY_DENSITY[density]
      const gap       = Number.parseFloat(style.columnGap) || DEFAULT_GRID_GAP
      const columns   = Math.max(1, Math.floor((contentWidth + gap) / (minWidth + gap)))
      const cardWidth = contentWidth > 0
        ? (contentWidth - gap * (columns - 1)) / columns
        : minWidth

      setMeasured(current => {
        const next = { density, columns, cardWidth, gap }
        return current.density === next.density &&
          current.columns === next.columns &&
          current.cardWidth === next.cardWidth &&
          current.gap === next.gap
          ? current
          : next
      })
    }

    const initialStyle = getComputedStyle(element)
    measure(Math.max(
      0,
      element.clientWidth -
        Number.parseFloat(initialStyle.paddingLeft) -
        Number.parseFloat(initialStyle.paddingRight)
    ))

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry)
        measure(entry.contentRect.width)
    })
    observer.observe(element)

    return () =>
      observer.disconnect()
  }, [ density, scrollRef ])

  return measured.density === density ? measured : initialLayout(density)
}

interface VirtualCardProps {
  readonly item:           VirtualItem
  readonly itemCount:      number
  readonly layout:         GridLayout
  readonly grouping:       Grouping
  readonly tracks:         readonly Track[]
  readonly groups:         readonly GroupBlock[]
  readonly measureElement: (node: HTMLLIElement | null) => void
  readonly onOpen:         (scope: GroupScope) => void
  readonly onPlay:         (tracks: readonly Track[], startIndex: number) => void
}

/** One mounted card from the virtual list; track and bucket variants share the list item. */
function VirtualCard ({
  item, itemCount, layout, grouping, tracks, groups, measureElement, onOpen, onPlay,
}: VirtualCardProps) {
  const style = {
    width:     layout.cardWidth,
    transform: `translate3d(${item.lane * (layout.cardWidth + layout.gap)}px, ${item.start}px, 0)`,
  }

  let card: React.ReactNode

  if (grouping === 'none') {
    const track = tracks[item.index]
    if (!track)
      return null

    card = <MediaCard
      title={ track.title }
      subtitle={ track.artist }
      trackId={ track.id }
      color={ track.coverColor }
      onOpen={ () =>
        onPlay(tracks, item.index) } />
  }
  else {
    const group = groups[item.index]
    if (!group)
      return null

    card = <MediaCard
      title={ grouping === 'path' ? basename(group.label) : group.label }
      subtitle={ group.subtitle }
      trackId={ group.tracks[0]?.id }
      color={ group.tracks[0]?.coverColor }
      playLabel={ `Play ${group.label}` }
      onOpen={ () =>
        onOpen({ grouping: grouping as BucketGrouping, key: group.key, label: group.label }) }
      onPlay={ () =>
        onPlay(group.tracks, 0) } />
  }

  return <li
    ref={ measureElement }
    style={ style }
    data-index={ item.index }
    aria-posinset={ item.index + 1 }
    aria-setsize={ itemCount }>
    {card}
  </li>
}

/**
 * Card browsing for the library.
 *
 * What a card *is* follows the grouping selector: ungrouped shows one card per
 * track that plays when clicked, and every other mode shows one card per
 * bucket that opens as a list. The flat semantic list is virtualized in lanes,
 * so a 6000-track grid mounts only the cards around the viewport and therefore
 * requests artwork only for those cards.
 */
export function LibraryGrid ({ tracks, grouping, density, onOpen, onPlay }: LibraryGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const groups    = useMemo(() =>
    buildGroups(tracks, grouping), [ tracks, grouping ])
  const layout = useGridLayout(scrollRef, density)

  const itemCount = grouping === 'none' ? tracks.length : groups.length

  const itemKey = useCallback((index: number) =>
    grouping === 'none'
      ? tracks[index]?.id ?? index
      : groups[index]?.key ?? index, [ grouping, tracks, groups ])

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count:            itemCount,
    getScrollElement: () =>
      scrollRef.current,
    estimateSize: () =>
      layout.cardWidth + CARD_CHROME_HEIGHT,
    getItemKey: itemKey,
    gap:        layout.gap,
    lanes:      layout.columns,
    overscan:   layout.columns * GRID_OVERSCAN_ROWS,

    // React 19 can schedule these scroll updates naturally; forcing flushSync
    // works against the non-blocking library commits feeding this grid.
    useFlushSync:                        false,
    useAnimationFrameWithResizeObserver: true,
    initialRect:                         {
      width:  layout.cardWidth,
      height: INITIAL_VIEWPORT_HEIGHT,
    },
  })

  const size      = density === 'grid-lg' ? 'lg' : 'sm'
  const listStyle = { height: virtualizer.getTotalSize() }

  return <div ref={ scrollRef } className='library-grid-scroll' data-size={ size }>
    <ul className='library-grid' style={ listStyle } data-size={ size }>
      {virtualizer.getVirtualItems().map(item =>
        <VirtualCard
          key={ item.key }
          item={ item }
          itemCount={ itemCount }
          layout={ layout }
          grouping={ grouping }
          tracks={ tracks }
          groups={ groups }
          measureElement={ virtualizer.measureElement }
          onOpen={ onOpen }
          onPlay={ onPlay } />)}
    </ul>
  </div>
}
