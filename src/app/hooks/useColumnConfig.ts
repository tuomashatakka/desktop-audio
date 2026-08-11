import { useCallback, useState } from 'react'


export type ColumnKey =
  | 'art' |
  'index' |
  'title' |
  'artist' |
  'album' |
  'year' |
  'genre' |
  'duration' |
  'format' |
  'size' |
  'trackNumber' |
  'rating' |
  'path'

export interface ColumnConfig {
  readonly key:     ColumnKey
  readonly label:   string
  readonly width:   string // CSS grid track value (e.g. "1fr", "0.55fr", "180px")
  readonly visible: boolean
  readonly fixed?:  boolean // cannot be hidden (title)
}

const DEFAULT_COLUMNS: readonly ColumnConfig[] = [
  { key: 'art', label: '', width: '36px', visible: true, fixed: true },
  { key: 'index', label: '#', width: '40px', visible: true, fixed: true },
  { key: 'title', label: 'Title', width: '1fr', visible: true, fixed: true },
  { key: 'artist', label: 'Artist', width: '0.55fr', visible: true },
  { key: 'album', label: 'Album', width: '0.55fr', visible: true },
  { key: 'year', label: 'Year', width: '64px', visible: false },
  { key: 'genre', label: 'Genre', width: '120px', visible: false },
  { key: 'duration', label: 'Duration', width: '6ch', visible: true },
  { key: 'format', label: 'Format', width: '6ch', visible: true },
  { key: 'size', label: 'Size', width: '8ch', visible: false },
  { key: 'trackNumber', label: 'Track #', width: '5ch', visible: false },
  { key: 'rating', label: 'Rating', width: '6ch', visible: false },
  { key: 'path', label: 'Path', width: '2fr', visible: false },
]

const STORAGE_KEY = 'desktop-audio-column-config'

function loadConfig (): readonly ColumnConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return DEFAULT_COLUMNS

    const parsed = JSON.parse(raw) as ColumnConfig[]
    // Reconcile with defaults: keep saved order/width/visible, but ensure all default keys are present
    const byKey = new Map(parsed.map(c =>
      [ c.key, c ]))
    const merged: ColumnConfig[] = []
    for (const k of parsed)
      if (DEFAULT_COLUMNS.find(d =>
        d.key === k.key))
        merged.push({ ...k,
          label: DEFAULT_COLUMNS.find(d =>
            d.key === k.key)!.label,
          fixed: DEFAULT_COLUMNS.find(d =>
            d.key === k.key)!.fixed })

    for (const d of DEFAULT_COLUMNS)
      if (!byKey.has(d.key))
        merged.push(d)

    return merged
  }
  catch {
    return DEFAULT_COLUMNS
  }
}

function saveConfig (cols: readonly ColumnConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cols))
  }
  catch {
    // ignore quota errors
  }
}

export interface ColumnConfigApi {
  readonly columns:       readonly ColumnConfig[]
  readonly visible:       readonly ColumnConfig[]
  readonly gridTemplate:  string
  readonly toggleColumn:  (key: ColumnKey) => void
  readonly resizeColumn:  (key: ColumnKey, width: string) => void
  readonly reorderColumn: (fromKey: ColumnKey, toKey: ColumnKey) => void
  readonly resetColumns:  () => void
}

export function useColumnConfig (): ColumnConfigApi {
  const [ columns, setColumns ] = useState<readonly ColumnConfig[]>(loadConfig)

  /**
   * Every mutation goes through here, so persisting is part of making the
   * change rather than an effect watching for one.
   *
   * It takes the next columns outright instead of an updater because the write
   * has to happen outside the state updater — React may run an updater more
   * than once, and a discarded render would otherwise still have persisted a
   * layout that never applied. The mutations below therefore close over
   * `columns`, which is safe: they run from discrete DOM events, and React
   * re-renders between two of those.
   */
  const commit = useCallback((next: readonly ColumnConfig[]) => {
    saveConfig(next)
    setColumns(next)
  }, [])

  const visible = columns.filter(c =>
    c.visible)
  const gridTemplate = visible.map(c =>
    c.width).join(' ')

  const toggleColumn = useCallback((key: ColumnKey) => {
    commit(columns.map(c =>
      c.key === key && !c.fixed
        ? { ...c, visible: !c.visible }
        : c))
  }, [ columns, commit ])

  const resizeColumn = useCallback((key: ColumnKey, width: string) => {
    commit(columns.map(c =>
      c.key === key ? { ...c, width } : c))
  }, [ columns, commit ])

  const reorderColumn = useCallback((fromKey: ColumnKey, toKey: ColumnKey) => {
    const fromIdx = columns.findIndex(c =>
      c.key === fromKey)
    const toIdx = columns.findIndex(c =>
      c.key === toKey)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx)
      return

    const next      = [ ...columns ]
    const [ moved ] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    commit(next)
  }, [ columns, commit ])

  const resetColumns = useCallback(() => {
    commit(DEFAULT_COLUMNS)
  }, [ commit ])

  return { columns, visible, gridTemplate, toggleColumn, resizeColumn, reorderColumn, resetColumns }
}

export { DEFAULT_COLUMNS }
