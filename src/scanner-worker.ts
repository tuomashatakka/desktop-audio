/**
 * Library scanner — runs on a Node.js Worker thread.
 *
 * Walks every configured library root, extracts audio metadata, writes
 * tracks into the shared SQLite database, and posts batched results back
 * to the main process. Kept off the main thread so scanning a large
 * library never blocks the UI.
 */
import { workerData, parentPort } from 'node:worker_threads'
import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import Database from 'better-sqlite3'


// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerData {
  dbPath: string
}

interface ScannedTrack {
  id:           string
  path:         string
  title:        string
  artist:       string
  album:        string
  duration:     number
  format:       string
  size:         number
  cover_color:  string
  album_art:    string | null
  year:         number | null
  genre:        string | null
  track_number: number | null
  mtime_ms:     number
}

type MainMessage =
  | { type: 'scan'; dirPaths: string[] } |
  { type: 'abort' }

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS_SET = new Set([
  '.mp3', '.m4a', '.flac', '.wav', '.ogg',
  '.aac', '.opus', '.webm', '.wma', '.aiff', '.aif',
])

const STREAM_BATCH_SIZE = 20

// ─── Helpers (verbatim from main.ts) ─────────────────────────────────────────

const generateCoverColor = (title: string): string => {
  const hash = Array.from(title).reduce((h, ch) =>
    Math.imul(h, 31) + ch.charCodeAt(0) | 0, 0)
  const hue = 280 + Math.abs(hash) % 80
  return `hsl(${hue}, 65%, 38%)`
}

const extractYear = (noExt: string): number | undefined => {
  const m = noExt.match(/\b(19\d{2}|20\d{2})\b/) ?? noExt.match(/[\[(](19\d{2}|20\d{2})[\])]/)
  if (!m)
    return undefined

  const y = Number.parseInt(m[1] ?? m[0], 10)
  return Number.isNaN(y) ? undefined : y
}

const extractTrackNumber = (noExt: string): number | undefined => {
  const m = noExt.match(/^(\d{1,3})[.\s-]/)
  if (!m)
    return undefined

  const n = Number.parseInt(m[1] ?? '', 10)
  return Number.isNaN(n) ? undefined : n
}

const parseTitleArtist = (noExt: string): { title: string; artist: string } => {
  const dashIdx = noExt.indexOf(' - ')
  if (dashIdx <= 0) {
    return {
      title:  noExt.replace(/^\d+\.?\s+/, '') || noExt,
      artist: 'Unknown Artist',
    }
  }
  return {
    artist: noExt.slice(0, dashIdx).trim(),
    title:  noExt.slice(dashIdx + 3).trim()
      .replace(/^\d+\.?\s+/, '') || noExt.slice(dashIdx + 3).trim(),
  }
}

const encodeAlbumArt = (picture: { format: string; data: Uint8Array } | undefined): string | undefined => {
  if (!picture)
    return undefined
  return `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
}

const processAudioFile = async (
  fullPath: string,
  fileSize: number,
  mtimeMs:  number
// eslint-disable-next-line complexity
): Promise<ScannedTrack> => {
  // Dynamic import: music-metadata is ESM-only; bundled by Vite into this CJS worker
  const mm = await import('music-metadata')

  const ext         = path.extname(fullPath).toLowerCase()
  const noExt       = path.basename(fullPath, ext)
  const parentDir   = path.basename(path.dirname(fullPath))
  const fallback    = parseTitleArtist(noExt)
  const album       = parentDir !== '.' && parentDir !== '/' ? parentDir : 'Unknown Album'
  const year        = extractYear(noExt)
  const trackNumber = extractTrackNumber(noExt)
  const format      = ext.replace('.', '').toUpperCase()

  try {
    const meta          = await mm.parseFile(fullPath, { duration: true })
    const resolvedTitle = meta.common.title || fallback.title
    const albumArt      = encodeAlbumArt(meta.common.picture?.[0])
    const resolvedYear  = meta.common.year ?? year
    const resolvedTn    = meta.common.track?.no ?? trackNumber
    const genre         = meta.common.genre?.[0]

    console.groupCollapsed(fullPath)
    console.table(meta.common)
    console.groupEnd()

    return {
      id:           fullPath,
      path:         fullPath,
      title:        resolvedTitle,
      artist:       meta.common.artist || fallback.artist,
      album:        meta.common.album || album,
      duration:     Math.round(meta.format.duration ?? 0),
      format,
      size:         fileSize,
      cover_color:  generateCoverColor(resolvedTitle),
      mtime_ms:     mtimeMs,
      album_art:    albumArt ?? null,
      year:         resolvedYear ?? null,
      genre:        genre ?? null,
      track_number: resolvedTn ?? null,
    }
  }
  catch {
    return {
      id:           fullPath,
      path:         fullPath,
      title:        fallback.title,
      artist:       fallback.artist,
      album,
      duration:     0,
      format,
      size:         fileSize,
      cover_color:  generateCoverColor(fallback.title),
      mtime_ms:     mtimeMs,
      album_art:    null,
      year:         year ?? null,
      genre:        null,
      track_number: trackNumber ?? null,
    }
  }
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const { dbPath } = workerData as WorkerData

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id           TEXT PRIMARY KEY,
    path         TEXT NOT NULL,
    title        TEXT NOT NULL,
    artist       TEXT NOT NULL,
    album        TEXT NOT NULL,
    duration     INTEGER NOT NULL,
    format       TEXT NOT NULL,
    size         INTEGER NOT NULL,
    cover_color  TEXT NOT NULL,
    album_art    TEXT,
    year         INTEGER,
    genre        TEXT,
    track_number INTEGER,
    mtime_ms     INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
`)

const stmtGetMtime = db.prepare<[string], { mtime_ms: number }>(
  'SELECT mtime_ms FROM tracks WHERE path = ?'
)

const stmtGetFull = db.prepare<[string], ScannedTrack>(
  'SELECT * FROM tracks WHERE path = ?'
)

const stmtUpsert = db.prepare(`
  INSERT INTO tracks
    (id, path, title, artist, album, duration, format, size, cover_color, album_art, year, genre, track_number, mtime_ms)
  VALUES
    (@id, @path, @title, @artist, @album, @duration, @format, @size, @cover_color, @album_art, @year, @genre, @track_number, @mtime_ms)
  ON CONFLICT(id) DO UPDATE SET
    title        = excluded.title,
    artist       = excluded.artist,
    album        = excluded.album,
    duration     = excluded.duration,
    format       = excluded.format,
    size         = excluded.size,
    cover_color  = excluded.cover_color,
    album_art    = excluded.album_art,
    year         = excluded.year,
    genre        = excluded.genre,
    track_number = excluded.track_number,
    mtime_ms     = excluded.mtime_ms
`)

// ─── Logging ──────────────────────────────────────────────────────────────────

const log = {
  info: (msg: string) =>
    console.log(`ⓘ [scanner] ${msg}`),
  debug: (msg: string) =>
    console.log(`⌗ [scanner] ${msg}`),
  warn: (msg: string) =>
    console.warn(`◬ [scanner] ${msg}`),
}

// ─── Scan logic ───────────────────────────────────────────────────────────────

async function scanDirs (dirPaths: string[]): Promise<void> {
  const t0        = Date.now()
  const seenPaths = new Set<string>()
  const pending: ScannedTrack[] = []
  // eslint-disable-next-line functional/no-let
  let totalCount = 0
  // eslint-disable-next-line functional/no-let
  let cacheHits = 0
  // eslint-disable-next-line functional/no-let
  let cacheMisses = 0
  // eslint-disable-next-line functional/no-let
  let batchCount = 0

  log.info(`⏻ scan start — ${dirPaths.length} path(s): ${dirPaths.join(', ')}`)

  const flush = () => {
    if (pending.length === 0)
      return
    batchCount++
    log.debug(`⊞ batch #${batchCount} → ${pending.length} tracks (total sent: ${totalCount})`)
    parentPort!.postMessage({ type: 'batch', tracks: pending.splice(0) })
  }

  const walk = async (dir: string): Promise<void> => {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      const audioEntries = entries.filter(e =>
        e.isFile() && AUDIO_EXTENSIONS_SET.has(path.extname(e.name).toLowerCase()))
      if (audioEntries.length > 0) {
        log.debug(`⌕ ${dir} — ${entries.length} entries, ${audioEntries.length} audio`)
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(fullPath)
          continue
        }
        if (
          entry.isFile() &&
          AUDIO_EXTENSIONS_SET.has(path.extname(entry.name).toLowerCase()) &&
          !seenPaths.has(fullPath)
        ) {
          seenPaths.add(fullPath)
          try {
            const stats    = await stat(fullPath)
            const mtimeMs  = stats.mtimeMs
            const existing = stmtGetMtime.get(fullPath)

            // eslint-disable-next-line functional/no-let
            let track: ScannedTrack
            if (existing && existing.mtime_ms === mtimeMs) {
              // mtime unchanged → skip re-parse, serve from DB
              const row = stmtGetFull.get(fullPath)
              if (!row)
                continue
              track = row
              cacheHits++
            }
            else {
              log.debug(`Δ parse ${path.basename(fullPath)} (${existing ? 'modified' : 'new'})`)
              track = await processAudioFile(fullPath, stats.size, mtimeMs)
              stmtUpsert.run(track)
              cacheMisses++
            }

            pending.push(track)
            totalCount++
            if (pending.length >= STREAM_BATCH_SIZE)
              flush()
          }
          catch (err) {
            log.warn(`⨂ skipped unreadable: ${fullPath} — ${String(err)}`)
          }
        }
      }
    }
    catch (err) {
      log.warn(`⨂ skipped inaccessible dir: ${dir} — ${String(err)}`)
    }
  }

  for (const dirPath of dirPaths) {
    log.info(`▱ walking ${dirPath}`)
    await walk(dirPath)
  }
  flush()

  // Prune stale rows: delete paths under scanned dirs that no longer exist on disk
  const seenJson = JSON.stringify([ ...seenPaths ])
  // eslint-disable-next-line functional/no-let
  let pruned = 0
  for (const dirPath of dirPaths) {
    const result = db.prepare(
      'DELETE FROM tracks WHERE (path = ? OR path LIKE ? || \'/%\') AND path NOT IN (SELECT value FROM json_each(?))'
    ).run(dirPath, dirPath, seenJson)
    pruned += result.changes
  }

  const elapsed = Date.now() - t0
  log.info(
    `✓ done — ${totalCount} tracks | ` +
    `⌁ ${cacheHits} cached · Δ ${cacheMisses} parsed · ` +
    `${pruned > 0 ? `⊖ ${pruned} pruned · ` : ''}` +
    `◴ ${elapsed}ms`
  )

  parentPort!.postMessage({ type: 'done', totalCount })
}

// ─── Message loop ─────────────────────────────────────────────────────────────

parentPort!.on('message', (msg: MainMessage) => {
  if (msg.type === 'scan') {
    scanDirs(msg.dirPaths).catch(err => {
      parentPort!.postMessage({ type: 'error', message: String(err) })
    })
  }
})
