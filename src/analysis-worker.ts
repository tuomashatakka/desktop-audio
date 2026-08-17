/**
 * Musical-analysis worker.
 *
 * One Python resolver runs at a time, so skipping through a queue cannot launch
 * several Essentia processes at once. This worker checks SQLite first, invokes
 * the resolver on a miss, and commits the compact harmony result before
 * replying.
 *
 * Two things it is careful about, both learned the hard way:
 *
 * - **The resolver reports a refusal on stdout and still exits non-zero.** A
 *   promisified `execFile` rejects on that exit code and throws the output
 *   away, which turned "this file's audio cannot be decoded" into
 *   `Command failed:` followed by the entire command line. Stdout is read on
 *   failure too, and it is the more specific answer whenever it is there.
 * - **The current track outranks whatever is already running.** The renderer
 *   only ever asks about the track it is showing, so the newest request is by
 *   definition the one the listener is looking at — see {@link drain}.
 */
import { execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { stat } from 'node:fs/promises'
import { parentPort, workerData } from 'node:worker_threads'
import { ANALYSIS_VERSION, createAnalysisTableSql } from './analysis-schema'
import type { TrackAnalysis } from './app/services/types'


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

/**
 * The backlog, newest last. Requests are taken off the *end* — see
 * {@link drain} — and anything past this many is abandoned rather than kept
 * forever: a listener who has skipped this far is not waiting on the twentieth
 * track back, and the renderer asks again if they return to it.
 */
const QUEUE_LIMIT = 8

/** How long one file may hold the resolver before it is given up on. */
const RESOLVER_TIMEOUT_MS = 15 * 60 * 1000

const requests: AnalyzeMessage[] = []
let processing = false

/** The resolver currently running, so a newer request can cut it short. */
let running: { id: number; kill: () => void } | null = null

/**
 * A failure the file itself caused: the resolver ran, looked at it, and
 * refused. Those are written down like a result, because retrying is
 * guaranteed to fail the same way until the file changes — and re-launching
 * Python on every view of an undecodable track is the difference between a
 * quiet message and a stutter.
 *
 * Everything else — a missing interpreter, a preemption, a timeout — is
 * transient, and is never recorded.
 */
class ResolverRefusal extends Error {}

/** Raised when a newer request takes the resolver away from this one. */
class Preempted extends Error {}

function openDatabase (): SqliteDatabase {
  const { dbPath } = workerData as AnalysisWorkerData
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native CommonJS addon externalized from the worker bundle.
  const Database = require('better-sqlite3')
  const database = new Database(dbPath) as SqliteDatabase
  database.exec(createAnalysisTableSql())
  return database
}

/** A stored row is either a result or the reason there will never be one. */
type CachedOutcome =
  | { readonly kind: 'analysis'; readonly analysis: TrackAnalysis } |
  { readonly kind: 'refused'; readonly message: string }

function cachedOutcome (
  database: SqliteDatabase,
  trackId: string,
  sourceMtimeMs: number
): CachedOutcome | null {
  const row = database.prepare(
    'SELECT source_mtime_ms, analyzer_version, result_json FROM track_analysis WHERE track_id = ?'
  ).get(trackId)

  if (
    !row ||
    row.source_mtime_ms !== sourceMtimeMs ||
    row.analyzer_version !== ANALYSIS_VERSION
  )
    return null

  const stored = JSON.parse(row.result_json) as Record<string, unknown>

  return typeof stored.error === 'string'
    ? { kind: 'refused', message: stored.error }
    : { kind: 'analysis', analysis: stored as unknown as TrackAnalysis }
}

function persistOutcome (
  database: SqliteDatabase,
  trackId: string,
  sourceMtimeMs: number,
  outcome: TrackAnalysis | { readonly error: string }
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
    JSON.stringify(outcome),
    Date.now()
  )
}

/**
 * A sentence a listener can act on, in front of the decoder's own words.
 *
 * Essentia's loader speaks in ffmpeg: *"Error while configuring MonoLoader:
 * AudioLoader: Could not open file …, error = Invalid data found when
 * processing input"* describes a file whose audio simply is not in a format
 * anything here can read. Ableton's `.aif` samples are the common case — they
 * carry an `able` codec in an AIFF-C wrapper that neither ffmpeg nor CoreAudio
 * decodes — and saying so is more use than repeating the stack it came out of.
 */
function humanize (message: string): string {
  if ((/Could not open file|Invalid data|unsupported|no such format/iu).test(message))
    return 'this file\'s audio could not be decoded — its format is not one the analyzer can read'

  if ((/MemoryError|Killed/u).test(message))
    return 'the analyzer ran out of memory on this file'

  return message
}

/** The most informative line of a stream: the last non-empty one. */
function lastLine (text: string): string {
  return text.trim().split(/\r?\n/u)
    .at(-1) ?? ''
}

function compactResult (value: unknown): TrackAnalysis {
  const result = value as Record<string, unknown>
  if (typeof result.error === 'string')
    throw new ResolverRefusal(humanize(result.error))

  if (
    typeof result.duration !== 'number' ||
    typeof result.tempo !== 'object' ||
    typeof result.key !== 'object' ||
    !Array.isArray(result.beats) ||
    !Array.isArray(result.chords)
  )
    throw new ResolverRefusal('the analyzer returned an invalid harmony result')

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

interface ResolverProcess {
  readonly output: Promise<string>
  readonly kill:   () => void
}

/**
 * Launch the Python resolver, keeping its handle so it can be cut short.
 *
 * Stdout is preferred over the exit code deliberately: the resolver prints its
 * refusal as JSON *and* returns 1 or 2, so a non-zero exit that produced output
 * is a real answer rather than a crash.
 */
function spawnResolver (trackPath: string): ResolverProcess {
  const { analyzerRoot, pythonPath, resolverPath } = workerData as AnalysisWorkerData

  let child: ChildProcess | undefined
  let preempted = false

  const output = new Promise<string>((resolve, reject) => {
    child = execFile(
      pythonPath,
      [ resolverPath, analyzerRoot, trackPath ],
      {
        cwd:       analyzerRoot,
        encoding:  'utf8',
        env:       { ...process.env, PYGAME_HIDE_SUPPORT_PROMPT: '1' },
        maxBuffer: 64 * 1024 * 1024,
        timeout:   RESOLVER_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (preempted)
          return reject(new Preempted('superseded by the current track'))

        if (stdout.trim())
          return resolve(stdout)

        if (error)
          return reject(new Error(humanize(lastLine(stderr) || error.message)))

        reject(new Error('the analyzer produced no result'))
      }
    )
  })

  return {
    output,
    kill: () => {
      preempted = true
      child?.kill('SIGTERM')
    },
  }
}

async function analyzeWithPython (trackPath: string, id: number): Promise<TrackAnalysis> {
  const { analyzerRoot, pythonPath, resolverPath } = workerData as AnalysisWorkerData
  const analyzerEntry                              = `${analyzerRoot}/backend/analyze.py`

  if (!fs.existsSync(analyzerEntry))
    throw new Error(`audio analyzer not found at ${analyzerEntry}`)
  if (!fs.existsSync(resolverPath))
    throw new Error(`harmony resolver not found at ${resolverPath}`)
  if (pythonPath.includes('/') && !fs.existsSync(pythonPath))
    throw new Error(`audio analyzer python not found at ${pythonPath}`)

  const resolver = spawnResolver(trackPath)
  running        = { id, kill: resolver.kill }

  try {
    const json = lastLine(await resolver.output)
    if (!json)
      throw new Error('the analyzer produced no result')

    return compactResult(JSON.parse(json))
  }
  finally {
    running = null
  }
}

/** Write a refusal down, so this file is never handed to Python again. */
async function remember (
  database: SqliteDatabase | null,
  request: AnalyzeMessage,
  message: string
): Promise<void> {
  if (!database)
    return

  try {
    persistOutcome(
      database,
      request.trackId,
      Math.round((await stat(request.path)).mtimeMs),
      { error: message }
    )
  }
  catch {
    // The file moved mid-flight. There is nothing worth recording about a
    // path that no longer describes anything.
  }
}

async function fulfill (request: AnalyzeMessage): Promise<void> {
  let database: SqliteDatabase | null = null

  try {
    const sourceMtimeMs = Math.round((await stat(request.path)).mtimeMs)
    database            = openDatabase()

    const cached = cachedOutcome(database, request.trackId, sourceMtimeMs)
    if (cached?.kind === 'analysis') {
      parentPort?.postMessage({
        type: 'analysis', id: request.id, analysis: cached.analysis, cached: true,
      })
      return
    }
    // Already written down: report it, but do not write it again on every view.
    if (cached?.kind === 'refused') {
      parentPort?.postMessage({
        type: 'error', id: request.id, message: cached.message, permanent: true,
      })
      return
    }

    const analysis = await analyzeWithPython(request.path, request.id)
    persistOutcome(database, request.trackId, sourceMtimeMs, analysis)
    parentPort?.postMessage({ type: 'analysis', id: request.id, analysis, cached: false })
  }
  catch (error) {
    if (error instanceof ResolverRefusal)
      await remember(database, request, error.message)

    parentPort?.postMessage({
      type:      'error',
      id:        request.id,
      message:   error instanceof Error ? error.message : String(error),
      permanent: error instanceof ResolverRefusal,
    })
  }
  finally {
    database?.close()
  }
}

/**
 * Work the backlog newest first.
 *
 * The renderer only ever asks about the track it is showing, so the newest
 * request *is* the current track — taking from the end is what makes the thing
 * the listener is looking at outrank the four they skipped past to reach it. A
 * strict queue analysed them in the order they were abandoned.
 */
async function drain (): Promise<void> {
  if (processing)
    return

  processing = true
  try {
    let request = requests.pop()
    while (request) {
      await fulfill(request)
      request = requests.pop()
    }
  }
  finally {
    processing = false
  }
}

/** Abandon everything but the newest few, so the backlog cannot grow forever. */
function trimBacklog (): void {
  if (requests.length <= QUEUE_LIMIT)
    return

  for (const dropped of requests.splice(0, requests.length - QUEUE_LIMIT))
    parentPort?.postMessage({
      type: 'error', id: dropped.id, message: 'superseded by newer tracks', permanent: false,
    })
}

parentPort?.on('message', (message: AnalyzeMessage) => {
  if (message.type !== 'analyze')
    return

  requests.push(message)
  trimBacklog()

  // The resolver is single-threaded and one file can hold it for minutes, so
  // priority has to mean preemption: an analysis still running for a track the
  // listener has already left is work nobody is waiting for. The preempted
  // request is not requeued — the renderer asks again if it still needs it,
  // and by then it usually does not.
  if (running && running.id !== message.id)
    running.kill()

  void drain()
})
