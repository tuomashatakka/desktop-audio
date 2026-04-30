import { contextBridge, ipcRenderer } from 'electron'
import type { SerializableMenuItem, MediaState } from './app/services/types'


contextBridge.exposeInMainWorld('electronAPI', {
  // Library
  scanLibrary: (dirPaths: string[]) =>
    ipcRenderer.send('library:scan', dirPaths),
  loadLibrary: () =>
    ipcRenderer.invoke('library:load'),
  onLibraryBatch: (cb: (tracks: unknown[]) => void) => {
    const handler = (_: unknown, tracks: unknown[]) =>
      cb(tracks)
    ipcRenderer.on('library:batch', handler)
    return () =>
      ipcRenderer.removeListener('library:batch', handler)
  },
  onLibraryDone: (cb: () => void) => {
    const handler = () =>
      cb()
    ipcRenderer.on('library:done', handler)
    return () =>
      ipcRenderer.removeListener('library:done', handler)
  },

  // Files
  selectDirectory: () =>
    ipcRenderer.invoke('file:select'),
  getMusicDir: () =>
    ipcRenderer.invoke('file:music-dir'),
  readFile: (path: string) =>
    ipcRenderer.invoke('file:read', path),
  getAudioMetadata: (path: string) =>
    ipcRenderer.invoke('file:metadata', path),

  // Window
  minimizeWindow: () =>
    ipcRenderer.send('window:minimize'),
  maximizeWindow: () =>
    ipcRenderer.send('window:maximize'),
  closeWindow: () =>
    ipcRenderer.send('window:close'),
  isMaximized: () =>
    ipcRenderer.invoke('window:is-maximized'),
  onMediaPlayPause: (cb: () => void) => {
    const h = () =>
      cb()
    ipcRenderer.on('media:play-pause', h)
    return () =>
      ipcRenderer.removeListener('media:play-pause', h)
  },
  onMediaNext: (cb: () => void) => {
    const h = () =>
      cb()
    ipcRenderer.on('media:next', h)
    return () =>
      ipcRenderer.removeListener('media:next', h)
  },
  onMediaPrev: (cb: () => void) => {
    const h = () =>
      cb()
    ipcRenderer.on('media:prev', h)
    return () =>
      ipcRenderer.removeListener('media:prev', h)
  },

  // Context menu
  showContextMenu: (items: SerializableMenuItem[], x: number, y: number, width: number, height: number) =>
    ipcRenderer.send('contextmenu:show', { items, x, y, width, height }),
  hideContextMenu: () =>
    ipcRenderer.send('contextmenu:hide'),
  onContextMenuAction: (cb: (index: number) => void) => {
    const h = (_: unknown, { index }: { index: number }) =>
      cb(index)
    ipcRenderer.on('contextmenu:action', h)
    return () =>
      ipcRenderer.removeListener('contextmenu:action', h)
  },

  // Media state
  updateMediaState: (state: MediaState) =>
    ipcRenderer.send('media:state-update', state),
  onMediaSeek: (cb: (delta: number) => void) => {
    const h = (_: unknown, delta: number) =>
      cb(delta)
    ipcRenderer.on('media:seek', h)
    return () =>
      ipcRenderer.removeListener('media:seek', h)
  },
})
