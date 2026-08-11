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
import { migrate, upsertDtoSql, dtoToParams, dtoColumns, rootScopeClause } from './track-schema'


interface WriteMessage {
  type:      'upsert' | 'delete' | 'forget-roots' | 'forget-tracks'
  kind:      string
  payload?:  Record<string, unknown>
  trackId?:  string
  roots?:    string[]
  trackIds?: string[]

  /** Correlates the reply with the caller's request. See `main.ts`. */
  id: number
}

interface SqliteDatabase {
  exec (sql: string): unknown
  prepare (sql: string): {
    run (...params: unknown[]): { changes: number }
    all (): unknown[]
  }
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

/**
 * Discard every track under `roots` — a library folder the user removed.
 *
 * The scanner's own prune only ever reaches inside the roots it was handed to
 * scan, so a de-registered root was unreachable by it: its rows survived every
 * later scan and re-hydrated on every launch. This is deliberately phrased as
 * "delete inside these roots" rather than "delete outside the configured
 * ones" — the latter reads the *current* settings, and settings hydrate
 * asynchronously, so a race would delete the whole library. `rootScopeClause`
 * matches nothing on an empty list for the same reason.
 */
function forgetRoots (roots: string[]): void {
  const database = getDB()
  if (!database || roots.length === 0)
    return

  const scope   = rootScopeClause(roots)
  const removed = database
    .prepare(`DELETE FROM tracks WHERE ${scope.sql}`)
    .run(...scope.params).changes

  console.log(`⊖ [db-writer] forgot ${removed} track(s) under ${roots.join(', ')}`)
}

/**
 * Discard an explicit set of tracks — rows left behind by roots that were
 * removed before the app learned to clean up after itself.
 *
 * Named ids rather than a negated root scope (`… WHERE NOT under(roots)`) on
 * purpose: the caller has to say exactly what dies, so no ordering or
 * hydration bug can turn this into "delete everything". `json_each` keeps it
 * one statement and one bound parameter however long the list is — an `IN`
 * list of six thousand ids would exceed SQLite's expression depth limit.
 */
function forgetTracks (trackIds: string[]): void {
  const database = getDB()
  if (!database || trackIds.length === 0)
    return

  const removed = database
    .prepare('DELETE FROM tracks WHERE id IN (SELECT value FROM json_each(?))')
    .run(JSON.stringify(trackIds)).changes

  console.log(`⊖ [db-writer] forgot ${removed} orphaned track(s)`)
}

parentPort?.on('message', (msg: WriteMessage) => {
  try {
    if (msg.type === 'upsert' && msg.payload)
      upsert(msg.kind, msg.payload)
    else if (msg.type === 'delete' && msg.trackId)
      deleteModel(msg.kind, msg.trackId)
    else if (msg.type === 'forget-roots' && msg.roots)
      forgetRoots(msg.roots)
    else if (msg.type === 'forget-tracks' && msg.trackIds)
      forgetTracks(msg.trackIds)

    parentPort?.postMessage({ type: 'done', id: msg.id })
  }
  catch (err) {
    console.error('[db-writer] Error:', err)
    parentPort?.postMessage({ type: 'error', id: msg.id, message: String(err) })
  }
})
