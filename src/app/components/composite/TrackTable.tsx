/**
 * TrackTable — the main music list.
 *
 * A sortable, reorderable, resizable grid with four grouping modes
 * (`none` / `album` / `artist` / `path`) and three densities. Column layout,
 * sort state and grouping are persisted via context hooks.
 *
 * Layout: one scroll container owns everything. The column header row is the
 * scroller's first child and `position: sticky`, so it pins as soon as you
 * scroll past it. The flat list is virtualized with `@tanstack/react-virtual`
 * (absolutely positioned rows inside a spacer sized to the whole list);
 * grouped views render in full because their row offsets aren't uniform.
 *
 * The div grid carries the full ARIA table role chain (table → rowgroup →
 * row → columnheader/cell); a real `<table>` can't be virtualized or
 * column-resized without fighting table layout.
 */
import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortableTable } from '../../hooks/useSortableTable'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import type { ColumnKey, ColumnConfig } from '../../hooks/useColumnConfig'
import { useUI } from '../../contexts'
import type { Density, Grouping } from '../../contexts'
import { Skeleton } from '../atomic/Skeleton'
import { Popover } from '../atomic/Popover'
import { Breadcrumbs } from './Breadcrumbs'
import type { Track } from '../../contexts'
import type { SortKey } from '../../hooks/useSortableTable'


const ROW_HEIGHT_BY_DENSITY: Record<Density, number> = {
  compact: 28,
  normal:  40,
  relaxed: 64,
}

const SKELETON_ROW_COUNT = 20

interface TrackTableProps {
  readonly tracks:         readonly Track[]
  readonly isLoading:      boolean
  readonly currentTrack:   Track | null
  readonly isPlaying:      boolean
  readonly onPlay:         (track: Track, index: number) => void
  readonly onContextMenu?: (track: Track, rect: DOMRect) => void
  readonly onNavigate?:    (path: string | null) => void
  readonly roots?:         readonly string[]

  /** Raw scroll events from the list container (drives the header collapse). */
  readonly onScroll?: (e: Event) => void
}

function formatDuration (seconds: number): string {
  if (!seconds || !Number.isFinite(seconds))
    return '0:00'

  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSize (bytes: number): string {
  if (!bytes)
    return '—'

  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function parentDir (path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx > 0 ? path.slice(0, idx) : '/'
}

function isSortableKey (key: ColumnKey): key is SortKey {
  return key !== 'art' && key !== 'index'
}

/** Always square, always cropped — see `.album-art` in library.css. */
function AlbumArt ({ src, color }: { readonly src?: string; readonly color?: string }) {
  return src
    ? <img className='album-art' src={src} alt='' loading='lazy' />
    : <span className='album-art' style={{ background: color }} />
}

function cellValue (track: Track, key: ColumnKey, index: number, density: Density): React.ReactNode {
  switch (key) {
    case 'art':
      return <AlbumArt src={track.albumArt} color={track.coverColor} />
    case 'index':
      return index + 1
    case 'title':
      return density === 'relaxed'
        ? <>
          <strong>{track.title}</strong>

          <small>
            {track.artist}
            {track.album ? ` — ${track.album}` : ''}
          </small>
        </>
        : track.title
    case 'artist': return track.artist
    case 'album': return track.album
    case 'year': return track.year ?? ''
    case 'genre': return track.genre ?? ''
    case 'duration': return formatDuration(track.duration)
    case 'format': return track.format?.toUpperCase() ?? ''
    case 'size': return formatSize(track.size)
    case 'trackNumber': return track.trackNumber ?? ''
    case 'path': return track.path
  }
}

interface HeaderCellProps {
  readonly col:            ColumnConfig
  readonly sortKey:        SortKey
  readonly sortDir:        'asc' | 'desc'
  readonly toggleSort:     (key: SortKey) => void
  readonly onResize:       (key: ColumnKey, width: string) => void
  readonly onReorder:      (from: ColumnKey, to: ColumnKey) => void
  readonly onContextMenu?: (rect: DOMRect) => void
}

function HeaderCell ({ col, sortKey, sortDir, toggleSort, onResize, onReorder, onContextMenu }: HeaderCellProps) {
  const ref = useRef<HTMLDivElement>(null)
  const sortable = isSortableKey(col.key)
  const isSorted = sortable && col.key === sortKey

  const handleClick = () => {
    if (sortable)
      toggleSort(col.key as SortKey)
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('column-key', col.key)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('column-key')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    const from = e.dataTransfer.getData('column-key') as ColumnKey
    if (from && from !== col.key)
      onReorder(from, col.key)
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = ref.current?.getBoundingClientRect().width ?? 0

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(48, Math.round(startWidth + (ev.clientX - startX)))
      onResize(col.key, `${next}px`)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onContextMenu && ref.current)
      onContextMenu(ref.current.getBoundingClientRect())
  }

  return (
    <div
      ref={ref}
      role='columnheader'
      draggable
      className={`col-${col.key} ${isSorted ? `sorted ${sortDir}` : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-sort={isSorted ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}
      tabIndex={sortable ? 0 : undefined}
      onKeyDown={e =>
        sortable && e.key === 'Enter' && toggleSort(col.key as SortKey)}
    >
      <span className='label'>{col.label}</span>

      {isSorted &&
        <span aria-hidden='true'>{sortDir === 'asc' ? '▲' : '▼'}</span>
      }

      <span className='resize-handle' onMouseDown={handleResizeStart} aria-hidden='true' />
    </div>
  )
}

function ColumnMenu ({ anchorRect, onClose }: { readonly anchorRect: DOMRect | null; readonly onClose: () => void }) {
  const { columns, toggleColumn, resetColumns } = useColumnConfig()

  return (
    <Popover open={anchorRect !== null} anchorRect={anchorRect} onClose={onClose} placement='bottom'>
      <fieldset className='config-menu'>
        <legend>Columns</legend>

        {columns.map(c =>
          <label key={c.key}>
            <input
              type='checkbox'
              checked={c.visible}
              disabled={c.fixed}
              onChange={() =>
                toggleColumn(c.key)}
            />

            {c.label || c.key}
          </label>
        )}

        <button type='button' className='button ghost sm' onClick={resetColumns}>Reset</button>
      </fieldset>
    </Popover>
  )
}

function bucketKey (track: Track, grouping: Grouping): string {
  switch (grouping) {
    case 'album': return `${track.artist}​${track.album}`
    case 'artist': return track.artist || 'Unknown Artist'
    case 'path': return parentDir(track.path)
    default: return ''
  }
}

interface GroupBlock {
  readonly key:      string
  readonly label:    string
  readonly subtitle: string
  readonly tracks:   readonly Track[]
}

function buildGroups (sorted: readonly Track[], grouping: Grouping): readonly GroupBlock[] {
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
    const label = grouping === 'album' ? first.album || 'Unknown Album'
      : grouping === 'artist' ? first.artist || 'Unknown Artist'
      : /* path */ key

    const count = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`
    const subtitle = grouping === 'album'
      ? `${first.artist || 'Unknown Artist'} · ${count}`
      : count

    out.push({ key, label, subtitle, tracks })
  }
  return out
}

export function TrackTable ({ tracks, isLoading, currentTrack, isPlaying, onPlay, onContextMenu, onNavigate, roots = [], onScroll }: TrackTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { density, grouping } = useUI()
  const { visible, gridTemplate, resizeColumn, reorderColumn } = useColumnConfig()
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(tracks)

  const [ menuRect, setMenuRect ] = useState<DOMRect | null>(null)

  const groups = useMemo(() =>
    buildGroups(sorted, grouping), [ sorted, grouping ])

  const rowHeight = ROW_HEIGHT_BY_DENSITY[density]

  /** Skeletons stand in for an empty list only — never over cached rows. */
  const showSkeleton = isLoading && sorted.length === 0
  const flat = grouping === 'none' || showSkeleton

  const virtualizer = useVirtualizer({
    count:            showSkeleton ? SKELETON_ROW_COUNT : flat ? sorted.length : 0,
    getScrollElement: () =>
      scrollRef.current,
    estimateSize: () =>
      rowHeight,
    overscan: 12,
  })

  const style = useMemo(() =>
    ({ '--track-grid': gridTemplate, '--row-h': `${rowHeight}px` }) as React.CSSProperties,
  [ gridTemplate, rowHeight ])

  const renderRow = useCallback((track: Track, index: number, rowStyle?: React.CSSProperties) => {
    const active = currentTrack?.id === track.id
    return (
      <div
        key={track.id}
        role='row'
        aria-rowindex={index + 1}
        style={rowStyle}
        className={`track-row ${active ? 'active' : ''}`}
        onClick={() =>
          onPlay(track, index)}
        onContextMenu={e => {
          e.preventDefault()
          onContextMenu?.(track, e.currentTarget.getBoundingClientRect())
        }}
        tabIndex={0}
        onKeyDown={e =>
          e.key === 'Enter' && onPlay(track, index)}
        aria-selected={active}
      >
        {visible.map(col =>
          <span key={col.key} role='cell' className={`col-${col.key}`}>
            {col.key === 'index' && active && isPlaying ? '▶' : cellValue(track, col.key, index, density)}
          </span>
        )}
      </div>
    )
  }, [ visible, density, currentTrack, isPlaying, onPlay, onContextMenu ])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onScroll)
      return

    el.addEventListener('scroll', onScroll, { passive: true })
    return () =>
      el.removeEventListener('scroll', onScroll)
  }, [ onScroll ])

  // Keep the playing track in view (flat list only — grouped views aren't
  // virtualized, so the virtualizer has no offsets to scroll to).
  useEffect(() => {
    if (!currentTrack || !flat || showSkeleton)
      return

    const index = sorted.findIndex(t =>
      t.id === currentTrack.id)
    if (index >= 0)
      virtualizer.scrollToIndex(index, { align: 'center' })
  }, [ currentTrack?.id, flat, showSkeleton, sorted, virtualizer ])

  /** Row index within the full sorted list, so numbering survives grouping. */
  const indexOf = useCallback((track: Track, fallback: number) => {
    const i = sorted.findIndex(x =>
      x.id === track.id)
    return i >= 0 ? i : fallback
  }, [ sorted ])

  return (
    <div
      className='track-table'
      data-density={density}
      style={style}
      role='table'
      aria-label='Tracks'
      aria-rowcount={sorted.length}
      aria-busy={isLoading || undefined}
    >
      <div ref={scrollRef} className='track-scroll'>

        <div className='track-header' role='rowgroup'>
          <div role='row'>
            {visible.map(col =>
              <HeaderCell
                key={col.key}
                col={col}
                sortKey={sortKey}
                sortDir={sortDir}
                toggleSort={toggleSort}
                onResize={resizeColumn}
                onReorder={reorderColumn}
                onContextMenu={setMenuRect}
              />
            )}
          </div>
        </div>

        {flat
          ? <div className='track-body' role='rowgroup' style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map(vrow => {
              const rowStyle: React.CSSProperties = {
                position:    'absolute',
                insetInline: 0,
                top:         0,
                height:      vrow.size,
                transform:   `translateY(${vrow.start}px)`,
              }

              if (showSkeleton)
                return (
                  <div key={vrow.key} className='track-row' style={rowStyle} aria-hidden='true'>
                    {visible.map(col =>
                      <span key={col.key} className={`col-${col.key}`}>
                        <Skeleton
                          width={col.key === 'art' ? 'var(--art)' : '60%'}
                          height={col.key === 'art' ? 'var(--art)' : undefined}
                        />
                      </span>
                    )}
                  </div>
                )

              const track = sorted[vrow.index]
              return track ? renderRow(track, vrow.index, rowStyle) : null
            })}
          </div>

          : <div className='track-body grouped' role='rowgroup' data-grouping={grouping}>
            {groups.map(g => {
              const rows = g.tracks.map((t, i) =>
                renderRow(t, indexOf(t, i)))

              if (grouping === 'album')
                return (
                  <section key={g.key} className='track-group album'>
                    <AlbumArt src={g.tracks[0].albumArt} color={g.tracks[0].coverColor} />

                    <header>
                      <h3>{g.label}</h3>
                      <small>{g.subtitle}</small>
                    </header>

                    <div className='group-rows'>{rows}</div>
                  </section>
                )

              // Path groups get a clickable trail instead of a heading, so the
              // collapse affordance is dropped here — interactive content
              // inside <summary> would nest buttons.
              if (grouping === 'path')
                return (
                  <section key={g.key} className='track-group path' aria-label={g.key}>
                    <header>
                      <Breadcrumbs
                        path={g.key}
                        roots={roots}
                        onNavigate={p =>
                          onNavigate?.(p)}
                        label='Group folder'
                      />

                      <small>{g.subtitle}</small>
                    </header>

                    {rows}
                  </section>
                )

              return (
                <details key={g.key} className='track-group' open>
                  <summary>
                    <span className='group-title'>{g.label}</span>
                    <small>{g.subtitle}</small>
                  </summary>

                  {rows}
                </details>
              )
            })}
          </div>
        }
      </div>

      <ColumnMenu anchorRect={menuRect}
        onClose={() =>
          setMenuRect(null)} />
    </div>
  )
}
