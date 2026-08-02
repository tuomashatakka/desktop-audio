import { contextBridge, ipcRenderer } from 'electron'
import type { ContextMenuPayload } from './app/services/types'


contextBridge.exposeInMainWorld('contextMenuAPI', {
  onContextMenuItems: (cb: (payload: ContextMenuPayload) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: ContextMenuPayload) =>
      cb(payload)
    ipcRenderer.on('contextmenu:items', handler)
    return () => {
      ipcRenderer.removeListener('contextmenu:items', handler)
    }
  },

  sendContextMenuAction: (index: number) =>
    ipcRenderer.send('contextmenu:action', { index }),

  closeContextMenu: () =>
    ipcRenderer.send('contextmenu:hide'),
})
