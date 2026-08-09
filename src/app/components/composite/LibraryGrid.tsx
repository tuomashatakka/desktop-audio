import { useMemo } from 'react'
import type { BucketGrouping, GridDensity, Grouping, GroupScope, Track } from '../../contexts'
import { buildGroups } from '../../utils/grouping'
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

/**
 * Card browsing for the library.
 *
 * What a card *is* follows the grouping selector: ungrouped shows one card per
 * track that plays when clicked, and every other mode shows one card per
 * bucket that opens as a list. That is why there is no separate "browse by"
 * control — grouping already answers the question.
 *
 * Not virtualized. Bucket counts are orders of magnitude below track counts
 * (thousands of tracks, tens of albums), and the ungrouped case caps out at
 * whatever the folder selection already narrowed the list to.
 */
export function LibraryGrid ({ tracks, grouping, density, onOpen, onPlay }: LibraryGridProps) {
  const groups = useMemo(() =>
    buildGroups(tracks, grouping), [ tracks, grouping ])

  const size = density === 'grid-lg' ? 'lg' : 'sm'

  if (grouping === 'none')
    return <ul className='library-grid' data-size={ size }>
      {tracks.map((track, index) =>
        <li key={ track.id }>
          <MediaCard
            title={ track.title }
            subtitle={ track.artist }
            trackId={ track.id }
            color={ track.coverColor }
            onOpen={ () =>
              onPlay(tracks, index) } />
        </li>
      )}
    </ul>

  return <ul className='library-grid' data-size={ size }>
    {groups.map(group =>
      <li key={ group.key }>
        <MediaCard
          title={ grouping === 'path' ? basename(group.label) : group.label }
          subtitle={ group.subtitle }
          trackId={ group.tracks[0]?.id }
          color={ group.tracks[0]?.coverColor }
          playLabel={ `Play ${group.label}` }
          onOpen={ () =>
            onOpen({ grouping: grouping as BucketGrouping, key: group.key, label: group.label }) }
          onPlay={ () =>
            onPlay(group.tracks, 0) } />
      </li>
    )}
  </ul>
}
