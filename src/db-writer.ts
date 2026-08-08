/**
 * DB writer — the only path renderer-originated model edits take to disk.
 *
 * Runs on its own worker thread so a tag save never blocks the main process,
 * and shares the schema (and therefore the database) with the scanner via
 * `track-schema.ts`.
 */
import { parentPort, workerData } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'
import { migrate, upsertDtoSql, dtoToParams, dtoColumns } from './track-schema'


interface WriteMessage {
  type:     'upsert' | 'delete'
  kind:     string
  payload?: Record<string, unknown>
  trackId?: string

  /** Correlates the reply with the caller's request. See `main.ts`. */
  id: number
}

interface SqliteDatabase {
  exec (sql: string): unknown
  prepare (sql: string): { run (params?: unknown): unknown; all (): unknown[] }
}

let db: SqliteDatabase | null = null

/**
 * The path is handed over as `workerData` by the spawning process. It used to
 * be re-derived from `$HOME` here, which pointed at a *different* file than
 * the one `main.ts` and the scanner open — so every edit was written to a
 * database nothing ever read back.
 */
function getDB (): SqliteDatabase | null {
  if (db)
    return db

  const dbPath = (workerData as { dbPath?: string } | undefined)?.dbPath ??
    process.env.DB_PATH ??
    path.join(process.env.HOME || '', 'Library/Application Support/library.db')

  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    db = new Database(dbPath) as SqliteDatabase
    migrate(db)
  }
  catch (e) {
    console.error('[db-writer] Failed to open DB:', e)
    return null
  }

  return db
}

function upsert (kind: string, payload: Record<string, unknown>): void {
  const database = getDB()
  if (!database || kind !== 'track')
    return

  // Only the columns the DTO actually carries. List rows no longer include
  // `albumArt`, so writing every column unconditionally would blank the
  // artwork of every track the user ever edits. An explicit `null` still
  // clears a field; an absent key leaves it alone.
  const columns = dtoColumns(payload)
  if (columns.length === 0)
    return

  // `dtoToParams` also drops anything that isn't a column — a model payload
  // carries a few extra getters, and better-sqlite3 rejects stray named
  // parameters outright.
  database.prepare(upsertDtoSql(columns)).run(dtoToParams(payload, columns))
}

function deleteModel (kind: string, id: string): void {
  const database = getDB()
  if (!database || kind !== 'track')
    return

  database.prepare('DELETE FROM tracks WHERE id = ?').run(id)
}

parentPort?.on('message', (msg: WriteMessage) => {
  try {
    if (msg.type === 'upsert' && msg.payload)
      upsert(msg.kind, msg.payload)
    else if (msg.type === 'delete' && msg.trackId)
      deleteModel(msg.kind, msg.trackId)

    parentPort?.postMessage({ type: 'done', id: msg.id })
  }
  catch (err) {
    console.error('[db-writer] Error:', err)
    parentPort?.postMessage({ type: 'error', id: msg.id, message: String(err) })
  }
})
