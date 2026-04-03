import { contextBridge, ipcRenderer } from 'electron'


contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () =>
    ipcRenderer.invoke('select-directory'),
  getMusicLibraryPath: () =>
    ipcRenderer.invoke('get-music-library-path'),
  scanDirectory: (path: string) =>
    ipcRenderer.invoke('scan-directory', path),
  scanLibrary: (path: string) =>
    ipcRenderer.invoke('scan-library', path),
  scanLibraryStream: (
    dirPath: string,
    onBatch: (tracks: unknown[]) => void,
    onDone: () => void
  ) => {
    ipcRenderer.send('scan-library-stream', dirPath)

    const batchHandler = (_: unknown, batch: unknown[]) =>
      onBatch(batch)
    const doneHandler = () => {
      ipcRenderer.removeListener('scan-library-batch', batchHandler)
      ipcRenderer.removeListener('scan-library-done', doneHandler)
      onDone()
    }
    ipcRenderer.on('scan-library-batch', batchHandler)
    ipcRenderer.once('scan-library-done', doneHandler)
  },
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
