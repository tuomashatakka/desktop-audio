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
 *
 * Clicking a row *selects* it — plainly, or with Ctrl/Cmd and Shift for the
 * usual file-manager multi-selection — and double-clicking is what starts
 * playback. A single click used to play, which made picking three tracks to
 * drag somewhere impossible without playing all three on the way.
 *
 * Rows, folder rows and group headings are all drag sources, so anything
 * visible here can be dropped on a playlist. Dragging a row that is part of
 * the selection drags the whole selection; dragging one outside it selects
 * that row first, which is the only reading that does not silently carry rows
 * the user cannot see they are carrying.
 */
/* eslint-disable react-strict/no-style-prop -- Every `style` here carries a
   value CSS cannot know: virtualizer row offsets, the user's resized column
   template, and per-track cover colours. They are geometry and data, not
   presentation choices that belong in a stylesheet. */

import { useRef, useState, useMemo, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { VirtualItem } from '@tanstack/react-virtual'
import { useSortableTable } from '../../hooks/useSortableTable'
import { useRowSelection } from '../../hooks/useRowSelection'
import type { ColumnConfig } from '../../hooks/useColumnConfig'
import { useUI } from '../../contexts'
import type { Grouping, Track } from '../../contexts'
import { buildGroups } from '../../utils/grouping'
import type { GroupBlock } from '../../utils/grouping'
import { AlbumArt } from '../atomic/AlbumArt'
import { Skeleton } from '../atomic/Skeleton'
import type { PopoverPoint } from '../atomic/Popover'
import { Icon } from '../atomic/Icon'
import { Breadcrumbs } from './Breadcrumbs'
import { FolderRows } from './FolderRows'
import { cellValue, ColumnMenu, HeaderCell, rowDensityOf } from './TrackTableColumns'
import type { ColumnMenuTarget, RowDensity } from './TrackTableColumns'
import { setDragPayload } from '../../utils/dnd'
import type { FolderRow } from '../../utils/folders'


const ROW_HEIGHT_BY_DENSITY: Record<RowDensity, number> = {
  compact: 28,
  normal:  40,
  relaxed: 64,
}

const SKELETON_ROW_COUNT = 20

/** Placeholder bar width for a text cell while the row is loading. */
const SKELETON_TEXT_WIDTH = '60%'

/** Rows rendered beyond the viewport, so fast scrolling doesn't show gaps. */
const ROW_OVERSCAN = 12

/** ARIA row indices are 1-based; the header occupies the first row. */
const ARIA_HEADER_ROW_INDEX = 1
const ARIA_BODY_ROW_OFFSET  = ARIA_HEADER_ROW_INDEX + 1

function withTableSemantics<T> (enabled: boolean, value: T): T | undefined {
  return enabled ? value : undefined
}

interface TrackTableProps {
  readonly tracks:       readonly Track[]
  readonly isLoading:    boolean
  readonly currentTrack: Track | null
  readonly isPlaying:    boolean
  readonly onPlay:       (track: Track, index: number) => void

  /** Play a whole group — the album heading's cover. */
  readonly onPlayGroup?:   (tracks: readonly Track[]) => void
  readonly onContextMenu?: (track: Track, point: PopoverPoint) => void
  readonly onNavigate?:    (path: string | null) => void
  readonly roots?:         readonly string[]

  /**
   * Subfolders to list above the tracks. The caller decides whether there are
   * any — this component only decides where they go.
   */
  readonly folders?: readonly FolderRow[]

  /**
   * Names a list whose given order is the answer (the queue, the history), so
   * the table shows it as handed in rather than sorted. See
   * {@link useSortableTable}.
   */
  readonly naturalOrder?: string | null
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
  readonly onPlay?:     (tracks: readonly Track[]) => void
}

/**
 * One labelled group of rows.
 *
 * The three grouping modes differ only in their heading: album groups put
 * artwork beside it, path groups put an interactive breadcrumb trail inside
 * it, and artist groups use a plain title.
 */
function TrackGroup ({
  group, grouping, headingId, collapsed, roots, renderRow, indexOf, onToggle, onNavigate, onPlay,
}: TrackGroupProps) {
  const rowsId = `${headingId}-rows`

  /**
   * The heading is the album's handle: dragging it onto a playlist adds the
   * whole bucket. It carries the bucket's *key* rather than its tracks, so the
   * drop resolves against the library as it stands at that moment.
   */
  const dragProps = {
    draggable:   grouping !== 'none',
    onDragStart: (event: React.DragEvent) => {
      if (grouping === 'none')
        return

      event.stopPropagation()
      setDragPayload(event.dataTransfer, {
        kind:  'group',
        grouping,
        key:   group.key,
        label: group.label,
      })
    },
  }

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
      {/* The cover plays the album. It can be a button here because the
            artwork sits outside <header> and outside every row — a row is
            itself a <button> in grouped mode, so a nested control there
            would be invalid and silently unnested by the parser. */}
      <button
        className='album-art-play'
        aria-label={ `Play ${group.label}` }
        type='button'
        onClick={ () =>
          onPlay?.(group.tracks) }>
        <AlbumArt trackId={ group.tracks[0].id } color={ group.tracks[0].coverColor } />
        <Icon name='play' />
      </button>

      <header { ...dragProps }>
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
      <header { ...dragProps }>
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
    <header { ...dragProps }>
      {toggle}
      <h3 className='group-title' id={ headingId }>{group.label}</h3>
      <small>{group.subtitle}</small>
    </header>

    {body}
  </section>
}

/** See module docstring. */
export function TrackTable ({
  tracks,
  isLoading,
  currentTrack,
  isPlaying,
  onPlay,
  onPlayGroup,
  onContextMenu,
  onNavigate,
  roots = [],
  folders,
  naturalOrder,
}: TrackTableProps) {
  const scrollRef  = useRef<HTMLDivElement>(null)
  const {
    density, grouping,
    columns, visible, gridTemplate, toggleColumn, resizeColumn, reorderColumn, resetColumns,
  }                = useUI()
  const rowDensity = rowDensityOf(density)
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(tracks, naturalOrder)
  const selection                                = useRowSelection()

  /**
   * Grouped rendering needs the global row number for every track. A map keeps
   * that linear; repeatedly calling `findIndex` made one grouped render O(n²).
   */
  const sortedIndexById = useMemo(() => {
    const indices = new Map<string, number>()
    for (const [ index, track ] of sorted.entries())
      indices.set(track.id, index)
    return indices
  }, [ sorted ])

  const [ menu, setMenu ]                 = useState<ColumnMenuTarget | null>(null)
  const [ focusedIndex, setFocusedIndex ] = useState(0)

  /** The folder row the user last clicked; folders select one at a time. */
  const [ selectedFolder, setSelectedFolder ] = useState<string | null>(null)

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

  const rowHeight = ROW_HEIGHT_BY_DENSITY[rowDensity]

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
        rows.push({ index: sortedIndexById.get(track.id) ?? 0, groupKey: group.key })
    }
    return rows
  }, [ flat, sorted, groups, collapsedGroups, sortedIndexById ])

  /**
   * Track ids in render order — what a Shift-click range is measured against.
   * The sorted order is not it: in a grouped view the row below is rarely the
   * next sorted index.
   */
  const visibleIds = useMemo(() =>
    visibleRows
      .map(row =>
        sorted[row.index]?.id)
      .filter((id): id is string =>
        id !== undefined), [ visibleRows, sorted ])

  /** Render position and parent group for O(1) keyboard navigation lookups. */
  const visibleRowByIndex = useMemo(() => {
    const rows = new Map<number, { position: number; groupKey: string | null }>()
    for (const [ position, row ] of visibleRows.entries())
      rows.set(row.index, { position, groupKey: row.groupKey })
    return rows
  }, [ visibleRows ])

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

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Reconciles the focused row with a track change originating outside this component; the fallback deliberately preserves the user's own focus when it can.
  useEffect(() => {
    const currentIndex = currentTrack
      ? sortedIndexById.get(currentTrack.id) ?? -1
      : -1

    setFocusedIndex(index =>
      currentIndex >= 0 ? currentIndex : Math.min(index, Math.max(0, sorted.length - 1)))
  }, [ currentTrack?.id, sorted.length, sortedIndexById ])

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
    const position = visibleRowByIndex.get(index)?.position ?? -1
    focusRowAt((position < 0 ? 0 : position) + delta)
  }, [ visibleRowByIndex, focusRowAt ])

  /** The group a rendered row belongs to; `null` in a flat list. */
  const groupKeyOf = useCallback((index: number) =>
    visibleRowByIndex.get(index)?.groupKey ?? null, [ visibleRowByIndex ])

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

  /**
   * Start playback of one row, and make it the selection.
   *
   * Playing something the selection does not contain would leave two different
   * answers to "which row is this table about" on screen at once.
   */
  const activateRow = useCallback((track: Track, index: number) => {
    setFocusedIndex(index)
    selection.replace([ track.id ])
    setSelectedFolder(null)
    onPlay(track, index)
  }, [ onPlay, selection ])

  /** A row that is already selected drags the whole selection with it. */
  const startRowDrag = useCallback((track: Track, event: React.DragEvent) => {
    const inSelection = selection.isSelected(track.id)
    if (!inSelection)
      selection.replace([ track.id ])

    const ids = inSelection
      ? visibleIds.filter(id =>
        selection.selected.has(id))
      : [ track.id ]

    setDragPayload(event.dataTransfer, {
      kind:     'tracks',
      trackIds: ids,
      label:    ids.length > 1 ? `${ids.length} tracks` : track.title,
    })
  }, [ selection, visibleIds ])

  const renderRow = useCallback((track: Track, index: number, rowStyle?: React.CSSProperties) => {
    const active   = currentTrack?.id === track.id
    const selected = selection.isSelected(track.id)
    const activate = () =>
      activateRow(track, index)

    /**
     * A plain click selects; Ctrl/Cmd toggles one row and Shift takes the run
     * from the anchor. Double-clicking is what plays — see the module
     * docstring.
     */
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      setFocusedIndex(index)
      setSelectedFolder(null)
      selection.select(track.id, visibleIds, {
        toggle: event.ctrlKey || event.metaKey,
        range:  event.shiftKey,
      })
    }

    const openContextMenu = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()

      // Right-clicking outside the selection moves it, so the menu always acts
      // on what is highlighted.
      if (!selection.isSelected(track.id))
        selection.replace([ track.id ])

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
          : cellValue(track, col.key, index, rowDensity)}
      </span>
    )

    if (!tableSemantics)
      return <button
        key={ track.id }
        style={ rowStyle }
        className={ `track-row ${active ? 'active' : ''}` }
        data-track-index={ index }
        data-track-id={ track.id }
        data-selected={ selected || undefined }
        aria-current={ active ? 'true' : undefined }
        aria-pressed={ selected }
        draggable
        type='button'
        tabIndex={ index === focusedIndex ? 0 : -1 }
        onClick={ handleClick }
        onDoubleClick={ activate }
        onDragStart={ event =>
          startRowDrag(track, event) }
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
      data-track-id={ track.id }
      data-selected={ selected || undefined }
      aria-current={ active ? 'true' : undefined }
      aria-selected={ selected }
      draggable
      role='row'
      tabIndex={ index === focusedIndex ? 0 : -1 }
      onClick={ handleClick }
      onDoubleClick={ activate }
      onDragStart={ event =>
        startRowDrag(track, event) }
      onContextMenu={ openContextMenu }
      onFocus={ () =>
        setFocusedIndex(index) }
      onKeyDown={ handleKeyDown }>
      {cells}
    </div>
  }, [ tableSemantics, visible, rowDensity, currentTrack, isPlaying, onContextMenu, focusedIndex, moveRowFocus, focusRowAt, collapseGroupOf, expandGroupOf, selection, visibleIds, activateRow, startRowDrag ])

  // Keep the playing track in view (flat list only — grouped views aren't
  // virtualized, so the virtualizer has no offsets to scroll to).
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Calls `virtualizer.scrollToIndex`, an imperative scroll no render can express.
  useEffect(() => {
    if (!currentTrack || !flat || showSkeleton)
      return

    const index = sortedIndexById.get(currentTrack.id) ?? -1
    if (index >= 0)
      virtualizer.scrollToIndex(index, { align: 'center' })
  }, [ currentTrack?.id, flat, showSkeleton, sortedIndexById, virtualizer ])

  /** Row index within the full sorted list, so numbering survives grouping. */
  const indexOf = useCallback((track: Track, fallback: number) =>
    sortedIndexById.get(track.id) ?? fallback, [ sortedIndexById ])

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
    data-density={ rowDensity }
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
              onContextMenu={ (key, point) =>
                setMenu({ key, point }) } />
          )}
        </div>
      </header>

      <FolderRows
        folders={ folders }
        selectedPath={ selectedFolder }
        onSelect={ setSelectedFolder }
        onOpen={ path =>
          onNavigate?.(path) } />

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
              onNavigate={ onNavigate }
              onPlay={ onPlayGroup } />
          )}
        </div>
      }
    </div>

    <ColumnMenu
      target={ menu }
      columns={ columns }
      toggleColumn={ toggleColumn }
      resetColumns={ resetColumns }
      onClose={ () =>
        setMenu(null) } />
  </section>
}
