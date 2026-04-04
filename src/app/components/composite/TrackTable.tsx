import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useSortableTable } from '../../hooks/useSortableTable'
import { Skeleton } from '../atomic/Skeleton'
import type { Track } from '../../contexts'
import type { SortKey } from '../../hooks/useSortableTable'


const ROW_HEIGHT = 36
const SKELETON_ROW_COUNT = 20

interface Column {
  readonly key:       SortKey | '#' | 'album-art'
  readonly label:     string
  readonly className: string
  readonly sortable:  boolean
}

const COLUMNS: readonly Column[] = [
  { key: 'album-art', label: '', className: 'col-art', sortable: false },
  { key: '#', label: '', className: 'col-index', sortable: false },
  { key: 'title', label: 'Title', className: 'col-title', sortable: true },
  { key: 'artist', label: 'Artist', className: 'col-artist', sortable: true },
  { key: 'album', label: 'Album', className: 'col-album', sortable: true },
  { key: 'format', label: 'Format', className: 'col-format', sortable: true },
  { key: 'duration', label: 'Duration', className: 'col-duration', sortable: true },
]

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
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TrackTable ({ tracks, isLoading, currentTrack, isPlaying, onPlay, onContextMenu, onScroll }: TrackTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onScroll)
      return
    el.addEventListener('scroll', onScroll)
    return () =>
      el.removeEventListener('scroll', onScroll)
  }, [ onScroll ])

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(tracks)

  const rowCount = isLoading ? SKELETON_ROW_COUNT : sorted.length

  const virtualizer = useVirtualizer({
    count:            rowCount,
    getScrollElement: () =>
      scrollRef.current,
    estimateSize: () =>
      ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <div className='track-table-wrap'>

      {/* Sticky header row — same grid as virtualised rows */}
      <div className='track-header' role='row'>
        {COLUMNS.map(col => {
          const isSorted = col.sortable && col.key === sortKey
          return (
            <div
              key={col.key}
              role='columnheader'
              className={[ col.className, isSorted ? `sorted ${sortDir}` : '' ].join(' ').trim()}
              onClick={() =>
                col.sortable && toggleSort(col.key as SortKey)}
              aria-sort={isSorted ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}
              tabIndex={col.sortable ? 0 : undefined}
              onKeyDown={e =>
                col.sortable && e.key === 'Enter' && toggleSort(col.key as SortKey)}
            >
              {col.label}

              {isSorted &&
                <span className='sort-indicator' aria-hidden='true'>
                  {sortDir === 'asc' ? ' ▲' : ' ▼'}
                </span>
              }
            </div>
          )
        })}
      </div>

      {/* Virtualised scroll body */}
      <div ref={scrollRef} className='track-table-scroll'>
        <div
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
                  width:     '100%',
                  transform: `translateY(${vrow.start}px)`,
                  height:    ROW_HEIGHT,
                }}
                aria-hidden='true'
              >
                <Skeleton width='24px' height='24px' />
                <Skeleton width='2ch' />
                <Skeleton width='36%' />
                <Skeleton width='20%' />
                <Skeleton width='18%' />
                <Skeleton width='7%' />
                <Skeleton width='5ch' />
              </div>
            )
            : virtualizer.getVirtualItems().map(vrow => {
              const track = sorted[vrow.index]
              if (!track) {
                return null
              }

              const active = currentTrack?.id === track.id
              return (
                <div
                  key={track.id}
                  role='row'
                  className={[ 'track-row', active ? 'active' : '' ].join(' ').trim()}
                  style={{
                    position:  'absolute',
                    top:       0,
                    width:     '100%',
                    transform: `translateY(${vrow.start}px)`,
                    height:    ROW_HEIGHT,
                  }}
                  onClick={() =>
                    onPlay(track, vrow.index)}
                  onContextMenu={e => {
                    e.preventDefault()
                    onContextMenu?.(track, e.currentTarget.getBoundingClientRect())
                  }}
                  tabIndex={0}
                  onKeyDown={e =>
                    e.key === 'Enter' && onPlay(track, vrow.index)}
                  aria-selected={active}
                >
                  <span className='col-art' aria-hidden='true'>
                    {track.albumArt
                      ? <img src={track.albumArt} alt='' />
                      : <span className='art-swatch' style={{ background: track.coverColor }} />
                    }
                  </span>

                  <span className='col-index'>
                    {active && isPlaying ? '▶' : vrow.index + 1}
                  </span>

                  <span className='col-title'>
                    {track.title}
                  </span>

                  <span className='col-artist'>
                    {track.artist}
                  </span>

                  <span className='col-album'>
                    {track.album}
                  </span>

                  <span className='col-format'>
                    {track.format?.toUpperCase()}
                  </span>

                  <span className='col-duration'>
                    {formatDuration(track.duration)}
                  </span>
                </div>
              )
            })
          }
        </div>
      </div>

    </div>
  )
}
