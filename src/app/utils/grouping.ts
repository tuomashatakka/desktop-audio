/**
 * Bucketing tracks by the active grouping mode.
 *
 * Shared by the track table's group headings and the grid's cards, so both
 * agree on what an "album" is. `bucketKey` is also what a drilled-into
 * {@link GroupScope} stores, which makes filtering a string compare rather
 * than a re-derivation.
 */
import type { Grouping, Track } from '../contexts'


/** One labelled bucket of tracks. */
export interface GroupBlock {
  readonly key:      string
  readonly label:    string
  readonly subtitle: string
  readonly tracks:   readonly Track[]
}

/** The directory holding `path`, handling both `/` and `\\` separators. */
export function parentDir (path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx > 0 ? path.slice(0, idx) : '/'
}

/**
 * Group identity for a track under the active grouping mode.
 *
 * Album keys join artist and album with a zero-width space: two albums of the
 * same name by different artists are different buckets, and the separator can
 * never occur inside either field.
 */
export function bucketKey (track: Track, grouping: Grouping): string {
  switch (grouping) {
    case 'album': return `${track.artist}​${track.album}`
    case 'artist': return track.artist || 'Unknown Artist'
    case 'path': return parentDir(track.path)
    default: return ''
  }
}

/** Display name for the bucket `track` falls into; `path` is its key. */
export function groupLabel (track: Track, grouping: Grouping, path: string): string {
  if (grouping === 'album')
    return track.album || 'Unknown Album'
  if (grouping === 'artist')
    return track.artist || 'Unknown Artist'
  return path
}

/** Buckets an already-sorted list into labelled groups; empty when ungrouped. */
export function buildGroups (sorted: readonly Track[], grouping: Grouping): readonly GroupBlock[] {
  if (grouping === 'none')
    return []

  const buckets = new Map<string, Track[]>()
  for (const t of sorted) {
    const k = bucketKey(t, grouping)
    if (!buckets.has(k))
      buckets.set(k, [])
    buckets.get(k)!.push(t)
  }

  const out: GroupBlock[] = []
  for (const [ key, tracks ] of buckets) {
    const first = tracks[0]
    const label = groupLabel(first, grouping, key)

    const count    = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`
    const subtitle = grouping === 'album'
      ? `${first.artist || 'Unknown Artist'} · ${count}`
      : count

    out.push({ key, label, subtitle, tracks })
  }
  return out
}
