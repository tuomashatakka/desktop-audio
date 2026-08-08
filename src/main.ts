/**
 * Electron main process — app lifecycle, BrowserWindow setup, IPC handlers,
 * scanner-worker supervision, and OS media-session integration.
 *
 * IPC channels follow the `namespace:action` convention (see `CLAUDE.md`):
 * `library:*` for scanning/track CRUD, `file:*` for filesystem reads,
 * `window:*` for chrome controls, `media:*` for transport state.
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import started from 'electron-squirrel-startup'
import * as mm from 'music-metadata'
import * as mediaControls from './media-controls'
import { rowToDto } from './track-schema'
import type { MediaState, SerializableMenuItem } from './app/services/types'


if (started)
  app.quit()

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

let mainWindow: BrowserWindow | null    = null
let popoverWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    icon:            path.join(__dirname, '..', 'assets', 'icon.png'),
    width:           MAIN_WINDOW_WIDTH,
    height:          MAIN_WINDOW_HEIGHT,
    minWidth:        MAIN_WINDOW_MIN_WIDTH,
    minHeight:       MAIN_WINDOW_MIN_HEIGHT,
    frame:           false,
    transparent:     true,
    backgroundColor: TRANSPARENT_BACKGROUND,
    webPreferences:  {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  else
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )

  mainWindow.on('closed', () => {
    mainWindow = null
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

app.on('ready', () => {
  createWindow()
  createPopoverWindow()
  if (mainWindow)
    mediaControls.init(mainWindow)
})

app.on('will-quit', () =>
  mediaControls.teardown())

app.on('window-all-closed', () => {
  const userWindows = BrowserWindow.getAllWindows().filter(w =>
    w !== popoverWindow)
  if (process.platform !== 'darwin' && userWindows.length === 0)
    app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().filter(w =>
    w !== popoverWindow).length === 0)
    createWindow()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * DB row → renderer DTO. The column list, and therefore the snake→camel
 * mapping, comes from `track-schema.ts` so adding a tag doesn't need an edit
 * here as well.
 */
const mapTrack = rowToDto

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

ipcMain.handle('file:read', async (_event, filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  return buffer
})

// ─── Logging ──────────────────────────────────────────────────────────────────

const log = {
  info: (msg: string) =>
    console.log(`ⓘ [main] ${msg}`),
  debug: (msg: string) =>
    console.log(`⌗ [main] ${msg}`),
  warn: (msg: string) =>
    console.warn(`◬ [main] ${msg}`),
}

// ─── Worker supervision ───────────────────────────────────────────────────────

type WorkerMessage =
  { type: 'batch'; tracks: unknown[] } |
  { type: 'done'; totalCount: number } |
  { type: 'error'; message: string }

/** Worker entry points, spawned as `<name>.js` beside this file. */
const WORKER_SCANNER = 'scanner-worker'
const WORKER_READER  = 'db-reader'
const WORKER_WRITER  = 'db-writer'

type WorkerName = typeof WORKER_SCANNER | typeof WORKER_READER | typeof WORKER_WRITER

/**
 * `worker.terminate()` emits 'exit' with code 1, not 0 — a deliberate
 * shutdown is indistinguishable from a crash without tracking intent.
 * Without this, every quit prints a spurious "exited with code 1".
 */
let quitting = false

const workers = new Map<WorkerName, Worker>()

/**
 * Lazily spawns each worker and keeps one instance per name. They all share
 * the same database, so they all take the same `dbPath` in `workerData` —
 * re-deriving it worker-side is what once had the writer writing to a file
 * nothing read back.
 */
function getWorker (name: WorkerName): Worker {
  const existing = workers.get(name)
  if (existing)
    return existing

  const worker = new Worker(
    path.join(__dirname, `${name}.js`),
    { workerData: { dbPath: libraryDbPath() }}
  )

  worker.on('error', err =>
    console.error(`[${name}]`, err))
  worker.on('exit', code => {
    if (code !== 0 && !quitting)
      console.error(`[${name}] exited with code`, code)
    workers.delete(name)
  })

  workers.set(name, worker)
  return worker
}

app.on('before-quit', () => {
  quitting = true
  for (const worker of workers.values())
    void worker.terminate()
})

// ─── Library handlers ─────────────────────────────────────────────────────────

/**
 * Streaming hydrate — the persisted library, read on the reader thread and
 * relayed batch by batch.
 *
 * This used to be an `ipcMain.handle` that opened SQLite synchronously here
 * and returned the whole table in one array: the main process stalled for the
 * length of the query and the renderer painted nothing until it finished.
 */
ipcMain.on('library:load', event => {
  const t0     = Date.now()
  const worker = getWorker(WORKER_READER)

  let batchCount = 0

  const handle = (msg: WorkerMessage) => {
    if (msg.type === 'batch') {
      batchCount++
      log.debug(`⇗ hydrate batch #${batchCount} → renderer (${msg.tracks.length} tracks)`)
      event.sender.send('library:hydrate-batch', msg.tracks)
      return
    }

    worker.off('message', handle)
    if (msg.type === 'error')
      log.warn(`⨂ hydrate error from worker: ${msg.message}`)
    else
      log.info(`▤ library:load done — ${msg.totalCount} tracks in ${batchCount} batches · ◴ ${Date.now() - t0}ms`)

    event.sender.send('library:hydrate-done')
  }

  worker.on('message', handle)
  worker.postMessage({ type: 'load' })
})

// Streaming scan — delegates all work to the scanner worker
ipcMain.on('library:scan', (event, dirPaths: string[]) => {
  const t0     = Date.now()
  const worker = getWorker(WORKER_SCANNER)

  log.info(`⟲ library:scan — ${dirPaths.length} path(s): ${dirPaths.join(', ')}`)

  let batchCount = 0
  let totalSent  = 0

  const handle = (msg: WorkerMessage) => {
    if (msg.type === 'batch') {
      const tracks = (msg.tracks as Record<string, unknown>[]).map(mapTrack)
      batchCount++
      totalSent += tracks.length
      log.debug(`⇗ batch #${batchCount} → renderer (${tracks.length} tracks, ${totalSent} total)`)
      event.sender.send('library:batch', tracks)
    }
    else if (msg.type === 'done' || msg.type === 'error') {
      worker.off('message', handle)
      if (msg.type === 'error')
        log.warn(`⨂ scan error from worker: ${msg.message}`)
      else
        log.info(`✓ library:scan done — ${totalSent} tracks in ${batchCount} batches · ◴ ${Date.now() - t0}ms`)
      event.sender.send('library:done')
    }
  }

  worker.on('message', handle)
  worker.postMessage({ type: 'scan', dirPaths })
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
  const worker = getWorker(WORKER_WRITER)

  return new Promise<void>((resolve, reject) => {
    const handler = (msg: WorkerMessage) => {
      worker.off('message', handler)
      if (msg.type === 'error')
        reject(new Error(msg.message))
      else
        resolve()
    }

    worker.on('message', handler)
    worker.postMessage(message)
  })
}

ipcMain.handle('models:upsert', (_event, kind: string, payload: Record<string, unknown>) =>
  requestWrite({ type: 'upsert', kind, payload }))

ipcMain.handle('models:delete', (_event, kind: string, id: string) =>
  requestWrite({ type: 'delete', kind, id }))
