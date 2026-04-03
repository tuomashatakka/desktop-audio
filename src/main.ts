import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import started from 'electron-squirrel-startup'
import * as mm from 'music-metadata'


if (started) {
  app.quit()
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width:           1200,
    height:          800,
    minWidth:        800,
    minHeight:       600,
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: [ 'openDirectory' ],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

ipcMain.handle('get-music-library-path', () =>
  app.getPath('music'))

ipcMain.handle('scan-directory', async (_event, dirPath: string) => {
  const files: string[] = []

  function walkDir (dir: string, acc: string[]) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walkDir(fullPath, acc)
        }
        else if (entry.isFile()) {
          acc.push(fullPath)
        }
      }
    }
    catch (error) {
      console.error('Error reading directory:', error)
    }
  }

  const acc: string[] = []
  walkDir(dirPath, acc)
  return acc as readonly string[]
})

ipcMain.handle('get-audio-metadata', async (_event, filePath: string) => {
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

// ─── scan-library helpers ────────────────────────────────────────────────────

const AUDIO_EXTENSIONS_SET = new Set([
  '.mp3', '.m4a', '.flac', '.wav', '.ogg',
  '.aac', '.opus', '.webm', '.wma', '.aiff', '.aif',
])

// Option B: narrow hue range 280–360 (violet → hot pink), cohesive with accent hsl(337,100%,50%)
// djb2 hash via reduce — no mutation needed
const generateCoverColor = (title: string): string => {
  const hash = Array.from(title).reduce((h, ch) =>
    Math.imul(h, 31) + ch.charCodeAt(0) | 0, 0)
  const hue = 280 + Math.abs(hash) % 80
  return `hsl(${hue}, 65%, 38%)`
}

const extractYear = (noExt: string): number | undefined => {
  const m = noExt.match(/\b(19\d{2}|20\d{2})\b/) ?? noExt.match(/[\[(](19\d{2}|20\d{2})[\])]/)
  if (!m) {
    return undefined
  }

  const y = Number.parseInt(m[1] ?? m[0], 10)
  return Number.isNaN(y) ? undefined : y
}

const extractTrackNumber = (noExt: string): number | undefined => {
  const m = noExt.match(/^(\d{1,3})[.\s-]/)
  if (!m) {
    return undefined
  }

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
  if (!picture) {
    return undefined
  }
  return `data:${picture.format};base64,${Buffer.from(picture.data).toString('base64')}`
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
  coverColor:   string
  albumArt?:    string
  year?:        number
  genre?:       string
  trackNumber?: number
}

type OptionalFields = Pick<ScannedTrack, 'albumArt' | 'year' | 'genre' | 'trackNumber'>

const extractOptionalFields = (
  meta: mm.IAudioMetadata,
  yearFallback:        number | undefined,
  trackNumberFallback: number | undefined
): Partial<OptionalFields> => {
  const albumArt     = encodeAlbumArt(meta.common.picture?.[0])
  const resolvedYear = meta.common.year ?? yearFallback
  const resolvedTn   = meta.common.track?.no ?? trackNumberFallback
  const genre        = meta.common.genre?.[0]
  return {
    ...albumArt === undefined ? {} : { albumArt },
    ...resolvedYear === undefined ? {} : { year: resolvedYear },
    ...genre === undefined ? {} : { genre },
    ...resolvedTn === undefined ? {} : { trackNumber: resolvedTn },
  }
}

const processAudioFile = async (fullPath: string, fileSize: number): Promise<ScannedTrack> => {
  const ext = path.extname(fullPath).toLowerCase()
  const noExt = path.basename(fullPath, ext)
  const parentDir = path.basename(path.dirname(fullPath))
  const fallback = parseTitleArtist(noExt)
  const album = parentDir !== '.' && parentDir !== '/' ? parentDir : 'Unknown Album'
  const year = extractYear(noExt)
  const trackNumber = extractTrackNumber(noExt)
  const format = ext.replace('.', '').toUpperCase()

  try {
    const meta = await mm.parseFile(fullPath, { duration: true })
    const resolvedTitle = meta.common.title || fallback.title
    return {
      id:         fullPath,
      path:       fullPath,
      title:      resolvedTitle,
      artist:     meta.common.artist || fallback.artist,
      album:      meta.common.album || album,
      duration:   Math.round(meta.format.duration ?? 0),
      format,
      size:       fileSize,
      coverColor: generateCoverColor(resolvedTitle),
      ...extractOptionalFields(meta, year, trackNumber),
    }
  }
  catch {
    return {
      id:         fullPath,
      path:       fullPath,
      title:      fallback.title,
      artist:     fallback.artist,
      album,
      duration:   0,
      format,
      size:       fileSize,
      coverColor: generateCoverColor(fallback.title),
      ...year === undefined ? {} : { year },
      ...trackNumber === undefined ? {} : { trackNumber },
    }
  }
}

ipcMain.handle('scan-library', async (_event, dirPath: string) => {
  const tracks: ScannedTrack[] = []
  const seen = new Set<string>()

  const walk = async (dir: string): Promise<void> => {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      await Promise.all(
        entries.map(async entry => {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(fullPath)
            return
          }
          if (
            entry.isFile() &&
            AUDIO_EXTENSIONS_SET.has(path.extname(entry.name).toLowerCase()) &&
            !seen.has(fullPath)
          ) {
            seen.add(fullPath)
            try {
              const stats = await stat(fullPath)
              const track = await processAudioFile(fullPath, stats.size)
              tracks.push(track)
            }
            catch {
              // skip unreadable files
            }
          }
        })
      )
    }
    catch {
      // skip inaccessible directories
    }
  }

  await walk(dirPath)
  tracks.sort((a, b) =>
    a.title.localeCompare(b.title))
  return tracks
})

// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('read-file', async (_event, filePath: string) => {
  const buffer = fs.readFileSync(filePath)
  return buffer
})

ipcMain.on('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize()
})

ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win?.isMaximized()) {
    win.unmaximize()
  }
  else {
    win?.maximize()
  }
})

ipcMain.on('window-close', () => {
  BrowserWindow.getFocusedWindow()?.close()
})

ipcMain.handle('window-is-maximized', () =>
  BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)
