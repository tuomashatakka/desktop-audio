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
 * `INSERT … ON CONFLICT DO UPDATE` for renderer-originated writes (the tag
 * editor). Deliberately leaves `mtime_ms` alone: it still reflects the file
 * on disk, so the next scan sees "unchanged", serves the row from the DB, and
 * the user's edit survives instead of being re-parsed away.
 */
export function upsertDtoSql (): string {
  const assignments = TRACK_COLUMN_NAMES
    .filter(name =>
      name !== 'id')
    .map(name =>
      `    ${name} = excluded.${name}`)
    .join(',\n')

  return `INSERT INTO tracks (${TRACK_COLUMN_NAMES.join(', ')})
  VALUES (${TRACK_COLUMN_NAMES.map(n =>
    `@${n}`).join(', ')})
  ON CONFLICT(id) DO UPDATE SET\n${assignments}`
}

/** DB row → renderer DTO: camelCase keys, `null` collapsed to `undefined`. */
export function rowToDto (row: Record<string, unknown>): Record<string, unknown> {
  const dto: Record<string, unknown> = {}
  for (const [ column, field ] of CAMEL_BY_COLUMN) {
    const value = row[column]
    if (value !== null && value !== undefined)
      dto[field] = value
  }
  return dto
}

/** Renderer DTO → bound statement parameters; missing fields bind as `null`. */
export function dtoToParams (dto: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const [ column, field ] of CAMEL_BY_COLUMN)
    params[column] = dto[field] ?? null
  return params
}
