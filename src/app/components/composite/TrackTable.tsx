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
/* eslint-disable react-strict/no-style-prop -- Every `style` here carries a
   value CSS cannot know: virtualizer row offsets, the user's resized column
   template, and per-track cover colours. They are geometry and data, not
   presentation choices that belong in a stylesheet. */

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { VirtualItem } from '@tanstack/react-virtual'
import { useSortableTable } from '../../hooks/useSortableTable'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useArtwork } from '../../hooks/useArtwork'
import type { ColumnKey, ColumnConfig } from '../../hooks/useColumnConfig'
import { useUI } from '../../contexts'
import type { Density, Grouping, Track } from '../../contexts'
import { Skeleton } from '../atomic/Skeleton'
import { Popover } from '../atomic/Popover'
import type { PopoverPoint } from '../atomic/Popover'
import { Button } from '../atomic/Button'
import { Icon } from '../atomic/Icon'
import { Breadcrumbs } from './Breadcrumbs'
import type { SortKey } from '../../hooks/useSortableTable'
import { formatTime, isoDuration } from '../../utils/time'
import { listenAll } from '../../utils/events'


const ROW_HEIGHT_BY_DENSITY: Record<Density, number> = {
  compact: 28,
  normal:  40,
  relaxed: 64,
}

const SKELETON_ROW_COUNT = 20

/** Placeholder bar width for a text cell while the row is loading. */
const SKELETON_TEXT_WIDTH = '60%'

/** Rows rendered beyond the viewport, so fast scrolling doesn't show gaps. */
const ROW_OVERSCAN = 12

/** A column narrower than this can no longer show its own label. */
const MIN_COLUMN_WIDTH = 48

/** Bytes per unit, for the size column. */
const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB

/** Below one full megabyte the size column falls back to kilobytes. */
const MIN_MB_FOR_MB_UNIT = 1

/** ARIA row indices are 1-based; the header occupies the first row. */
const ARIA_HEADER_ROW_INDEX = 1
const ARIA_BODY_ROW_OFFSET  = ARIA_HEADER_ROW_INDEX + 1

function withTableSemantics<T> (enabled: boolean, value: T): T | undefined {
  return enabled ? value : undefined
}

interface TrackTableProps {
  readonly tracks:         readonly Track[]
  readonly isLoading:      boolean
  readonly currentTrack:   Track | null
  readonly isPlaying:      boolean
  readonly onPlay:         (track: Track, index: number) => void
  readonly onContextMenu?: (track: Track, point: PopoverPoint) => void
  readonly onNavigate?:    (path: string | null) => void
  readonly roots?:         readonly string[]
}

/** Human-readable file size in MB (or KB below 1 MB); `—` when unknown. */
function formatSize (bytes: number): string {
  if (!bytes)
    return '—'

  const mb = bytes / BYTES_PER_MB
  return mb >= MIN_MB_FOR_MB_UNIT
    ? `${mb.toFixed(1)} MB`
    : `${Math.round(bytes / BYTES_PER_KB)} KB`
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
type AlbumArtProps = { readonly trackId?: string; readonly color?: string }

/**
 * Art arrives after the row does.
 *
 * Track DTOs carry no `albumArt` — it is fetched per track, downscaled to a
 * thumbnail host-side, and cached across mounts by {@link useArtwork}. The
 * `coverColor` block is not a placeholder so much as the resting state: most
 * tracks have no cover at all, and this is what they keep showing.
 */
function AlbumArt ({ trackId, color }: AlbumArtProps) {
  const src = useArtwork(trackId)

  return src
    ? <img className='album-art' src={ src } alt='' loading='lazy' />
    : <span className='album-art' style={{ background: color }} />
}

type CellRenderer = (track: Track, index: number, density: Density) => React.ReactNode

/** Column renderers keep adding a column from inflating one giant switch. */
const CELL_RENDERERS: Record<ColumnKey, CellRenderer> = {
  art: track =>
    <AlbumArt trackId={ track.id } color={ track.coverColor } />,
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
    <time dateTime={ isoDuration(track.duration) }>{formatTime(track.duration)}</time>,
  format: track =>
    track.format?.toUpperCase() ?? '',
  size: track =>
    formatSize(track.size),
  trackNumber: track =>
    track.trackNumber ?? '',
  rating: track =>
    track.rating ? `${track.rating}/5` : '',
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
  readonly onContextMenu?: (point: PopoverPoint) => void
}

/** One column header: click to sort, drag to reorder, drag the edge to resize. */
function HeaderCell ({ col, sortKey, sortDir, toggleSort, onResize, onReorder, tableSemantics, onContextMenu }: HeaderCellProps) {
  const ref      = useRef<HTMLDivElement>(null)
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

    const startX     = e.clientX
    const startWidth = ref.current?.getBoundingClientRect().width ?? 0

    // Bound for the gesture only; the mouseup handler disposes both at once.
    const drag = listenAll(window, {
      mousemove: event => {
        const delta = (event as MouseEvent).clientX - startX
        onResize(col.key, `${Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + delta))}px`)
      },
      mouseup: () =>
        drag.dispose(),
    })
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onContextMenu)
      onContextMenu({ x: e.clientX, y: e.clientY })
  }

  return <div
    ref={ ref }
    className={ `track-column-header col-${col.key} ${isSorted ? 'sorted' : ''}` }
    aria-sort={ tableSemantics && isSorted ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined }
    role={ tableSemantics ? 'columnheader' : sortable ? 'button' : undefined }
    draggable
    tabIndex={ sortable ? 0 : undefined }
    onClick={ handleClick }
    onContextMenu={ handleContextMenu }
    onDragStart={ handleDragStart }
    onDragOver={ handleDragOver }
    onDrop={ handleDrop }
    onKeyDown={ e => {
      if (sortable && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        toggleSort(col.key as SortKey)
      }
    } }>
    <span className='label'>{col.label}</span>

    {isSorted &&
        <Icon className={ sortDir === 'asc' ? 'sort-ascending' : 'sort-descending' } name='chevron-right' />
    }

    <span className='resize-handle' aria-hidden='true' onMouseDown={ handleResizeStart } />
  </div>
}

/** Pointer-positioned popover listing every column, plus a reset button. */
type ColumnMenuProps = {
  readonly point:        PopoverPoint | null
  readonly columns:      readonly ColumnConfig[]
  readonly toggleColumn: (key: ColumnKey) => void
  readonly resetColumns: () => void
  readonly onClose:      () => void
}

function ColumnMenu ({
  point,
  columns,
  toggleColumn,
  resetColumns,
  onClose,
}: ColumnMenuProps) {
  return <Popover open={ point !== null } point={ point } onClose={ onClose }>
    <fieldset className='config-menu'>
      <legend>Columns</legend>

      {columns.map(c =>
        <label key={ c.key }>
          <input
            type='checkbox'
            checked={ c.visible }
            disabled={ c.fixed }
            onChange={ () =>
              toggleColumn(c.key) } />

          {c.label || c.key}
        </label>
      )}

      <Button type='button' variant='ghost' size='sm' onClick={ resetColumns }>Reset</Button>
    </fieldset>
  </Popover>
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
type GroupToggleProps = {
  readonly open:     boolean
  readonly controls: string
  readonly label:    string
  readonly onToggle: (toggleAll: boolean) => void
}

function GroupToggle ({ open, controls, label, onToggle }: GroupToggleProps) {
  return <button
    className='group-toggle'
    aria-expanded={ open }
    aria-controls={ controls }
    aria-label={ `${open ? 'Collapse' : 'Expand'} ${label}` }
    type='button'
    onClick={ event =>
      onToggle(event.altKey) }>
    <Icon name='chevron-right' />
  </button>
}

function groupLabel (track: Track, grouping: Grouping, path: string): string {
  if (grouping === 'album')
    return track.album || 'Unknown Album'
  if (grouping === 'artist')
    return track.artist || 'Unknown Artist'
  return path
}

/** Absolute placement for one virtualized row inside the spacer. */
function virtualRowStyle (start: number, size: number): React.CSSProperties {
  return {
    position:    'absolute',
    insetInline: 0,
    top:         0,
    height:      size,
    transform:   `translateY(${start}px)`,
  }
}

interface SkeletonRowProps {
  readonly columns: readonly ColumnConfig[]
  readonly index:   number
  readonly style:   React.CSSProperties
}

/** Placeholder row shown while the list is still empty and a scan is running. */
function SkeletonRow ({ columns, index, style }: SkeletonRowProps) {
  return <div
    className='track-row'
    style={ style }
    aria-rowindex={ index + ARIA_BODY_ROW_OFFSET }
    aria-label='Loading track'
    role='row'>
    {columns.map(col =>
      <span key={ col.key } className={ `col-${col.key}` } role='cell'>
        <Skeleton
          width={ col.key === 'art' ? 'var(--art)' : SKELETON_TEXT_WIDTH }
          height={ col.key === 'art' ? 'var(--art)' : undefined } />
      </span>
    )}
  </div>
}

interface TrackGroupProps {
  readonly group:       GroupBlock
  readonly grouping:    Grouping
  readonly headingId:   string
  readonly collapsed:   boolean
  readonly roots:       readonly string[]
  readonly renderRow:   (track: Track, index: number) => React.ReactNode
  readonly indexOf:     (track: Track, fallback: number) => number
  readonly onToggle:    (key: string, toggleAll: boolean) => void
  readonly onNavigate?: (path: string | null) => void
}

/**
 * One labelled group of rows.
 *
 * The three grouping modes differ only in their heading: album groups put
 * artwork beside it, path groups put an interactive breadcrumb trail inside
 * it, and artist groups use a plain title.
 */
function TrackGroup ({
  group, grouping, headingId, collapsed, roots, renderRow, indexOf, onToggle, onNavigate,
}: TrackGroupProps) {
  const rowsId = `${headingId}-rows`

  // A collapsed group renders no rows at all rather than hiding them: with a
  // large library that is the difference between a few hundred DOM nodes and
  // a few thousand.
  const rows = collapsed
    ? null
    : group.tracks.map((track, i) =>
      renderRow(track, indexOf(track, i)))

  const toggle =
    <GroupToggle
      open={ !collapsed }
      controls={ rowsId }
      label={ group.label }
      onToggle={ toggleAll =>
        onToggle(group.key, toggleAll) } />

  const body = <div className='group-rows' id={ rowsId } hidden={ collapsed }>{rows}</div>

  if (grouping === 'album')
    return <section
      className='track-group album'
      data-collapsed={ collapsed || undefined }
      data-group-key={ group.key }
      aria-labelledby={ headingId }>
      <AlbumArt trackId={ group.tracks[0].id } color={ group.tracks[0].coverColor } />

      <header>
        {toggle}
        <h3 id={ headingId }>{group.label}</h3>
        <small>{group.subtitle}</small>
      </header>

      {body}
    </section>

  // Path groups head with a clickable trail rather than a plain heading, so
  // the folder they represent stays navigable.
  if (grouping === 'path')
    return <section
      className='track-group'
      data-collapsed={ collapsed || undefined }
      data-group-key={ group.key }
      aria-label={ group.key }>
      <header>
        {toggle}

        <Breadcrumbs
          path={ group.key }
          roots={ roots }
          label='Group folder'
          onNavigate={ path =>
            onNavigate?.(path) } />

        <small>{group.subtitle}</small>
      </header>

      {body}
    </section>

  return <section
    className='track-group'
    data-collapsed={ collapsed || undefined }
    data-group-key={ group.key }
    aria-labelledby={ headingId }>
    <header>
      {toggle}
      <h3 className='group-title' id={ headingId }>{group.label}</h3>
      <small>{group.subtitle}</small>
    </header>

    {body}
  </section>
}

/** A track's position in the globally sorted list; `fallback` when missing. */
function indexOfTrack (sorted: readonly Track[], track: Track, fallback = 0): number {
  const index = sorted.findIndex(candidate =>
    candidate.id === track.id)
  return index >= 0 ? index : fallback
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

    const count    = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`
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
  const scrollRef             = useRef<HTMLDivElement>(null)
  const { density, grouping } = useUI()
  const {
    columns,
    visible,
    gridTemplate,
    toggleColumn,
    resizeColumn,
    reorderColumn,
    resetColumns,
  }                                              = useColumnConfig()
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(tracks)

  const [ menuPoint, setMenuPoint ]       = useState<PopoverPoint | null>(null)
  const [ focusedIndex, setFocusedIndex ] = useState(0)

  // Collapsed rather than expanded state: groups default to open, and a set
  // of exceptions survives regrouping and re-sorting without having to be
  // rebuilt every time the group list changes.
  const [ collapsedGroups, setCollapsedGroups ] = useState<ReadonlySet<string>>(() =>
    new Set())

  const groups = useMemo(() =>
    buildGroups(sorted, grouping), [ sorted, grouping ])

  const toggleGroup = useCallback((key: string, toggleAll: boolean) => {
    setCollapsedGroups(current => {
      const willCollapse = !current.has(key)
      if (toggleAll)
        return willCollapse
          ? new Set(groups.map(group =>
            group.key))
          : new Set()

      const next = new Set(current)
      if (willCollapse)
        next.add(key)
      else
        next.delete(key)
      return next
    })
  }, [ groups ])

  const rowHeight = ROW_HEIGHT_BY_DENSITY[density]

  /** Skeletons stand in for an empty list only — never over cached rows. */
  const showSkeleton   = isLoading && sorted.length === 0
  const flat           = grouping === 'none' || showSkeleton
  const tableSemantics = flat

  /**
   * Row ids in the order they are actually rendered, and the group each one
   * sits in.
   *
   * Grouped views render group by group, but a row's *index* is its position
   * in the globally sorted list, so it can display a stable row number. Arrow
   * keys used to step through those global indices, which in a grouped view
   * jumps to whatever row happens to hold the adjacent number rather than the
   * row below. Navigation walks this list instead.
   */
  const visibleRows = useMemo(() => {
    if (flat)
      return sorted.map((track, index) =>
        ({ index, groupKey: null as string | null }))

    const rows: { index: number; groupKey: string | null }[] = []
    for (const group of groups) {
      if (collapsedGroups.has(group.key))
        continue
      for (const track of group.tracks)
        rows.push({ index: indexOfTrack(sorted, track), groupKey: group.key })
    }
    return rows
  }, [ flat, sorted, groups, collapsedGroups ])

  const virtualizer = useVirtualizer({
    count:            showSkeleton ? SKELETON_ROW_COUNT : flat ? sorted.length : 0,
    getScrollElement: () =>
      scrollRef.current,
    estimateSize: () =>
      rowHeight,
    overscan: ROW_OVERSCAN,
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

  /** Focus the row at `position` in the rendered order. */
  const focusRowAt = useCallback((position: number) => {
    const clamped = Math.max(0, Math.min(position, visibleRows.length - 1))
    const target  = visibleRows[clamped]
    if (!target)
      return

    setFocusedIndex(target.index)
    if (flat)
      virtualizer.scrollToIndex(target.index, { align: 'auto' })

    window.requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-track-index='${target.index}']`)
        ?.focus()
    })
  }, [ flat, visibleRows, virtualizer ])

  /** Step `delta` rows through the rendered order from the row at `index`. */
  const moveRowFocus = useCallback((index: number, delta: number) => {
    const position = visibleRows.findIndex(row =>
      row.index === index)
    focusRowAt((position < 0 ? 0 : position) + delta)
  }, [ visibleRows, focusRowAt ])

  /** The group a rendered row belongs to; `null` in a flat list. */
  const groupKeyOf = useCallback((index: number) =>
    visibleRows.find(row =>
      row.index === index)?.groupKey ?? null, [ visibleRows ])

  /** Collapse the row's group and move focus to its heading toggle. */
  const collapseGroupOf = useCallback((index: number) => {
    const key = groupKeyOf(index)
    if (key === null || collapsedGroups.has(key))
      return

    toggleGroup(key, false)
    window.requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-group-key='${CSS.escape(key)}'] .group-toggle`)
        ?.focus()
    })
  }, [ groupKeyOf, collapsedGroups, toggleGroup ])

  /** Expand the row's group; a row is only reachable when it is open already. */
  const expandGroupOf = useCallback((index: number) => {
    const key = groupKeyOf(index)
    if (key !== null && collapsedGroups.has(key))
      toggleGroup(key, false)
  }, [ groupKeyOf, collapsedGroups, toggleGroup ])

  const renderRow = useCallback((track: Track, index: number, rowStyle?: React.CSSProperties) => {
    const active   = currentTrack?.id === track.id
    const activate = () => {
      setFocusedIndex(index)
      onPlay(track, index)
    }
    const openContextMenu = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      onContextMenu?.(track, { x: event.screenX, y: event.screenY })
    }
    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        activate()
        return
      }

      switch (event.key) {
        case 'ArrowDown': moveRowFocus(index, 1); break
        case 'ArrowUp': moveRowFocus(index, -1); break
        case 'Home': focusRowAt(0); break
        case 'End': focusRowAt(Number.MAX_SAFE_INTEGER); break
        // Left/Right mirror the sidebar tree: Right opens the group this row
        // belongs to, Left closes it and moves focus up to its heading. Both
        // are no-ops in a flat list, which has no parent to close.
        case 'ArrowLeft': collapseGroupOf(index); break
        case 'ArrowRight': expandGroupOf(index); break
        default: return
      }

      event.preventDefault()
      event.stopPropagation()
    }
    const cells = visible.map(col =>
      <span
        key={ col.key }
        className={ `col-${col.key}` }
        role={ tableSemantics ? 'cell' : undefined }>
        {col.key === 'index' && active && isPlaying
          ? <Icon name='play' />
          : cellValue(track, col.key, index, density)}
      </span>
    )

    if (!tableSemantics)
      return <button
        key={ track.id }
        style={ rowStyle }
        className={ `track-row ${active ? 'active' : ''}` }
        data-track-index={ index }
        aria-current={ active ? 'true' : undefined }
        type='button'
        tabIndex={ index === focusedIndex ? 0 : -1 }
        onClick={ activate }
        onContextMenu={ openContextMenu }
        onFocus={ () =>
          setFocusedIndex(index) }
        onKeyDown={ handleKeyDown }>
        {cells}
      </button>

    return <div
      key={ track.id }
      style={ rowStyle }
      className={ `track-row ${active ? 'active' : ''}` }
      aria-rowindex={ index + ARIA_BODY_ROW_OFFSET }
      data-track-index={ index }
      aria-selected={ active }
      role='row'
      tabIndex={ index === focusedIndex ? 0 : -1 }
      onClick={ activate }
      onContextMenu={ openContextMenu }
      onFocus={ () =>
        setFocusedIndex(index) }
      onKeyDown={ handleKeyDown }>
      {cells}
    </div>
  }, [ tableSemantics, visible, density, currentTrack, isPlaying, onPlay, onContextMenu, focusedIndex, moveRowFocus, focusRowAt, collapseGroupOf, expandGroupOf ])

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
  const indexOf = useCallback((track: Track, fallback: number) =>
    indexOfTrack(sorted, track, fallback), [ sorted ])

  const bodyRowCount = showSkeleton ? SKELETON_ROW_COUNT : sorted.length

  /** One virtualized row, placed absolutely at the offset the virtualizer gives. */
  const renderVirtualRow = useCallback((vrow: VirtualItem) => {
    const track = sorted[vrow.index]
    return track
      ? renderRow(track, vrow.index, virtualRowStyle(vrow.start, vrow.size))
      : null
  }, [ renderRow, sorted ])

  return <section
    className='track-table'
    style={ style }
    data-density={ density }
    aria-label='Tracks'
    aria-colcount={ withTableSemantics(tableSemantics, visible.length) }
    aria-rowcount={ withTableSemantics(tableSemantics, bodyRowCount + ARIA_HEADER_ROW_INDEX) }
    aria-busy={ isLoading || undefined }
    role={ withTableSemantics(tableSemantics, 'table') }>
    <div ref={ scrollRef } className='track-scroll' role={ withTableSemantics(tableSemantics, 'presentation') }>

      <header className='track-header' role={ withTableSemantics(tableSemantics, 'rowgroup') }>
        <div className='track-header-row' aria-rowindex={ withTableSemantics(tableSemantics, ARIA_HEADER_ROW_INDEX) } role={ withTableSemantics(tableSemantics, 'row') }>
          {visible.map(col =>
            <HeaderCell
              key={ col.key }
              col={ col }
              sortKey={ sortKey }
              sortDir={ sortDir }
              toggleSort={ toggleSort }
              tableSemantics={ tableSemantics }
              onResize={ resizeColumn }
              onReorder={ reorderColumn }
              onContextMenu={ setMenuPoint } />
          )}
        </div>
      </header>

      {flat
        ? <div className='track-body' style={{ height: virtualizer.getTotalSize() }} role='rowgroup'>
          {virtualizer.getVirtualItems().map(vrow =>
            showSkeleton
              ? <SkeletonRow
                key={ vrow.key }
                style={ virtualRowStyle(vrow.start, vrow.size) }
                columns={ visible }
                index={ vrow.index } />
              : renderVirtualRow(vrow))}
        </div>

        : <div className='track-body grouped'>
          {groups.map((group, groupIndex) =>
            <TrackGroup
              key={ group.key }
              group={ group }
              grouping={ grouping }
              headingId={ `track-group-${grouping}-${groupIndex}` }
              collapsed={ collapsedGroups.has(group.key) }
              roots={ roots }
              renderRow={ renderRow }
              indexOf={ indexOf }
              onToggle={ toggleGroup }
              onNavigate={ onNavigate } />
          )}
        </div>
      }
    </div>

    <ColumnMenu
      point={ menuPoint }
      columns={ columns }
      toggleColumn={ toggleColumn }
      resetColumns={ resetColumns }
      onClose={ () =>
        setMenuPoint(null) } />
  </section>
}
