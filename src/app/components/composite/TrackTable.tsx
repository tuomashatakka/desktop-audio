import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortableTable } from '../../hooks/useSortableTable'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import type { ColumnKey, ColumnConfig } from '../../hooks/useColumnConfig'
import { useUI } from '../../contexts'
import type { Density, Grouping } from '../../contexts'
import { Skeleton } from '../atomic/Skeleton'
import { Popover } from '../atomic/Popover'
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
  readonly onScroll?:      (e: Event) => void
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

function cellValue (track: Track, key: ColumnKey, index: number, density: Density): React.ReactNode {
  switch (key) {
    case 'art':
      return track.albumArt
        ? <img src={track.albumArt} alt='' />
        : <span className='art-swatch' style={{ background: track.coverColor }} />
    case 'index':
      return index + 1
    case 'title':
      return density === 'relaxed'
        ? <>
          <span className='row-title'>{track.title}</span>

          <span className='row-subtitle'>
            {track.artist}
            {track.album ? ` — ${track.album}` : ''}
          </span>
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
      <span className='header-label'>{col.label}</span>

      {isSorted &&
        <span className='sort-indicator' aria-hidden='true'>
          {sortDir === 'asc' ? ' ▲' : ' ▼'}
        </span>
      }

      <span
        className='col-resize-handle'
        onMouseDown={handleResizeStart}
        aria-hidden='true'
      />
    </div>
  )
}

interface ColumnMenuProps {
  readonly anchorRect: DOMRect | null
  readonly onClose:    () => void
}

function ColumnMenu ({ anchorRect, onClose }: ColumnMenuProps) {
  const { columns, toggleColumn, resetColumns } = useColumnConfig()

  return (
    <Popover
      open={anchorRect !== null}
      anchorRect={anchorRect}
      onClose={onClose}
      placement='bottom'
    >
      <fieldset className='column-menu'>
        <legend>Columns</legend>

        {columns.map(c =>
          <label key={c.key} className={c.fixed ? 'fixed' : ''}>
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

    const subtitle = grouping === 'album'
      ? `${first.artist || 'Unknown Artist'} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}`
      : `${tracks.length} track${tracks.length === 1 ? '' : 's'}`

    out.push({ key, label, subtitle, tracks })
  }
  return out
}

export function TrackTable ({ tracks, isLoading, currentTrack, isPlaying, onPlay, onContextMenu, onScroll }: TrackTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { density, grouping } = useUI()
  const { visible, gridTemplate, resizeColumn, reorderColumn } = useColumnConfig()
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(tracks)

  const [ menuRect, setMenuRect ] = useState<DOMRect | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onScroll)
      return
    el.addEventListener('scroll', onScroll)
    return () =>
      el.removeEventListener('scroll', onScroll)
  }, [ onScroll ])

  const groups = useMemo(() =>
    buildGroups(sorted, grouping), [ sorted, grouping ])

  const rowHeight = ROW_HEIGHT_BY_DENSITY[density]
  const rowCount = isLoading ? SKELETON_ROW_COUNT : sorted.length

  const virtualizer = useVirtualizer({
    count:            rowCount,
    getScrollElement: () =>
      scrollRef.current,
    estimateSize: () =>
      rowHeight,
    overscan: 8,
  })

  const wrapStyle = useMemo(() =>
    ({ '--track-grid': gridTemplate } as React.CSSProperties), [ gridTemplate ])

  // Auto-scroll to current track when it changes
  useEffect(() => {
    if (!currentTrack || !scrollRef.current || !virtualizer)
      return

    const trackIndex = sorted.findIndex(t =>
      t.id === currentTrack.id)
    if (trackIndex < 0)
      return

    virtualizer.scrollToIndex(trackIndex, { align: 'center' })
  }, [ currentTrack?.id, virtualizer, sorted ])

  const renderRow = useCallback((track: Track, index: number) => {
    const active = currentTrack?.id === track.id
    return (
      <div
        key={track.id}
        role='row'
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
          <span key={col.key} className={`col-${col.key}`}>
            {col.key === 'index' && active && isPlaying ? '▶' : cellValue(track, col.key, index, density)}
          </span>
        )}
      </div>
    )
  }, [ visible, density, currentTrack, isPlaying, onPlay, onContextMenu ])

  const handleHeaderContextMenu = useCallback((rect: DOMRect) => {
    setMenuRect(rect)
  }, [])

  return (
    <div className='track-table-wrap' data-density={density} style={wrapStyle}>

      {/* Sticky header row */}
      <div className='track-header' role='row'>
        {visible.map(col =>
          <HeaderCell
            key={col.key}
            col={col}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            onResize={resizeColumn}
            onReorder={reorderColumn}
            onContextMenu={handleHeaderContextMenu}
          />
        )}
      </div>

      <ColumnMenu anchorRect={menuRect}
        onClose={() =>
          setMenuRect(null)} />

      {/* Body */}
      <div ref={scrollRef} className='track-table-scroll'>

        {grouping === 'none' || isLoading
          ? <div
            style={{
              height:   virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {isLoading
              ? virtualizer.getVirtualItems().map(vrow =>
                <div
                  key={vrow.key}
                  className='track-row skeleton-row'
                  style={{
                    position:  'absolute',
                    top:       0,
                    left:      0,
                    right:     0,
                    transform: `translateY(${vrow.start}px)`,
                    height:    rowHeight,
                  }}
                  aria-hidden='true'
                >
                  {visible.map(col =>
                    <span key={col.key} className={`col-${col.key}`}>
                      <Skeleton width={col.key === 'art' ? '24px' : '60%'} height={col.key === 'art' ? '24px' : undefined} />
                    </span>
                  )}
                </div>
              )
              : virtualizer.getVirtualItems().map(vrow => {
                const track = sorted[vrow.index]
                if (!track)
                  return null

                return (
                  <div
                    key={track.id}
                    style={{
                      position:  'absolute',
                      top:       0,
                      left:      0,
                      right:     0,
                      transform: `translateY(${vrow.start}px)`,
                      height:    rowHeight,
                    }}
                  >
                    {renderRow(track, vrow.index)}
                  </div>
                )
              })
            }
          </div>
          : grouping === 'album'
            ? <div className='track-groups album-groups'>
              {groups.map(g => {
                const first = g.tracks[0]
                return (
                  <div key={g.key} className='track-album-group'>
                    <div className='group-art'>
                      {first.albumArt
                        ? <img src={first.albumArt} alt='' />
                        : <span className='swatch' style={{ background: first.coverColor }} />
                      }
                    </div>

                    <div className='group-meta'>
                      <span className='group-title'>{g.label}</span>
                      <span className='group-subtitle'>{g.subtitle}</span>
                    </div>

                    <div className='group-tracks'>
                      {g.tracks.map((t, i) => {
                        const idx = sorted.findIndex(x =>
                          x.id === t.id)
                        return renderRow(t, idx >= 0 ? idx : i)
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            : <div className='track-groups flat-groups'>
              {groups.map(g =>
                <div key={g.key} className='track-flat-group'>
                  <div className='track-group-header'>
                    <span className='group-title'>{g.label}</span>
                    <span className='group-subtitle'>{g.subtitle}</span>
                  </div>

                  {g.tracks.map(t => {
                    const idx = sorted.findIndex(x =>
                      x.id === t.id)
                    return renderRow(t, idx)
                  })}
                </div>
              )}
            </div>
        }
      </div>

    </div>
  )
}
