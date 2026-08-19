/**
 * The track table's columns: what a cell shows, and the header that sorts,
 * resizes, reorders and hides it.
 *
 * Split out of `TrackTable` because none of it depends on the table's state —
 * a cell renderer takes a track, a header takes one column — and keeping it
 * here leaves that file about the list rather than about its columns.
 */
import { useRef } from 'react'
import type { ColumnKey, ColumnConfig } from '../../hooks/useColumnConfig'
import type { SortKey } from '../../hooks/useSortableTable'
import type { Density, Track } from '../../contexts'
import { isGridDensity } from '../../contexts'
import { AlbumArt } from '../atomic/AlbumArt'
import { Popover } from '../atomic/Popover'
import type { PopoverPoint } from '../atomic/Popover'
import { Button } from '../atomic/Button'
import { Icon } from '../atomic/Icon'
import { formatTime, isoDuration } from '../../utils/time'
import { afterPointerRelease, listenAll } from '../../utils/events'


/** List densities only — a grid density renders `LibraryGrid`, not this. */
export type RowDensity = Exclude<Density, 'grid-sm' | 'grid-lg'>

/**
 * A drilled-into scope renders as a list even while a grid density is
 * selected, so the table has to have an answer for one. Normal rows are it —
 * and the selected density is left untouched so backing out of the scope
 * restores the grid.
 */
export function rowDensityOf (density: Density): RowDensity {
  return isGridDensity(density) ? 'normal' : density
}

/** A column narrower than this can no longer show its own label. */
const MIN_COLUMN_WIDTH = 48

/** Bytes per unit, for the size column. */
const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB

/** Below one full megabyte the size column falls back to kilobytes. */
const MIN_MB_FOR_MB_UNIT = 1

/** Which column the menu was opened on, and where the pointer was. */
export interface ColumnMenuTarget {
  readonly key:   ColumnKey
  readonly point: PopoverPoint
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

/** Art and index columns carry no orderable value. */
function isSortableKey (key: ColumnKey): key is SortKey {
  return key !== 'art' && key !== 'index'
}

type CellRenderer = (track: Track, index: number, density: RowDensity) => React.ReactNode

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

export function cellValue (track: Track, key: ColumnKey, index: number, density: RowDensity): React.ReactNode {
  return CELL_RENDERERS[key](track, index, density)
}

interface HeaderCellProps {
  readonly col:            ColumnConfig
  readonly sortKey:        SortKey | null
  readonly sortDir:        'asc' | 'desc'
  readonly toggleSort:     (key: SortKey) => void
  readonly onResize:       (key: ColumnKey, width: string) => void
  readonly onReorder:      (from: ColumnKey, to: ColumnKey) => void
  readonly tableSemantics: boolean
  readonly onContextMenu?: (key: ColumnKey, point: PopoverPoint) => void
}

/** One column header: click to sort, drag to reorder, drag the edge to resize. */
export function HeaderCell ({ col, sortKey, sortDir, toggleSort, onResize, onReorder, tableSemantics, onContextMenu }: HeaderCellProps) {
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
    if (!onContextMenu)
      return

    const point = { x: e.clientX, y: e.clientY }
    afterPointerRelease(e.buttons, () =>
      onContextMenu(col.key, point))
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
      // Shift+F10 and the Menu key are the keyboard's context menu; without
      // them the extra columns are reachable by pointer only.
      if (onContextMenu && (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey)) {
        const box = ref.current?.getBoundingClientRect()

        e.preventDefault()
        onContextMenu(col.key, { x: box?.left ?? 0, y: box?.bottom ?? 0 })
        return
      }

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

/**
 * Pointer-positioned popover listing every column, plus a reset button.
 *
 * `target` is the column the menu was opened *on*, which earns it a one-click
 * hide above the list: the checkbox for it is in there somewhere, but "hide
 * the one I right-clicked" is the reason the menu was opened at all.
 */
type ColumnMenuProps = {
  readonly target:       ColumnMenuTarget | null
  readonly columns:      readonly ColumnConfig[]
  readonly toggleColumn: (key: ColumnKey) => void
  readonly resetColumns: () => void
  readonly onClose:      () => void
}

export function ColumnMenu ({
  target,
  columns,
  toggleColumn,
  resetColumns,
  onClose,
}: ColumnMenuProps) {
  const targetColumn = columns.find(c =>
    c.key === target?.key)

  return <Popover open={ target !== null } point={ target?.point ?? null } onClose={ onClose }>
    <fieldset className='config-menu'>
      <legend>Columns</legend>

      {targetColumn && !targetColumn.fixed &&
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={ () => {
            toggleColumn(targetColumn.key)
            onClose()
          } }>
          {`Hide ${targetColumn.label || targetColumn.key}`}
        </Button>
      }

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
