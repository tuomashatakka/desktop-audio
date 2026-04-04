import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Worker } from 'node:worker_threads'
import started from 'electron-squirrel-startup'
import * as mm from 'music-metadata'


if (started) {
  app.quit()
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
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
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
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
    if (code !== 0)
      console.error('[scanner-worker] exited with code', code)
    scanWorker = null
  })
  return scanWorker
}

app.on('before-quit', () =>
  scanWorker?.terminate())

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
