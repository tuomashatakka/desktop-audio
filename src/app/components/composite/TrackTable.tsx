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
import type { Density, Grouping, Track } from '../../contexts'
import { Skeleton } from '../atomic/Skeleton'
import { Popover } from '../atomic/Popover'
import { Button } from '../atomic/Button'
import { Breadcrumbs } from './Breadcrumbs'
import type { SortKey } from '../../hooks/useSortableTable'
import { formatTime, isoDuration } from '../../utils/time'


const ROW_HEIGHT_BY_DENSITY: Record<Density, number> = {
  compact: 28,
  normal:  40,
  relaxed: 64,
}

const SKELETON_ROW_COUNT = 20

function withTableSemantics<T> (enabled: boolean, value: T): T | undefined {
  return enabled ? value : undefined
}

interface TrackTableProps {
  readonly tracks:         readonly Track[]
  readonly isLoading:      boolean
  readonly currentTrack:   Track | null
  readonly isPlaying:      boolean
  readonly onPlay:         (track: Track, index: number) => void
  readonly onContextMenu?: (track: Track, rect: DOMRect) => void
  readonly onNavigate?:    (path: string | null) => void
  readonly roots?:         readonly string[]
}

/** Human-readable file size in MB (or KB below 1 MB); `—` when unknown. */
function formatSize (bytes: number): string {
  if (!bytes)
    return '—'

  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

/** The directory holding `path`, handling both `/` and `\\` separators. */
function parentDir (path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return idx > 0 ? path.slice(0, idx) : '/'
}

/** Art and index columns carry no orderable value. */
function isSortableKey (key: ColumnKey): key is SortKey {
  return key !== 'art' && key !== 'index'
}

/** Always square, always cropped — see `.album-art` in views.css. */
function AlbumArt ({ src, color }: { readonly src?: string; readonly color?: string }) {
  return src
    ? <img className='album-art' src={src} alt='' loading='lazy' />
    : <span className='album-art' style={{ background: color }} />
}

type CellRenderer = (track: Track, index: number, density: Density) => React.ReactNode

/** Column renderers keep adding a column from inflating one giant switch. */
const CELL_RENDERERS: Record<ColumnKey, CellRenderer> = {
  art: track =>
    <AlbumArt src={track.albumArt} color={track.coverColor} />,
  index: (_track, index) =>
    index + 1,
  title: (track, _index, density) =>
    density === 'relaxed'
      ? <>
        <strong>{track.title}</strong>

        <small>
          {track.artist}
          {track.album ? ` — ${track.album}` : ''}
        </small>
      </>
      : track.title,
  artist: track =>
    track.artist,
  album: track =>
    track.album,
  year: track =>
    track.year ?? '',
  genre: track =>
    track.genre ?? '',
  duration: track =>
    <time dateTime={isoDuration(track.duration)}>{formatTime(track.duration)}</time>,
  format: track =>
    track.format?.toUpperCase() ?? '',
  size: track =>
    formatSize(track.size),
  trackNumber: track =>
    track.trackNumber ?? '',
  path: track =>
    track.path,
}

function cellValue (track: Track, key: ColumnKey, index: number, density: Density): React.ReactNode {
  return CELL_RENDERERS[key](track, index, density)
}

interface HeaderCellProps {
  readonly col:            ColumnConfig
  readonly sortKey:        SortKey
  readonly sortDir:        'asc' | 'desc'
  readonly toggleSort:     (key: SortKey) => void
  readonly onResize:       (key: ColumnKey, width: string) => void
  readonly onReorder:      (from: ColumnKey, to: ColumnKey) => void
  readonly tableSemantics: boolean
  readonly onContextMenu?: (anchor: HTMLElement) => void
}

/** One column header: click to sort, drag to reorder, drag the edge to resize. */
function HeaderCell ({ col, sortKey, sortDir, toggleSort, onResize, onReorder, tableSemantics, onContextMenu }: HeaderCellProps) {
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
      onContextMenu(ref.current)
  }

  return (
    <div
      ref={ref}
      role={tableSemantics ? 'columnheader' : sortable ? 'button' : undefined}
      draggable
      className={`track-column-header col-${col.key} ${isSorted ? 'sorted' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-sort={tableSemantics && isSorted ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}
      tabIndex={sortable ? 0 : undefined}
      onKeyDown={e => {
        if (sortable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          toggleSort(col.key as SortKey)
        }
      }}
    >
      <span className='label'>{col.label}</span>

      {isSorted &&
        <span aria-hidden='true'>{sortDir === 'asc' ? '▲' : '▼'}</span>
      }

      <span className='resize-handle' onMouseDown={handleResizeStart} aria-hidden='true' />
    </div>
  )
}

/** Popover listing every column with a checkbox, plus a reset button. */
function ColumnMenu ({ anchor, onClose }: { readonly anchor: HTMLElement | null; readonly onClose: () => void }) {
  const { columns, toggleColumn, resetColumns } = useColumnConfig()

  return (
    <Popover open={anchor !== null} anchor={anchor} label='Column options' onClose={onClose}>
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

        <Button type='button' variant='ghost' size='sm' onClick={resetColumns}>Reset</Button>
      </fieldset>
    </Popover>
  )
}

/** Group identity for a track under the active grouping mode. */
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

/**
 * The disclosure control for a group heading.
 *
 * Every grouping mode gets the same button rather than `<details>`: album
 * groups put the artwork outside the heading and path groups put an
 * interactive breadcrumb trail inside it, and neither survives being stuffed
 * into a `<summary>` — nesting interactive content there nests buttons in the
 * accessibility tree. One button next to the heading works for all three.
 */
function GroupToggle ({ open, controls, label, onToggle }: {
  readonly open:     boolean
  readonly controls: string
  readonly label:    string
  readonly onToggle: () => void
}) {
  return (
    <button
      type='button'
      className='group-toggle'
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      onClick={onToggle}
    >
      <span aria-hidden='true'>▸</span>
    </button>
  )
}

function groupLabel (track: Track, grouping: Grouping, path: string): string {
  if (grouping === 'album')
    return track.album || 'Unknown Album'
  if (grouping === 'artist')
    return track.artist || 'Unknown Artist'
  return path
}

/** Buckets an already-sorted list into labelled groups; empty when ungrouped. */
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
    const label = groupLabel(first, grouping, key)

    const count = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`
    const subtitle = grouping === 'album'
      ? `${first.artist || 'Unknown Artist'} · ${count}`
      : count

    out.push({ key, label, subtitle, tracks })
  }
  return out
}

/** See module docstring. */
export function TrackTable ({
  tracks,
  isLoading,
  currentTrack,
  isPlaying,
  onPlay,
  onContextMenu,
  onNavigate,
  roots = [],
}: TrackTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { density, grouping } = useUI()
  const { visible, gridTemplate, resizeColumn, reorderColumn } = useColumnConfig()
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(tracks)

  const [ menuAnchor, setMenuAnchor ] = useState<HTMLElement | null>(null)
  const [ focusedIndex, setFocusedIndex ] = useState(0)

  // Collapsed rather than expanded state: groups default to open, and a set
  // of exceptions survives regrouping and re-sorting without having to be
  // rebuilt every time the group list changes.
  const [ collapsedGroups, setCollapsedGroups ] = useState<ReadonlySet<string>>(new Set())

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(current => {
      const next = new Set(current)
      if (!next.delete(key))
        next.add(key)
      return next
    })
  }, [])

  const groups = useMemo(() =>
    buildGroups(sorted, grouping), [ sorted, grouping ])

  const rowHeight = ROW_HEIGHT_BY_DENSITY[density]

  /** Skeletons stand in for an empty list only — never over cached rows. */
  const showSkeleton = isLoading && sorted.length === 0
  const flat = grouping === 'none' || showSkeleton
  const tableSemantics = flat

  const virtualizer = useVirtualizer({
    count:            showSkeleton ? SKELETON_ROW_COUNT : flat ? sorted.length : 0,
    getScrollElement: () =>
      scrollRef.current,
    estimateSize: () =>
      rowHeight,
    overscan: 12,
  })

  const style = useMemo(() =>
    ({ '--track-grid': gridTemplate }) as React.CSSProperties,
  [ gridTemplate ])

  useEffect(() => {
    const currentIndex = currentTrack
      ? sorted.findIndex(track =>
        track.id === currentTrack.id)
      : -1

    setFocusedIndex(index =>
      currentIndex >= 0 ? currentIndex : Math.min(index, Math.max(0, sorted.length - 1)))
  }, [ currentTrack?.id, sorted ])

  const moveRowFocus = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(index, sorted.length - 1))
    setFocusedIndex(nextIndex)
    if (flat)
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' })

    window.requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-track-index='${nextIndex}']`)
        ?.focus()
    })
  }, [ flat, sorted.length, virtualizer ])

  const renderRow = useCallback((track: Track, index: number, rowStyle?: React.CSSProperties) => {
    const active = currentTrack?.id === track.id
    const activate = () => {
      setFocusedIndex(index)
      onPlay(track, index)
    }
    const openContextMenu = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      onContextMenu?.(track, event.currentTarget.getBoundingClientRect())
    }
    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        activate()
        return
      }

      const nextIndex = event.key === 'ArrowDown'
        ? index + 1
        : event.key === 'ArrowUp'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? sorted.length - 1
              : null
      if (nextIndex === null)
        return

      event.preventDefault()
      event.stopPropagation()
      moveRowFocus(nextIndex)
    }
    const cells = visible.map(col =>
      <span
        key={col.key}
        role={tableSemantics ? 'cell' : undefined}
        className={`col-${col.key}`}
      >
        {col.key === 'index' && active && isPlaying ? '▶' : cellValue(track, col.key, index, density)}
      </span>
    )

    if (!tableSemantics) {
      return (
        <button
          key={track.id}
          type='button'
          data-track-index={index}
          style={rowStyle}
          className={`track-row ${active ? 'active' : ''}`}
          onClick={activate}
          onContextMenu={openContextMenu}
          onFocus={() =>
            setFocusedIndex(index)}
          onKeyDown={handleKeyDown}
          tabIndex={index === focusedIndex ? 0 : -1}
          aria-current={active ? 'true' : undefined}
        >
          {cells}
        </button>
      )
    }

    return (
      <div
        key={track.id}
        role='row'
        aria-rowindex={index + 2}
        data-track-index={index}
        style={rowStyle}
        className={`track-row ${active ? 'active' : ''}`}
        onClick={activate}
        onContextMenu={openContextMenu}
        onFocus={() =>
          setFocusedIndex(index)}
        onKeyDown={handleKeyDown}
        tabIndex={index === focusedIndex ? 0 : -1}
        aria-selected={active}
      >
        {cells}
      </div>
    )
  }, [ tableSemantics, visible, density, currentTrack, isPlaying, onPlay, onContextMenu, focusedIndex, moveRowFocus, sorted.length ])

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

  const bodyRowCount = showSkeleton ? SKELETON_ROW_COUNT : sorted.length

  return (
    <section
      className='track-table'
      data-density={density}
      style={style}
      role={withTableSemantics(tableSemantics, 'table')}
      aria-label='Tracks'
      aria-colcount={withTableSemantics(tableSemantics, visible.length)}
      aria-rowcount={withTableSemantics(tableSemantics, bodyRowCount + 1)}
      aria-busy={isLoading || undefined}
    >
      <div ref={scrollRef} className='track-scroll' role={withTableSemantics(tableSemantics, 'presentation')}>

        <div className='track-header' role={withTableSemantics(tableSemantics, 'rowgroup')}>
          <div className='track-header-row' role={withTableSemantics(tableSemantics, 'row')} aria-rowindex={withTableSemantics(tableSemantics, 1)}>
            {visible.map(col =>
              <HeaderCell
                key={col.key}
                col={col}
                sortKey={sortKey}
                sortDir={sortDir}
                toggleSort={toggleSort}
                onResize={resizeColumn}
                onReorder={reorderColumn}
                tableSemantics={tableSemantics}
                onContextMenu={setMenuAnchor}
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
                  <div
                    key={vrow.key}
                    className='track-row'
                    style={rowStyle}
                    role='row'
                    aria-rowindex={vrow.index + 2}
                    aria-label='Loading track'
                  >
                    {visible.map(col =>
                      <span key={col.key} role='cell' className={`col-${col.key}`}>
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

          : <div className='track-body grouped'>
            {groups.map((g, groupIndex) => {
              const headingId = `track-group-${grouping}-${groupIndex}`
              const rowsId = `${headingId}-rows`
              const collapsed = collapsedGroups.has(g.key)

              // A collapsed group renders no rows at all rather than hiding
              // them: with a large library that is the difference between a
              // few hundred DOM nodes and a few thousand.
              const rows = collapsed
                ? null
                : g.tracks.map((t, i) =>
                  renderRow(t, indexOf(t, i)))

              const toggle =
                <GroupToggle
                  open={!collapsed}
                  controls={rowsId}
                  label={g.label}
                  onToggle={() =>
                    toggleGroup(g.key)}
                />

              if (grouping === 'album')
                return (
                  <section
                    key={g.key}
                    className='track-group album'
                    data-collapsed={collapsed || undefined}
                    aria-labelledby={headingId}
                  >
                    <AlbumArt src={g.tracks[0].albumArt} color={g.tracks[0].coverColor} />

                    <header>
                      {toggle}
                      <h3 id={headingId}>{g.label}</h3>
                      <small>{g.subtitle}</small>
                    </header>

                    <div className='group-rows' id={rowsId} hidden={collapsed}>{rows}</div>
                  </section>
                )

              // Path groups head with a clickable trail rather than a plain
              // heading, so the folder they represent stays navigable.
              if (grouping === 'path')
                return (
                  <section
                    key={g.key}
                    className='track-group'
                    data-collapsed={collapsed || undefined}
                    aria-label={g.key}
                  >
                    <header>
                      {toggle}

                      <Breadcrumbs
                        path={g.key}
                        roots={roots}
                        onNavigate={p =>
                          onNavigate?.(p)}
                        label='Group folder'
                      />

                      <small>{g.subtitle}</small>
                    </header>

                    <div className='group-rows' id={rowsId} hidden={collapsed}>{rows}</div>
                  </section>
                )

              return (
                <section
                  key={g.key}
                  className='track-group'
                  data-collapsed={collapsed || undefined}
                  aria-labelledby={headingId}
                >
                  <header>
                    {toggle}
                    <h3 className='group-title' id={headingId}>{g.label}</h3>
                    <small>{g.subtitle}</small>
                  </header>

                  <div className='group-rows' id={rowsId} hidden={collapsed}>{rows}</div>
                </section>
              )
            })}
          </div>
        }
      </div>

      <ColumnMenu anchor={menuAnchor}
        onClose={() =>
          setMenuAnchor(null)} />
    </section>
  )
}
