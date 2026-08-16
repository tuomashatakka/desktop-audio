/**
 * Musical-analysis worker.
 *
 * Requests are queued so skipping through a queue cannot launch several
 * Essentia processes at once. The Python resolver runs asynchronously, then
 * this worker stores its compact harmony result in SQLite before replying.
 */
import { execFile as execFileCallback } from 'node:child_process'
import fs from 'node:fs'
import { stat } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { promisify } from 'node:util'
import { ANALYSIS_VERSION, createAnalysisTableSql } from './analysis-schema'
import type { TrackAnalysis } from './app/services/types'


const execFile = promisify(execFileCallback)

interface AnalysisWorkerData {
  readonly analyzerRoot: string
  readonly dbPath:       string
  readonly pythonPath:   string
  readonly resolverPath: string
}

interface AnalyzeMessage {
  readonly type:    'analyze'
  readonly id:      number
  readonly trackId: string
  readonly path:    string
}

interface CachedAnalysisRow {
  readonly source_mtime_ms:  number
  readonly analyzer_version: number
  readonly result_json:      string
}

interface SqliteDatabase {
  exec (sql: string): unknown
  prepare (sql: string): {
    get (...params: unknown[]): CachedAnalysisRow | undefined
    run (...params: unknown[]): unknown
  }
  close (): void
}

const requests: AnalyzeMessage[] = []
let processing = false

function openDatabase (): SqliteDatabase {
  const { dbPath } = workerData as AnalysisWorkerData
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native CommonJS addon externalized from the worker bundle.
  const Database = require('better-sqlite3')
  const database = new Database(dbPath) as SqliteDatabase
  database.exec(createAnalysisTableSql())
  return database
}

function cachedAnalysis (
  database: SqliteDatabase,
  trackId: string,
  sourceMtimeMs: number
): TrackAnalysis | null {
  const row = database.prepare(
    'SELECT source_mtime_ms, analyzer_version, result_json FROM track_analysis WHERE track_id = ?'
  ).get(trackId)

  if (
    !row ||
    row.source_mtime_ms !== sourceMtimeMs ||
    row.analyzer_version !== ANALYSIS_VERSION
  )
    return null

  return JSON.parse(row.result_json) as TrackAnalysis
}

function persistAnalysis (
  database: SqliteDatabase,
  trackId: string,
  sourceMtimeMs: number,
  analysis: TrackAnalysis
): void {
  database.prepare(`INSERT INTO track_analysis (
    track_id, source_mtime_ms, analyzer_version, result_json, updated_at
  ) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(track_id) DO UPDATE SET
    source_mtime_ms = excluded.source_mtime_ms,
    analyzer_version = excluded.analyzer_version,
    result_json = excluded.result_json,
    updated_at = excluded.updated_at`).run(
    trackId,
    sourceMtimeMs,
    ANALYSIS_VERSION,
    JSON.stringify(analysis),
    Date.now()
  )
}

function compactResult (value: unknown): TrackAnalysis {
  const result = value as Record<string, unknown>
  if (typeof result.error === 'string')
    throw new Error(result.error)

  if (
    typeof result.duration !== 'number' ||
    typeof result.tempo !== 'object' ||
    typeof result.key !== 'object' ||
    !Array.isArray(result.beats) ||
    !Array.isArray(result.chords)
  )
    throw new Error('the analyzer returned an invalid harmony result')

  return {
    version:  ANALYSIS_VERSION,
    duration: result.duration,
    tempo:    result.tempo as TrackAnalysis['tempo'],
    key:      result.key as TrackAnalysis['key'],
    beats:    result.beats as TrackAnalysis['beats'],
    chords:   result.chords as TrackAnalysis['chords'],
    engine:   result.engine as TrackAnalysis['engine'],
    warnings: Array.isArray(result.warnings)
      ? result.warnings.filter((item): item is string =>
        typeof item === 'string')
      : [],
  }
}

async function analyzeWithPython (trackPath: string): Promise<TrackAnalysis> {
  const { analyzerRoot, pythonPath, resolverPath } = workerData as AnalysisWorkerData

  const analyzerEntry = `${analyzerRoot}/backend/analyze.py`

  if (!fs.existsSync(analyzerEntry))
    throw new Error(`audio analyzer not found at ${analyzerEntry}`)
  if (!fs.existsSync(resolverPath))
    throw new Error(`harmony resolver not found at ${resolverPath}`)
  if (pythonPath.includes('/') && !fs.existsSync(pythonPath))
    throw new Error(`audio analyzer python not found at ${pythonPath}`)

  const { stdout } = await execFile(
    pythonPath,
    [ resolverPath, analyzerRoot, trackPath ],
    {
      cwd:       analyzerRoot,
      encoding:  'utf8',
      env:       { ...process.env, PYGAME_HIDE_SUPPORT_PROMPT: '1' },
      maxBuffer: 64 * 1024 * 1024,
      timeout:   15 * 60 * 1000,
    }
  )

  const json = stdout.trim().split(/\r?\n/u)
    .at(-1)
  if (!json)
    throw new Error('audio analyzer produced no result')

  return compactResult(JSON.parse(json))
}

async function fulfill (request: AnalyzeMessage): Promise<void> {
  let database: SqliteDatabase | null = null

  try {
    const sourceMtimeMs = Math.round((await stat(request.path)).mtimeMs)
    database            = openDatabase()

    const cached = cachedAnalysis(database, request.trackId, sourceMtimeMs)
    if (cached) {
      parentPort?.postMessage({ type: 'analysis', id: request.id, analysis: cached, cached: true })
      return
    }

    const analysis = await analyzeWithPython(request.path)
    persistAnalysis(database, request.trackId, sourceMtimeMs, analysis)
    parentPort?.postMessage({ type: 'analysis', id: request.id, analysis, cached: false })
  }
  catch (error) {
    parentPort?.postMessage({ type: 'error', id: request.id, message: String(error) })
  }
  finally {
    database?.close()
  }
}

async function drain (): Promise<void> {
  if (processing)
    return

  processing = true
  try {
    let request = requests.shift()
    while (request) {
      await fulfill(request)
      request = requests.shift()
    }
  }
  finally {
    processing = false
  }
}

parentPort?.on('message', (message: AnalyzeMessage) => {
  if (message.type !== 'analyze')
    return

  requests.push(message)
  void drain()
})
