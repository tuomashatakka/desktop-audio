/**
 * Electron main process — app lifecycle, BrowserWindow setup, IPC handlers,
 * scanner-worker supervision, and OS media-session integration.
 *
 * IPC channels follow the `namespace:action` convention (see `CLAUDE.md`):
 * `library:*` for scanning/track CRUD, `file:*` for filesystem reads,
 * `window:*` for chrome controls, `media:*` for transport state.
 */
import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import started from 'electron-squirrel-startup'
import * as mm from 'music-metadata'
import * as mediaControls from './media-controls'
import { rowToListDto } from './track-schema'
import type { MediaState, SerializableMenuItem, TrackAnalysis } from './app/services/types'


if (started)
  app.quit()

/**
 * One instance per user-data-dir. Nothing here used to quit the app — the
 * popover window kept `window-all-closed` from ever firing and Forge's SIGINT
 * handler exits without killing its Electron child — so every dev session left
 * a live process holding the profile's leveldb locks. A second instance then
 * started alongside it and died silently inside a `localStorage` read. Failing
 * the lock is loud; colliding on it was not.
 */
const gotInstanceLock = app.requestSingleInstanceLock()

if (!gotInstanceLock) {
  console.error(
    '◬ [main] another desktop-audio instance already owns this profile — exiting. ' +
    'Leftover process? `pkill -f "desktop-audio.*Electron"`'
  )
  // `app.quit()` only *requests* a shutdown, asynchronously, and this runs
  // before the app has ever reached `ready`. With no `return` after it the
  // loser fell straight through, registered `ready` and every IPC handler, and
  // then raced its own teardown — which is one of the ways a launch ended with
  // no window at all. `exit` is immediate and unambiguous.
  app.exit(0)
}

/** Frameless windows paint their own background; the shell supplies the rest. */
const TRANSPARENT_BACKGROUND = '#00000000'

const MAIN_WINDOW_WIDTH  = 1200
const MAIN_WINDOW_HEIGHT = 800

/** Small enough to let the mini player tier be reachable by dragging. */
const MAIN_WINDOW_MIN_WIDTH  = 60
const MAIN_WINDOW_MIN_HEIGHT = 60

/** Placeholder bounds only — `contextmenu:show` sets the real ones per menu. */
const POPOVER_WINDOW_WIDTH  = 240
const POPOVER_WINDOW_HEIGHT = 160

/**
 * How hard to chase a dev server that is not listening yet. Forge freezes
 * `http://localhost:<port>` into this bundle at build time, so the URL is fixed
 * before the server is up and a first load can legitimately lose the race.
 */
const DEV_LOAD_RETRIES     = 20
const DEV_LOAD_RETRY_DELAY = 250

/**
 * Backstop for revealing the window when no load event ever says it is ready.
 * Long enough that it never beats a healthy startup, short enough that a user
 * does not conclude the app is broken.
 */
const SHOW_FALLBACK_MS = 4000

/** Chromium's "load was cancelled by us", not a failure worth retrying. */
const ERR_ABORTED = -3

let mainWindow: BrowserWindow | null    = null
let popoverWindow: BrowserWindow | null = null

// ─── Logging ──────────────────────────────────────────────────────────────────

const log = {
  info: (msg: string) =>
    console.log(`ⓘ [main] ${msg}`),
  debug: (msg: string) =>
    console.log(`⌗ [main] ${msg}`),
  warn: (msg: string) =>
    console.warn(`◬ [main] ${msg}`),
  error: (msg: string) =>
    console.error(`⨂ [main] ${msg}`),
}

/**
 * Last-resort visible failure.
 *
 * The window is frameless, transparent and painted `#00000000`, so a renderer
 * that never loads is not "a broken window" — it is *no window at all* to look
 * at, while the process stays alive. Every failure below therefore ends up
 * here rather than in a log nobody reads.
 */
const errorPage = (title: string, detail: string) =>
  'data:text/html;charset=utf-8,' + encodeURIComponent(
    `<html><body style="margin:0;font:14px/1.6 -apple-system,sans-serif;` +
    `background:#1a1a1a;color:#eee;padding:2rem;-webkit-app-region:drag">` +
    `<h1 style="font-size:16px;margin:0 0 .5rem">${title}</h1>` +
    `<pre style="white-space:pre-wrap;color:#f88;margin:0">${detail}</pre></body></html>`
  )

const createWindow = () => {
  const win = new BrowserWindow({
    icon:            path.join(__dirname, '..', 'assets', 'icon.png'),
    width:           MAIN_WINDOW_WIDTH,
    height:          MAIN_WINDOW_HEIGHT,
    minWidth:        MAIN_WINDOW_MIN_WIDTH,
    minHeight:       MAIN_WINDOW_MIN_HEIGHT,
    frame:           false,
    transparent:     true,
    backgroundColor: TRANSPARENT_BACKGROUND,
    // Nothing is shown until the renderer has something to paint — otherwise a
    // failed load leaves an invisible window that reads as "the app didn't start".
    show:            false,
    webPreferences:  {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  mainWindow = win

  const load = () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
      return win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    return win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )
  }

  /**
   * Revealing the window is idempotent and has three independent triggers,
   * because `ready-to-show` is not a guarantee. On a `frame: false` +
   * `transparent` window it can simply never arrive, and the result — a live,
   * healthy process behind a window nobody can see — is indistinguishable from
   * the app failing to start. Whichever trigger arrives first wins; the timer
   * is the backstop for none of them arriving. The log line names the winner,
   * so the next occurrence is diagnosable instead of silent.
   */
  let shown = false

  // A declaration, so the timer below can be a `const` that `show` still
  // reaches: it is only ever read once `show` is actually called.
  function show (via: string) {
    if (shown || win.isDestroyed())
      return
    shown = true
    clearTimeout(showFallback)
    log.info(`▣ main window shown via ${via}`)
    win.show()
  }

  const showFallback = setTimeout(() =>
    show('fallback timer'), SHOW_FALLBACK_MS)

  win.once('ready-to-show', () =>
    show('ready-to-show'))
  win.webContents.once('did-finish-load', () =>
    show('did-finish-load'))

  let attempts = 0

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED)
      return

    log.error(`renderer load failed (${errorCode} ${errorDescription}) — ${validatedURL}`)

    if (attempts++ < DEV_LOAD_RETRIES) {
      setTimeout(() => {
        if (!win.isDestroyed())
          void load()
      }, DEV_LOAD_RETRY_DELAY)
      return
    }

    // Out of retries. Show *something* rather than an invisible ghost process.
    void win.loadURL(errorPage(
      'Renderer failed to load',
      `${errorCode} ${errorDescription}\n${validatedURL}\n\n` +
      `Is the Vite dev server listening on that exact host and port?`
    ))
    show('error page')
  })

  // A dead renderer looks identical to a window that never opened, so say so.
  win.webContents.on('render-process-gone', (_e, details) =>
    log.error(`renderer process gone — reason: ${details.reason}, exitCode: ${details.exitCode}`))

  win.on('unresponsive', () =>
    log.warn('renderer is unresponsive'))

  void load()

  win.on('closed', () => {
    clearTimeout(showFallback)
    mainWindow = null
    // The popover is a `show: false` helper that is only ever hidden, never
    // closed — leaving it alive kept the window count above zero forever, so
    // `window-all-closed` could not fire and the process outlived its UI.
    if (popoverWindow && !popoverWindow.isDestroyed())
      popoverWindow.destroy()
    popoverWindow = null
  })
}

const createPopoverWindow = () => {
  popoverWindow = new BrowserWindow({
    width:           POPOVER_WINDOW_WIDTH,
    height:          POPOVER_WINDOW_HEIGHT,
    show:            false,
    frame:           false,
    transparent:     true,
    backgroundColor: TRANSPARENT_BACKGROUND,
    alwaysOnTop:     true,
    skipTaskbar:     true,
    resizable:       false,
    webPreferences:  {
      preload:          path.join(__dirname, 'context-menu-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (CONTEXT_MENU_WINDOW_VITE_DEV_SERVER_URL)
    popoverWindow.loadURL(CONTEXT_MENU_WINDOW_VITE_DEV_SERVER_URL)
  else
    popoverWindow.loadFile(
      path.join(__dirname, `../renderer/${CONTEXT_MENU_WINDOW_VITE_NAME}/index.html`),
    )

  popoverWindow.on('blur', () =>
    popoverWindow?.hide())
  popoverWindow.on('closed', () => {
    popoverWindow = null
  })
}

// Guarded on the lock: an instance that lost it is on its way out, and a
// half-started loser registering handlers over a profile it does not own is
// exactly the race that left a launch with nothing to look at.
if (gotInstanceLock)
  app.on('ready', () => {
    createWindow()
    createPopoverWindow()
    if (mainWindow)
      mediaControls.init(mainWindow)
  })

app.on('will-quit', () =>
  mediaControls.teardown())

/**
 * A second launch surfaces the instance that already owns the profile.
 *
 * It has to actually *reveal* a window, not just focus one: this runs on a
 * process the user can no longer see, whose window may be hidden, minimised, or
 * — if it was closed while the process lingered — absent entirely. Focusing a
 * window that was never shown is a no-op, and returning early on a null
 * `mainWindow` left the second launch producing nothing on either process.
 */
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed())
    createWindow()
  else {
    if (mainWindow.isMinimized())
      mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  app.focus({ steal: true })
})

/**
 * Quit with the last window, macOS included. `createWindow` destroys the
 * popover on close so this can actually fire, and a single-window player has
 * nothing left to be once its window is gone — staying resident is how the
 * orphans accumulated. Dock relaunch still works through `activate`.
 */
app.on('window-all-closed', () =>
  app.quit())

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    createPopoverWindow()
  }
})

/**
 * Quit on the signals a dev session actually ends with.
 *
 * Forge's own SIGINT handler exits without killing its Electron child, so a
 * `Ctrl-C` used to detach a live process that kept holding the profile's
 * single-instance lock — and the *next* launch then lost that lock and had
 * nowhere to go. Handling the signal here removes the precondition for the
 * whole collision rather than coping with it afterwards.
 */
for (const signal of [ 'SIGINT', 'SIGTERM', 'SIGHUP' ] as const)
  process.on(signal, () => {
    log.info(`⏻ ${signal} — quitting`)
    app.quit()
  })

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * DB row → renderer DTO for the *track list*. The column list, and therefore
 * the snake→camel mapping, comes from `track-schema.ts` so adding a tag
 * doesn't need an edit here as well.
 *
 * `album_art` is deliberately absent: it is 372 MB across this library, and
 * relaying it inline put ~744 MB of base64 into the renderer's string heap per
 * scan. Artwork is fetched per track through `library:artwork` instead.
 */
const mapTrack = rowToListDto

/** Every process that opens the library database resolves the path this way. */
const libraryDbPath = () =>
  path.join(app.getPath('appData'), 'library.db')

// ─── File handlers ────────────────────────────────────────────────────────────

ipcMain.handle('file:select', async () => {
  const result = await dialog.showOpenDialog({
    properties: [ 'openDirectory' ],
  })
  if (result.canceled || result.filePaths.length === 0)
    return null
  return result.filePaths[0]
})

ipcMain.handle('file:music-dir', () =>
  app.getPath('music'))

ipcMain.handle('file:metadata', async (_event, filePath: string) => {
  try {
    const metadata = await mm.parseFile(filePath)
    const picture  = metadata.common.picture?.[0]

    let albumArt: string | undefined
    if (picture) {
      const base64 = Buffer.from(picture.data).toString('base64')
      albumArt = `data:${picture.format};base64,${base64}`
    }

    return {
      title:    metadata.common.title || undefined,
      artist:   metadata.common.artist || undefined,
      album:    metadata.common.album || undefined,
      year:     metadata.common.year || undefined,
      genre:    metadata.common.genre?.[0] || undefined,
      track:    metadata.common.track?.no || undefined,
      duration: metadata.format.duration || undefined,
      albumArt,
    }
  }
  catch (error) {
    console.error('Error reading metadata:', error)
    return {}
  }
})

ipcMain.handle('file:read', async (_event, filePath: string) =>
  await fs.promises.readFile(filePath))

// ─── Worker supervision ───────────────────────────────────────────────────────

/**
 * Every worker reply carries the `id` of the request that caused it.
 *
 * Without it, a listener attached for one request sees every other request's
 * replies too — which is fine while only one request is ever in flight, and
 * wrong the moment the track list asks for forty thumbnails at once while a
 * hydrate is still streaming.
 */
type WorkerMessage =
  { type: 'batch'; id: number; tracks: unknown[] } |
  { type: 'done'; id: number; totalCount: number } |
  { type: 'artwork'; id: number; art: string | null } |
  { type: 'analysis'; id: number; analysis: TrackAnalysis; cached: boolean } |
  { type: 'error'; id: number; message: string }

let nextRequestId = 0

/** Worker entry points, spawned as `<name>.js` beside this file. */
const WORKER_SCANNER  = 'scanner-worker'
const WORKER_READER   = 'db-reader'
const WORKER_WRITER   = 'db-writer'
const WORKER_ANALYSIS = 'analysis-worker'

type WorkerName =
  typeof WORKER_SCANNER |
  typeof WORKER_READER |
  typeof WORKER_WRITER |
  typeof WORKER_ANALYSIS

/**
 * `worker.terminate()` emits 'exit' with code 1, not 0 — a deliberate
 * shutdown is indistinguishable from a crash without tracking intent.
 * Without this, every quit prints a spurious "exited with code 1".
 */
let quitting = false

/** The callbacks of one in-flight request, keyed by the id the worker echoes. */
interface PendingRequest {
  onMessage: (msg: WorkerMessage) => void
  onError:   (err: Error) => void
}

/** A worker plus the requests currently waiting on it. See {@link getWorker}. */
interface WorkerHandle {
  worker:  Worker
  pending: Map<number, PendingRequest>
}

const workers = new Map<WorkerName, WorkerHandle>()

/** Locate the explicitly integrated audio-processing-tools analyzer. */
function analysisWorkerData (): Record<string, string> {
  const siblingProject = path.resolve(app.getAppPath(), '..', 'audio-processing-tools')
  const homeProject    = path.join(
    app.getPath('home'), 'Documents', 'Projects', 'audio-processing-tools'
  )
  const projectRoot = fs.existsSync(path.join(siblingProject, 'analyzer'))
    ? siblingProject
    : homeProject

  const pythonPath = process.platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python')

  const resolverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'resolve-harmony.py')
    : path.join(app.getAppPath(), 'resources', 'resolve-harmony.py')

  return {
    analyzerRoot: path.join(projectRoot, 'analyzer'),
    pythonPath,
    resolverPath,
  }
}

/**
 * Lazily spawns each worker and keeps one instance per name. They all share
 * the same database, so they all take the same `dbPath` in `workerData` —
 * re-deriving it worker-side is what once had the writer writing to a file
 * nothing read back.
 */
function getWorker (name: WorkerName): WorkerHandle {
  const existing = workers.get(name)
  if (existing)
    return existing

  const entry = path.join(__dirname, `${name}.js`)

  // `new Worker()` over a missing file fails asynchronously, so an unbuilt
  // worker used to present as nothing happening at all — which is exactly how
  // `db-reader` and `db-writer` went missing for two releases. Fail here, by
  // name, where the cause is still legible.
  if (!fs.existsSync(entry))
    throw new Error(
      `worker '${name}' was never built (${entry} does not exist). ` +
      `Check its entry in config/forge.config.ts and that config/vite/worker.config.ts ` +
      `does not declare build.lib.`
    )

  const worker  = new Worker(
    entry,
    {
      workerData: {
        dbPath: libraryDbPath(),
        ...name === WORKER_ANALYSIS ? analysisWorkerData() : {},
      },
    }
  )
  const pending = new Map<number, PendingRequest>()

  /**
   * One router for the whole worker, rather than a listener pair per request.
   *
   * Every helper below used to `worker.on('message'|'error', …)` on its way in
   * and `off` again when *its own* reply arrived. That is correct for one
   * request at a time and wrong under concurrency: the worker is shared and
   * cached for the process lifetime, so forty simultaneous artwork lookups —
   * exactly what a freshly hydrated track list produces — stacked eighty
   * listeners on it before the first reply detached any, past Node's default
   * cap of ten. Routing on the echoed `id` instead keeps the count at a
   * constant three no matter how much traffic is in flight.
   */
  worker.on('message', (msg: WorkerMessage) =>
    pending.get(msg.id)?.onMessage(msg))

  // A worker that dies takes every request waiting on it down too. Without
  // this they never settle: promises hang forever and a streaming request
  // never sends its terminal `done`, which is what strands the renderer's
  // spinner permanently.
  const failAll = (err: Error) => {
    const waiting = [ ...pending.values() ]
    pending.clear()
    for (const request of waiting)
      request.onError(err)
  }

  worker.on('error', err => {
    console.error(`[${name}]`, err)
    failAll(err)
  })
  worker.on('exit', code => {
    if (code !== 0 && !quitting)
      console.error(`[${name}] exited with code`, code)
    workers.delete(name)
    failAll(new Error(`worker '${name}' exited with code ${code}`))
  })

  const handle: WorkerHandle = { worker, pending }
  workers.set(name, handle)
  return handle
}

app.on('before-quit', () => {
  quitting = true
  for (const { worker } of workers.values())
    void worker.terminate()
})

// ─── Library handlers ─────────────────────────────────────────────────────────

/** Renderer channels one streaming request writes to. */
interface StreamChannels {
  batch: string
  done:  string
}

/**
 * Runs one streaming request against a worker, guaranteeing a terminal event.
 *
 * Every exit — batches exhausted, the worker reporting an error, the worker
 * failing to spawn at all — sends exactly one `done`. That event is what
 * retires the renderer's initial spinner, so a path that can end without it
 * strands the UI permanently; an unbuilt `db-reader` did exactly that, and
 * nothing downstream could tell the difference between "still loading" and
 * "will never load".
 */
function streamFromWorker (
  sender: Electron.WebContents,
  name: WorkerName,
  request: Record<string, unknown>,
  channels: StreamChannels,
  mapBatch: (tracks: unknown[]) => unknown[] = tracks =>
    tracks
): void {
  const t0 = Date.now()
  const id = nextRequestId++

  const send = (channel: string, payload?: unknown) => {
    if (!sender.isDestroyed())
      sender.send(channel, payload)
  }

  let handle: WorkerHandle
  try {
    handle = getWorker(name)
  }
  catch (err) {
    log.error(String(err))
    send('library:error', String(err))
    send(channels.done)
    return
  }

  const { worker, pending } = handle

  let batchCount = 0
  let totalSent  = 0
  let settled    = false

  const finish = (message?: string) => {
    if (settled)
      return
    settled = true
    pending.delete(id)

    if (message) {
      log.warn(`⨂ ${name} error: ${message}`)
      send('library:error', message)
    }
    else
      log.info(`✓ ${name} done — ${totalSent} tracks in ${batchCount} batches · ◴ ${Date.now() - t0}ms`)

    send(channels.done)
  }

  // No id check here any more: the router only ever hands this the replies to
  // request `id`.
  function onMessage (msg: WorkerMessage) {
    if (msg.type === 'batch') {
      const tracks = mapBatch(msg.tracks)
      batchCount++
      totalSent += tracks.length
      log.debug(`⇗ ${name} batch #${batchCount} → renderer (${tracks.length} tracks, ${totalSent} total)`)
      send(channels.batch, tracks)
      return
    }

    finish(msg.type === 'error' ? msg.message : undefined)
  }

  function onError (err: Error) {
    finish(String(err))
  }

  pending.set(id, { onMessage, onError })
  worker.postMessage({ ...request, id })
}

/**
 * Streaming hydrate — the persisted library, read on the reader thread and
 * relayed batch by batch.
 *
 * This used to be an `ipcMain.handle` that opened SQLite synchronously here
 * and returned the whole table in one array: the main process stalled for the
 * length of the query and the renderer painted nothing until it finished.
 * Rows are already DTO-mapped worker-side, so no `mapBatch` here.
 */
ipcMain.on('library:load', event =>
  streamFromWorker(event.sender, WORKER_READER, { type: 'load' }, {
    batch: 'library:hydrate-batch',
    done:  'library:hydrate-done',
  }))

// Streaming scan — delegates all work to the scanner worker
ipcMain.on('library:scan', (event, dirPaths: string[]) => {
  log.info(`⟲ library:scan — ${dirPaths.length} path(s): ${dirPaths.join(', ')}`)

  streamFromWorker(event.sender, WORKER_SCANNER, { type: 'scan', dirPaths }, {
    batch: 'library:batch',
    done:  'library:done',
  }, tracks =>
    (tracks as Record<string, unknown>[]).map(mapTrack))
})

// ─── Artwork ──────────────────────────────────────────────────────────────────

/**
 * Album art is fetched per track rather than carried on every list row.
 *
 * The blob read happens on the reader thread (some rows are 2.4 MB), but the
 * downscale has to happen here: `nativeImage` is an Electron API and is not
 * reachable from a worker thread.
 */
const ARTWORK_THUMB_WIDTH = 64

/** Rough ceiling on retained art; thumbs are small, full art is not. */
const ARTWORK_CACHE_LIMIT = 256

type ArtworkSize = 'thumb' | 'full'

const artworkCache = new Map<string, string | null>()

/** Insertion-ordered LRU-ish eviction — good enough for a scroll window. */
function cacheArtwork (key: string, value: string | null): string | null {
  artworkCache.set(key, value)
  if (artworkCache.size > ARTWORK_CACHE_LIMIT) {
    const oldest = artworkCache.keys().next().value
    if (oldest !== undefined)
      artworkCache.delete(oldest)
  }
  return value
}

/** One `artwork` round-trip to the reader thread, resolved by request id. */
function requestArtwork (trackId: string): Promise<string | null> {
  const { worker, pending } = getWorker(WORKER_READER)
  const id                  = nextRequestId++

  return new Promise<string | null>((resolve, reject) => {
    pending.set(id, {
      onMessage: msg => {
        pending.delete(id)
        if (msg.type === 'error')
          reject(new Error(msg.message))
        else
          resolve(msg.type === 'artwork' ? msg.art : null)
      },
      onError: err => {
        pending.delete(id)
        reject(err)
      },
    })
    worker.postMessage({ type: 'artwork', trackId, id })
  })
}

ipcMain.handle('library:artwork', async (_event, trackId: string, size: ArtworkSize = 'thumb') => {
  const key    = `${size}:${trackId}`
  const cached = artworkCache.get(key)
  if (cached !== undefined)
    return cached

  try {
    const art = await requestArtwork(trackId)
    if (!art)
      return cacheArtwork(key, null)
    if (size === 'full')
      return cacheArtwork(key, art)

    const image = nativeImage.createFromDataURL(art)
    if (image.isEmpty())
      return cacheArtwork(key, art)

    return cacheArtwork(key, image.resize({ width: ARTWORK_THUMB_WIDTH }).toDataURL())
  }
  catch (err) {
    log.warn(`⨂ artwork failed for ${trackId}: ${String(err)}`)
    return null
  }
})

// ─── Musical analysis ─────────────────────────────────────────────────────────

/**
 * Resolve one current track away from the main and renderer threads.
 *
 * The analysis worker checks SQLite first, queues cache misses, invokes the
 * audio-processing-tools Python pipeline, then commits the result before this
 * promise settles.
 */
function requestAnalysis (trackId: string, trackPath: string): Promise<TrackAnalysis> {
  const { worker, pending } = getWorker(WORKER_ANALYSIS)
  const id                  = nextRequestId++

  return new Promise<TrackAnalysis>((resolve, reject) => {
    pending.set(id, {
      onMessage: msg => {
        pending.delete(id)
        if (msg.type === 'error')
          reject(new Error(msg.message))
        else if (msg.type === 'analysis')
          resolve(msg.analysis)
        else
          reject(new Error('analysis worker returned an unexpected response'))
      },
      onError: err => {
        pending.delete(id)
        reject(err)
      },
    })
    worker.postMessage({ type: 'analyze', id, trackId, path: trackPath })
  })
}

ipcMain.handle('library:analysis', async (_event, trackId: string, trackPath: string) => {
  try {
    return await requestAnalysis(trackId, trackPath)
  }
  catch (error) {
    log.warn(`⨂ analysis failed for ${trackId}: ${String(error)}`)
    throw error
  }
})

// ─── Window handlers ──────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})

ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win?.isMaximized())
    win.unmaximize()
  else
    win?.maximize()
})

ipcMain.on('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

ipcMain.handle('window:is-maximized', () =>
  BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)

/**
 * Resize the focused window's *content* area, so the values round-trip with
 * the renderer's `window.innerWidth`/`innerHeight`. Un-maximizes first —
 * `setContentSize` is a no-op on a maximized window.
 */
ipcMain.on('window:set-size', (_e, width: number, height: number) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win)
    return
  if (win.isMaximized())
    win.unmaximize()
  win.setContentSize(Math.round(width), Math.round(height), true)
})

// ─── Context menu handlers ────────────────────────────────────────────────────

/** Bounds plus the theme the separate menu window has to paint itself with. */
interface ContextMenuRequest {
  items:   SerializableMenuItem[]
  x:       number
  y:       number
  width:   number
  height:  number
  theme?:  string
  accent?: string
}

/** Which entry of the menu the user picked. */
interface ContextMenuSelection {
  index: number
}

ipcMain.on('contextmenu:show', (_event, payload: ContextMenuRequest) => {
  if (!popoverWindow)
    return
  popoverWindow.setBounds({
    x:      Math.round(payload.x),
    y:      Math.round(payload.y),
    width:  payload.width,
    height: payload.height,
  })

  // The menu lives in its own BrowserWindow, so it inherits nothing from the
  // app's DOM — theme and accent have to be handed over explicitly.
  popoverWindow.webContents.send('contextmenu:items', {
    items:  payload.items,
    theme:  payload.theme ?? 'dark',
    accent: payload.accent,
  })
  popoverWindow.show()
  popoverWindow.focus()
})

ipcMain.on('contextmenu:hide', () =>
  popoverWindow?.hide())

ipcMain.on('contextmenu:action', (_event, { index }: ContextMenuSelection) => {
  mainWindow?.webContents.send('contextmenu:action', { index })
  popoverWindow?.hide()
})

// ─── Media state handler ──────────────────────────────────────────────────────

ipcMain.on('media:state-update', (_event, state: MediaState) =>
  mediaControls.updateState(state))

// ─── Model write handlers ───────────────────────────────────────────────────

/** Round-trips one write through the writer worker as a promise. */
function requestWrite (message: Record<string, unknown>): Promise<void> {
  const { worker, pending } = getWorker(WORKER_WRITER)
  const id                  = nextRequestId++

  return new Promise<void>((resolve, reject) => {
    pending.set(id, {
      onMessage: msg => {
        pending.delete(id)
        if (msg.type === 'error')
          reject(new Error(msg.message))
        else
          resolve()
      },
      onError: err => {
        pending.delete(id)
        reject(err)
      },
    })
    worker.postMessage({ ...message, id })
  })
}

ipcMain.handle('models:upsert', (_event, kind: string, payload: Record<string, unknown>) =>
  requestWrite({ type: 'upsert', kind, payload }))

// `trackId`, not `id` — `requestWrite` stamps its own numeric `id` onto every
// message for reply correlation, and would otherwise overwrite this one.
ipcMain.handle('models:delete', (_event, kind: string, trackId: string) =>
  requestWrite({ type: 'delete', kind, trackId }))

/**
 * Discard every persisted track under the given roots — a library folder the
 * user removed in Settings. Nothing else can reach those rows: the scanner's
 * prune only ever looks inside the roots it was asked to scan.
 */
ipcMain.handle('library:forget-roots', (_event, roots: string[]) => {
  log.info(`⊖ library:forget-roots — ${roots.length} path(s): ${roots.join(', ')}`)
  return requestWrite({ type: 'forget-roots', kind: 'track', roots })
})

/**
 * Discard specific tracks — the reconciliation for rows stranded by a root
 * that was removed before `library:forget-roots` existed.
 */
ipcMain.handle('library:forget-tracks', (_event, trackIds: string[]) => {
  log.info(`⊖ library:forget-tracks — ${trackIds.length} track(s)`)
  return requestWrite({ type: 'forget-tracks', kind: 'track', trackIds })
})
