/**
 * DB reader — streams the persisted library out of SQLite on its own thread.
 *
 * Hydration used to be a synchronous `SELECT *` inside an `ipcMain.handle` on
 * the Electron main process: the whole table was read, mapped and returned as
 * one array before the renderer could paint a single row, and the main thread
 * was blocked for the duration. Here the same query is walked with a cursor
 * and posted back in fixed-size batches, so rows reach the renderer while the
 * read is still going and nothing blocks.
 *
 * The message shape deliberately mirrors `scanner-worker.ts` (`batch` → … →
 * `done`), because `useLibraryScanner` already knows how to merge a stream of
 * batches into its cache.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { rowToDto } from './track-schema'


// Rows per `batch` message. Small enough to paint early, large enough that
//  the postMessage overhead stays negligible on a big library.
const READ_BATCH_SIZE = 200

/** Tracks come out title-ordered so the first batch is already presentable. */
const SELECT_ALL_TRACKS = 'SELECT * FROM tracks ORDER BY title ASC'

interface WorkerData {
  dbPath: string
}

interface ReadMessage {
  type: 'load'
}

type SqliteRow = Record<string, unknown>

interface SqliteStatement {
  iterate (): IterableIterator<SqliteRow>
}

interface SqliteDatabase {
  prepare (sql: string): SqliteStatement
  close (): void
}

/**
 * Opened per load rather than kept alive: the writer worker holds the only
 * long-lived handle, and a read-only connection that lingers would keep
 * pinning a stale WAL snapshot after a scan rewrites the table.
 */
function openDB (): SqliteDatabase | null {
  const { dbPath } = workerData as WorkerData

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    return new Database(dbPath, { readonly: true, fileMustExist: true }) as SqliteDatabase
  }
  catch {
    // No database yet — a first run, not a failure. The caller gets an empty
    // `done` and the auto-scan fills the library.
    return null
  }
}

/**
 * Chunks a row cursor into DTO batches.
 *
 * A generator rather than a callback: the SQLite cursor is lazy, and yielding
 * keeps it that way — one batch is materialised at a time, whatever the size
 * of the table, and the caller drives the pace. It also makes the chunking
 * testable without a database or a worker.
 */
export function* batchRows (
  rows: Iterable<SqliteRow>,
  batchSize: number = READ_BATCH_SIZE
): Generator<Record<string, unknown>[]> {
  let batch: SqliteRow[] = []

  for (const row of rows) {
    batch.push(row)

    if (batch.length >= batchSize) {
      yield batch.map(rowToDto)
      batch = []
    }
  }

  // The tail: whatever did not fill a whole batch.
  if (batch.length > 0)
    yield batch.map(rowToDto)
}

function streamTracks (): void {
  const db = openDB()

  if (!db) {
    parentPort?.postMessage({ type: 'done', totalCount: 0 })
    return
  }

  try {
    let totalCount = 0

    for (const tracks of batchRows(db.prepare(SELECT_ALL_TRACKS).iterate())) {
      totalCount += tracks.length
      parentPort?.postMessage({ type: 'batch', tracks })
    }

    parentPort?.postMessage({ type: 'done', totalCount })
  }
  catch (err) {
    parentPort?.postMessage({ type: 'error', message: String(err) })
  }
  finally {
    db.close()
  }
}

parentPort?.on('message', (msg: ReadMessage) => {
  if (msg.type === 'load')
    streamTracks()
})
