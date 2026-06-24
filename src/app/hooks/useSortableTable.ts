import { useState, useMemo } from 'react'
import type { Track } from '../contexts'


export type SortKey = keyof Pick<Track, 'title' | 'artist' | 'album' | 'duration' | 'format' | 'year' | 'genre' | 'size' | 'trackNumber' | 'path'>

export type SortDir = 'asc' | 'desc'

interface SortableTableResult {
  readonly sorted:     readonly Track[]
  readonly sortKey:    SortKey
  readonly sortDir:    SortDir
  readonly toggleSort: (key: SortKey) => void
}

const NUMERIC_KEYS = new Set<SortKey>([ 'duration', 'year', 'size', 'trackNumber' ])

export function useSortableTable (tracks: readonly Track[]): SortableTableResult {
  const [ sortKey, setSortKey ] = useState<SortKey>('title')
  const [ sortDir, setSortDir ] = useState<SortDir>('asc')

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d =>
        d === 'asc' ? 'desc' : 'asc')
    }
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() =>
    [ ...tracks ].sort((a, b) => {
      if (NUMERIC_KEYS.has(sortKey)) {
        const an = Number(a[sortKey] ?? 0)
        const bn = Number(b[sortKey] ?? 0)
        const cmp = an - bn
        return sortDir === 'asc' ? cmp : -cmp
      }

      const av = String(a[sortKey] ?? '').toLowerCase()
      const bv = String(b[sortKey] ?? '').toLowerCase()
      const cmp = av.localeCompare(bv)
      return sortDir === 'asc' ? cmp : -cmp
    }), [ tracks, sortKey, sortDir ])

  return { sorted, sortKey, sortDir, toggleSort }
}
