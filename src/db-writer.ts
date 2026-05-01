import { parentPort } from 'node:worker_threads'
import path from 'node:path'
import fs from 'node:fs'

interface WriteMessage {
  type: 'upsert' | 'delete'
  kind: string
  payload?: Record<string, unknown>
  id?: string
}

// Lazy-load sqlite
let db: any = null

function getDB(): any {
  if (db)
    return db

  const dbPath = process.env.DB_PATH || path.join(process.env.HOME || '', 'Library/Application Support/desktop-audio/library.db')
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    db = new Database(dbPath)
    initSchema(db)
  } catch (e) {
    console.error('[db-writer] Failed to open DB:', e)
    return null
  }

  return db
}

function initSchema(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      duration REAL NOT NULL,
      format TEXT NOT NULL,
      size INTEGER NOT NULL,
      cover_color TEXT NOT NULL,
      album_art TEXT,
      year INTEGER,
      genre TEXT,
      track_number INTEGER
    )
  `)
}

function upsert(kind: string, payload: Record<string, unknown>): void {
  const db = getDB()
  if (!db)
    return

  if (kind === 'track') {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO tracks
      (id, path, title, artist, album, duration, format, size, cover_color, album_art, year, genre, track_number)
      VALUES (@id, @path, @title, @artist, @album, @duration, @format, @size, @coverColor, @albumArt, @year, @genre, @trackNumber)
    `)
    stmt.run(payload)
  }
}

function deleteModel(kind: string, id: string): void {
  const db = getDB()
  if (!db)
    return

  if (kind === 'track') {
    db.prepare('DELETE FROM tracks WHERE id = ?').run(id)
  }
}

parentPort?.on('message', (msg: WriteMessage) => {
  try {
    if (msg.type === 'upsert' && msg.payload) {
      upsert(msg.kind, msg.payload)
    } else if (msg.type === 'delete' && msg.id) {
      deleteModel(msg.kind, msg.id)
    }
  } catch (err) {
    console.error('[db-writer] Error:', err)
  }
})
