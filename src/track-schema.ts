/**
 * The one description of the `tracks` table.
 *
 * Three Node-side modules used to each hand-maintain their own copy of the
 * column list (scanner worker, db writer, and the `library:load` handler in
 * `main.ts`) — and they had already drifted apart. Everything that needs the
 * schema, the snake_case ↔ camelCase mapping, or a statement over it now
 * derives it from {@link TRACK_COLUMNS}, so adding a tag field is a one-line
 * change here.
 *
 * `mtime_ms` is the odd one out: it is bookkeeping for the scanner's
 * "unchanged since last scan" check and never crosses into the renderer's
 * DTO, so it is declared separately from the tag columns.
 */

/** Column name → SQLite type, in declaration order. Excludes `mtime_ms`. */
export const TRACK_COLUMNS = {
  id:           'TEXT PRIMARY KEY',
  path:         'TEXT NOT NULL',
  title:        'TEXT NOT NULL',
  artist:       'TEXT NOT NULL',
  album:        'TEXT NOT NULL',
  duration:     'REAL NOT NULL DEFAULT 0',
  format:       'TEXT NOT NULL DEFAULT \'\'',
  size:         'INTEGER NOT NULL DEFAULT 0',
  cover_color:  'TEXT NOT NULL DEFAULT \'\'',
  album_art:    'TEXT',
  year:         'INTEGER',
  genre:        'TEXT',
  track_number: 'INTEGER',
  rating:       'INTEGER',
  album_artist: 'TEXT',
  composer:     'TEXT',
  track_total:  'INTEGER',
  disc_number:  'INTEGER',
  disc_total:   'INTEGER',
  bpm:          'REAL',
  comment:      'TEXT',
  lyrics:       'TEXT',
  publisher:    'TEXT',
  copyright:    'TEXT',
  isrc:         'TEXT',
  encoded_by:   'TEXT',
  language:     'TEXT',
  mood:         'TEXT',
  grouping:     'TEXT',
  bitrate:      'INTEGER',
  sample_rate:  'INTEGER',
  channels:     'INTEGER',
} as const

/** The bookkeeping column; scanner-only, never part of a DTO. */
export const MTIME_COLUMN = 'mtime_ms'

export const TRACK_COLUMN_NAMES = Object.keys(TRACK_COLUMNS)

/**
 * The one column never carried on a track-list row.
 *
 * Album art is stored as a base64 data URL, which on a real library runs to
 * hundreds of megabytes (372 MB across 5991 rows here, single rows up to
 * 2.4 MB). Streaming it inline put roughly twice that into the renderer's
 * string heap on every scan, so the list ships without it and
 * `library:artwork` fetches it per track instead.
 */
export const ARTWORK_COLUMN = 'album_art'

/** Columns streamed to the renderer's track list. See {@link ARTWORK_COLUMN}. */
export const LIST_COLUMN_NAMES = TRACK_COLUMN_NAMES.filter(name =>
  name !== ARTWORK_COLUMN)

/** `album_art` → `albumArt`. */
export function toCamel (column: string): string {
  return column.replace(/_([a-z])/g, (_, c: string) =>
    c.toUpperCase())
}

/** `albumArt` → `album_art`. */
export function toSnake (field: string): string {
  return field.replace(/[A-Z]/g, c =>
    `_${c.toLowerCase()}`)
}

const CAMEL_BY_COLUMN = new Map(TRACK_COLUMN_NAMES.map(c =>
  [ c, toCamel(c) ]))

const CAMEL_BY_LIST_COLUMN = new Map(LIST_COLUMN_NAMES.map(c =>
  [ c, toCamel(c) ]))

/** `CREATE TABLE` for a fresh database, including `mtime_ms`. */
export function createTableSql (): string {
  const columns = [
    ...TRACK_COLUMN_NAMES.map(name =>
      `  ${name} ${TRACK_COLUMNS[name as keyof typeof TRACK_COLUMNS]}`),
    `  ${MTIME_COLUMN} INTEGER NOT NULL DEFAULT 0`,
  ].join(',\n')

  return `CREATE TABLE IF NOT EXISTS tracks (\n${columns}\n);\n` +
    'CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);'
}

interface SqliteLike {
  exec (sql: string): unknown
  prepare (sql: string): { all (): unknown[] }
}

/**
 * Adds any column the running build knows about but the on-disk database
 * doesn't. SQLite has no `ADD COLUMN IF NOT EXISTS`, so the existing columns
 * are read back from `PRAGMA table_info` first — cheaper and less fragile
 * than swallowing the error from a duplicate add.
 */
export function migrate (db: SqliteLike): void {
  db.exec(createTableSql())

  const existing = new Set(
    (db.prepare('PRAGMA table_info(tracks)').all() as { name: string }[]).map(row =>
      row.name)
  )

  for (const name of [ ...TRACK_COLUMN_NAMES, MTIME_COLUMN ]) {
    if (existing.has(name))
      continue

    const type = name === MTIME_COLUMN
      ? 'INTEGER NOT NULL DEFAULT 0'
      : TRACK_COLUMNS[name as keyof typeof TRACK_COLUMNS]
    // A PK/NOT NULL column can't be added after the fact; only the nullable
    // tag columns ever reach this path in practice.
    db.exec(`ALTER TABLE tracks ADD COLUMN ${name} ${type.replace(' PRIMARY KEY', '').replace('NOT NULL', '')}`)
  }
}

/** `INSERT … ON CONFLICT DO UPDATE` over every column plus `mtime_ms`. */
export function upsertSql (): string {
  const names       = [ ...TRACK_COLUMN_NAMES, MTIME_COLUMN ]
  const assignments = names
    .filter(name =>
      name !== 'id')
    .map(name =>
      `    ${name} = excluded.${name}`)
    .join(',\n')

  return `INSERT INTO tracks (${names.join(', ')})
  VALUES (${names.map(n =>
    `@${n}`).join(', ')})
  ON CONFLICT(id) DO UPDATE SET\n${assignments}`
}

/**
 * Which columns a renderer DTO actually speaks to.
 *
 * **A key that is absent means "leave this column alone"; an explicit `null`
 * means "clear it".** That distinction is what keeps album art alive: list
 * rows no longer carry `albumArt` at all (see {@link ARTWORK_COLUMN}), so a
 * write that assumed every column was present would blank the artwork of every
 * track anyone ever edited. Clearing a field is still expressible — the tag
 * editor sends `null` for it.
 */
export function dtoColumns (dto: Record<string, unknown>): string[] {
  return TRACK_COLUMN_NAMES.filter(column =>
    Object.hasOwn(dto, CAMEL_BY_COLUMN.get(column)!))
}

/**
 * `INSERT … ON CONFLICT DO UPDATE` for renderer-originated writes (the tag
 * editor), over only the columns the DTO carries. Deliberately leaves
 * `mtime_ms` alone: it still reflects the file on disk, so the next scan sees
 * "unchanged", serves the row from the DB, and the user's edit survives
 * instead of being re-parsed away.
 */
export function upsertDtoSql (columns: readonly string[] = TRACK_COLUMN_NAMES): string {
  const assignments = columns
    .filter(name =>
      name !== 'id')
    .map(name =>
      `    ${name} = excluded.${name}`)
    .join(',\n')

  return `INSERT INTO tracks (${columns.join(', ')})
  VALUES (${columns.map(n =>
    `@${n}`).join(', ')})
  ON CONFLICT(id) DO UPDATE SET\n${assignments}`
}

/** Shared snake→camel projection; see {@link rowToDto} / {@link rowToListDto}. */
function mapRow (
  row: Record<string, unknown>,
  columns: Map<string, string>
): Record<string, unknown> {
  const dto: Record<string, unknown> = {}
  for (const [ column, field ] of columns) {
    const value = row[column]
    if (value !== null && value !== undefined)
      dto[field] = value
  }
  return dto
}

/** DB row → renderer DTO: camelCase keys, `null` collapsed to `undefined`. */
export function rowToDto (row: Record<string, unknown>): Record<string, unknown> {
  return mapRow(row, CAMEL_BY_COLUMN)
}

/** As {@link rowToDto}, minus {@link ARTWORK_COLUMN}. Used for every list row. */
export function rowToListDto (row: Record<string, unknown>): Record<string, unknown> {
  return mapRow(row, CAMEL_BY_LIST_COLUMN)
}

/** Renderer DTO → bound statement parameters; missing fields bind as `null`. */
export function dtoToParams (
  dto: Record<string, unknown>,
  columns: readonly string[] = TRACK_COLUMN_NAMES
): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const column of columns)
    params[column] = dto[CAMEL_BY_COLUMN.get(column)!] ?? null
  return params
}
