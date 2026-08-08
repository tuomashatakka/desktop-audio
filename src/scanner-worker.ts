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
import { migrate, upsertSql, TRACK_COLUMN_NAMES, MTIME_COLUMN } from './track-schema'


// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkerData {
  dbPath: string
}

/**
 * A row as it goes into SQLite: snake_case column names, `null` rather than
 * `undefined` for absent tags. The column list lives in `track-schema.ts`;
 * this index signature is the loose in-worker view of it.
 */
type ScannedTrack = Record<string, string | number | null>

/** Absent tags bind as SQL NULL, so every column is always present. */
function row (values: Record<string, string | number | null | undefined>): ScannedTrack {
  const out: ScannedTrack = {}
  for (const name of [ ...TRACK_COLUMN_NAMES, MTIME_COLUMN ])
    out[name] = values[name] ?? null
  return out
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

type ParseTitleArtistReturnType = { title: string; artist: string }

const parseTitleArtist = (noExt: string): ParseTitleArtistReturnType => {
  const dashIdx = noExt.indexOf(' - ')
  if (dashIdx <= 0)
    return {
      title:  noExt.replace(/^\d+\.?\s+/, '') || noExt,
      artist: 'Unknown Artist',
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

/** Tags may carry several comment frames; keep them all, one per line. */
const commentText = (comments: readonly { text?: string }[] | undefined): string | undefined => {
  const text = comments
    ?.map(c =>
      c.text?.trim())
    .filter(Boolean)
    .join('\n')
  return text || undefined
}

/**
 * Prefer plain lyrics; fall back to flattening a synchronized (LRC-style)
 * frame, since a timestamped-only tag is still the song's words.
 */
const lyricsText = (
  lyrics: readonly { text?: string; syncText?: readonly { text?: string }[] }[] | undefined
): string | undefined => {
  for (const entry of lyrics ?? []) {
    const plain = entry.text?.trim()
    if (plain)
      return plain

    const synced = entry.syncText
      ?.map(line =>
        line.text?.trim())
      .filter(Boolean)
      .join('\n')
    if (synced)
      return synced
  }
  return undefined
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
    const common        = meta.common
    const resolvedTitle = common.title || fallback.title

    return row({
      id:           fullPath,
      path:         fullPath,
      title:        resolvedTitle,
      artist:       common.artist || fallback.artist,
      album:        common.album || album,
      duration:     Math.round(meta.format.duration ?? 0),
      format,
      size:         fileSize,
      cover_color:  generateCoverColor(resolvedTitle),
      mtime_ms:     mtimeMs,
      album_art:    encodeAlbumArt(common.picture?.[0]),
      year:         common.year ?? year,
      genre:        common.genre?.[0],
      track_number: common.track?.no ?? trackNumber,
      rating:       mm.ratingToStars(common.rating?.[0]?.rating),

      album_artist: common.albumartist,
      composer:     common.composer?.[0],
      track_total:  common.track?.of ?? undefined,
      disc_number:  common.disk?.no ?? undefined,
      disc_total:   common.disk?.of ?? undefined,
      bpm:          common.bpm,
      comment:      commentText(common.comment),
      lyrics:       lyricsText(common.lyrics),
      publisher:    common.label?.[0],
      copyright:    common.copyright,
      isrc:         common.isrc?.[0],
      encoded_by:   common.encodedby,
      language:     common.language,
      mood:         common.mood,
      grouping:     common.grouping,

      bitrate:     meta.format.bitrate ? Math.round(meta.format.bitrate) : undefined,
      sample_rate: meta.format.sampleRate,
      channels:    meta.format.numberOfChannels,
    })
  }
  catch {
    return row({
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
      year,
      track_number: trackNumber,
    })
  }
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const { dbPath } = workerData as WorkerData

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

// Creates the table on a fresh install and back-fills columns added by a
// newer build on an existing one.
migrate(db)

const stmtGetMtime = db.prepare<[string], { mtime_ms: number }>(
  'SELECT mtime_ms FROM tracks WHERE path = ?'
)

const stmtGetFull = db.prepare<[string], ScannedTrack>(
  'SELECT * FROM tracks WHERE path = ?'
)

const stmtUpsert = db.prepare(upsertSql())

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
  const t0                      = Date.now()
  const seenPaths               = new Set<string>()
  const pending: ScannedTrack[] = []
  let totalCount  = 0
  let cacheHits   = 0
  let cacheMisses = 0
  let batchCount  = 0

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
      const entries      = await readdir(dir, { withFileTypes: true })
      const audioEntries = entries.filter(e =>
        e.isFile() && AUDIO_EXTENSIONS_SET.has(path.extname(e.name).toLowerCase()))
      if (audioEntries.length > 0)
        log.debug(`⌕ ${dir} — ${entries.length} entries, ${audioEntries.length} audio`)

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
  if (msg.type === 'scan')
    scanDirs(msg.dirPaths).catch(err => {
      parentPort!.postMessage({ type: 'error', message: String(err) })
    })
})
