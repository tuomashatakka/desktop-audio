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
import type { MediaState, SerializableMenuItem } from './app/services/types'


if (started) {
  app.quit()
}

// eslint-disable-next-line functional/no-let
let mainWindow: BrowserWindow | null = null
// eslint-disable-next-line functional/no-let
let popoverWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    icon:            path.join(__dirname, '..', 'assets', 'icon.png'),
    width:           1200,
    height:          800,
    minWidth:        60,
    minHeight:       60,
    frame:           false,
    transparent:     true,
    backgroundColor: '#00000000',
    webPreferences:  {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  }
  else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    )
  }

  mainWindow.webContents.openDevTools()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const createPopoverWindow = () => {
  popoverWindow = new BrowserWindow({
    width:           240,
    height:          160,
    show:            false,
    frame:           false,
    transparent:     true,
    backgroundColor: '#00000000',
    alwaysOnTop:     true,
    skipTaskbar:     true,
    resizable:       false,
    webPreferences:  {
      preload:          path.join(__dirname, 'context-menu-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  if (CONTEXT_MENU_WINDOW_VITE_DEV_SERVER_URL) {
    popoverWindow.loadURL(CONTEXT_MENU_WINDOW_VITE_DEV_SERVER_URL)
  }
  else {
    popoverWindow.loadFile(
      path.join(__dirname, `../renderer/${CONTEXT_MENU_WINDOW_VITE_NAME}/index.html`),
    )
  }

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
  if (process.platform !== 'darwin' && userWindows.length === 0) {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().filter(w =>
    w !== popoverWindow).length === 0) {
    createWindow()
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapTrack ({ mtime_ms: _mtime, cover_color, album_art, track_number, ...rest }: Record<string, unknown>) {
  return {
    ...rest,
    coverColor:  cover_color,
    albumArt:    album_art ?? undefined,
    trackNumber: track_number ?? undefined,
  }
}

// ─── File handlers ────────────────────────────────────────────────────────────

ipcMain.handle('file:select', async () => {
  const result = await dialog.showOpenDialog({
    properties: [ 'openDirectory' ],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('file:music-dir', () =>
  app.getPath('music'))

ipcMain.handle('file:metadata', async (_event, filePath: string) => {
  try {
    const metadata = await mm.parseFile(filePath)
    const picture = metadata.common.picture?.[0]

    // eslint-disable-next-line functional/no-let
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

// ─── Library handlers ─────────────────────────────────────────────────────────

// Fast startup: return all persisted tracks from SQLite without scanning
ipcMain.handle('library:load', () => {
  const dbPath = path.join(app.getPath('appData'), 'library.db')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    const rows = db.prepare('SELECT * FROM tracks ORDER BY title ASC').all() as Record<string, unknown>[]
    db.close()
    log.info(`▤ library:load → ${rows.length} tracks from DB`)
    return rows.map(mapTrack)
  }
  catch {
    log.info('▤ library:load → DB not yet created (first run)')
    return [] // DB not yet created (first run)
  }
})

// ─── Scanner worker ───────────────────────────────────────────────────────────

type WorkerMessage =
  { type: 'batch'; tracks: unknown[] } |
  { type: 'done'; totalCount: number } |
  { type: 'error'; message: string }

/**
 * `worker.terminate()` emits 'exit' with code 1, not 0 — a deliberate
 * shutdown is indistinguishable from a crash without tracking intent.
 * Without this, every quit prints a spurious "exited with code 1".
 */
// eslint-disable-next-line functional/no-let
let quitting = false

// eslint-disable-next-line functional/no-let
let scanWorker: Worker | null = null

function getScanWorker (): Worker {
  if (scanWorker)
    return scanWorker

  const dbPath = path.join(app.getPath('appData'), 'library.db')
  scanWorker = new Worker(
    path.join(__dirname, 'scanner-worker.js'),
    { workerData: { dbPath }}
  )
  scanWorker.on('error', err =>
    console.error('[scanner-worker]', err))
  scanWorker.on('exit', code => {
    if (code !== 0 && !quitting)
      console.error('[scanner-worker] exited with code', code)
    scanWorker = null
  })
  return scanWorker
}

app.on('before-quit', () => {
  quitting = true
  scanWorker?.terminate()
})

// Streaming scan — delegates all work to the scanner worker
ipcMain.on('library:scan', (event, dirPaths: string[]) => {
  const t0     = Date.now()
  const worker = getScanWorker()

  log.info(`⟲ library:scan — ${dirPaths.length} path(s): ${dirPaths.join(', ')}`)

  // eslint-disable-next-line functional/no-let
  let batchCount = 0
  // eslint-disable-next-line functional/no-let
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
      if (msg.type === 'error') {
        log.warn(`⨂ scan error from worker: ${msg.message}`)
      }
      else {
        log.info(`✓ library:scan done — ${totalSent} tracks in ${batchCount} batches · ◴ ${Date.now() - t0}ms`)
      }
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
  if (win?.isMaximized()) {
    win.unmaximize()
  }
  else {
    win?.maximize()
  }
})

ipcMain.on('window:close', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

ipcMain.handle('window:is-maximized', () =>
  BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)

// ─── Context menu handlers ────────────────────────────────────────────────────

ipcMain.on('contextmenu:show', (_event, payload: {
  items:  SerializableMenuItem[]
  x:      number
  y:      number
  width:  number
  height: number
}) => {
  if (!popoverWindow)
    return
  popoverWindow.setBounds({
    x:      Math.round(payload.x),
    y:      Math.round(payload.y),
    width:  payload.width,
    height: payload.height,
  })
  popoverWindow.webContents.send('contextmenu:items', payload.items)
  popoverWindow.show()
  popoverWindow.focus()
})

ipcMain.on('contextmenu:hide', () =>
  popoverWindow?.hide())

ipcMain.on('contextmenu:action', (_event, { index }: { index: number }) => {
  mainWindow?.webContents.send('contextmenu:action', { index })
  popoverWindow?.hide()
})

// ─── Media state handler ──────────────────────────────────────────────────────

ipcMain.on('media:state-update', (_event, state: MediaState) =>
  mediaControls.updateState(state))

// ─── DB Writer worker ───────────────────────────────────────────────────────

type WriterMessage =
  { type: 'ready' } |
  { type: 'done' } |
  { type: 'error'; message: string }

// eslint-disable-next-line functional/no-let
let dbWriter: Worker | null = null

function getDbWriter (): Worker {
  if (dbWriter)
    return dbWriter

  const dbPath = path.join(app.getPath('appData'), 'library.db')
  dbWriter = new Worker(
    path.join(__dirname, 'db-writer.js'),
    { workerData: { dbPath }}
  )
  dbWriter.on('error', err =>
    console.error('[db-writer]', err))
  dbWriter.on('exit', code => {
    if (code !== 0 && !quitting)
      console.error('[db-writer] exited with code', code)
    dbWriter = null
  })
  return dbWriter
}

app.on('before-quit', () => {
  quitting = true
  dbWriter?.terminate()
})

// ─── Model write handlers ───────────────────────────────────────────────────

ipcMain.handle('models:upsert', (_event, kind: string, payload: Record<string, unknown>) => {
  const worker = getDbWriter()
  return new Promise<void>((resolve, reject) => {
    const handler = (msg: WorkerMessage) => {
      worker.off('message', handler)
      if (msg.type === 'error')
        reject(new Error(msg.message))
      else
        resolve()
    }
    worker.on('message', handler)
    worker.postMessage({ type: 'upsert', kind, payload })
  })
})

ipcMain.handle('models:delete', (_event, kind: string, id: string) => {
  const worker = getDbWriter()
  return new Promise<void>((resolve, reject) => {
    const handler = (msg: WorkerMessage) => {
      worker.off('message', handler)
      if (msg.type === 'error')
        reject(new Error(msg.message))
      else
        resolve()
    }
    worker.on('message', handler)
    worker.postMessage({ type: 'delete', kind, id })
  })
})
