import { useState, useMemo } from 'react'
import type { Track } from '../contexts'


export type SortKey = keyof Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'format' | 'year' | 'genre' | 'size' | 'trackNumber' | 'rating' | 'path'>

export type SortDir = 'asc' | 'desc'

interface SortableTableResult {
  readonly sorted: readonly Track[]

  /** `null` while the list is showing the order it was handed in. */
  readonly sortKey:    SortKey | null
  readonly sortDir:    SortDir
  readonly toggleSort: (key: SortKey) => void
}

const NUMERIC_KEYS = new Set<SortKey>([ 'duration', 'year', 'size', 'trackNumber', 'rating' ])

const DEFAULT_SORT_KEY: SortKey = 'title'

/**
 * Sorting for the track table.
 *
 * `naturalOrder` names a list whose given order *is* meaningful — the playback
 * queue and the play history, where position is the answer rather than an
 * arbitrary starting point. While one is named the table shows the list as
 * handed in, and the value is a token rather than a boolean so that switching
 * from one such list to another resets a sort the user applied to the first.
 *
 * The reset is a render-phase reconciliation rather than an effect: it has to
 * land in the same commit as the new list, or the queue paints once sorted by
 * title before snapping back to play order.
 */
export function useSortableTable (
  tracks: readonly Track[],
  naturalOrder: string | null = null
): SortableTableResult {
  const [ sortKey, setSortKey ] = useState<SortKey | null>(naturalOrder === null ? DEFAULT_SORT_KEY : null)
  const [ sortDir, setSortDir ] = useState<SortDir>('asc')

  const [ order, setOrder ] = useState(naturalOrder)
  if (order !== naturalOrder) {
    setOrder(naturalOrder)
    setSortKey(naturalOrder === null ? DEFAULT_SORT_KEY : null)
    setSortDir('asc')
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey)
      setSortDir(d =>
        d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (sortKey === null)
      return tracks

    return [ ...tracks ].sort((a, b) => {
      if (NUMERIC_KEYS.has(sortKey)) {
        const an  = Number(a[sortKey] ?? 0)
        const bn  = Number(b[sortKey] ?? 0)
        const cmp = an - bn
        return sortDir === 'asc' ? cmp : -cmp
      }

      const av  = String(a[sortKey] ?? '').toLowerCase()
      const bv  = String(b[sortKey] ?? '').toLowerCase()
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [ tracks, sortKey, sortDir ])

  return { sorted, sortKey, sortDir, toggleSort }
}
