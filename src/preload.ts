import { contextBridge, ipcRenderer } from 'electron'


contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () =>
    ipcRenderer.invoke('select-directory'),
  getMusicLibraryPath: () =>
    ipcRenderer.invoke('get-music-library-path'),
  scanDirectory: (path: string) =>
    ipcRenderer.invoke('scan-directory', path),
  getAudioMetadata: (path: string) =>
    ipcRenderer.invoke('get-audio-metadata', path),
  readFile: (path: string) =>
    ipcRenderer.invoke('read-file', path),
  minimizeWindow: () =>
    ipcRenderer.send('window-minimize'),
  maximizeWindow: () =>
    ipcRenderer.send('window-maximize'),
  closeWindow: () =>
    ipcRenderer.send('window-close'),
  isMaximized: () =>
    ipcRenderer.invoke('window-is-maximized'),
})
