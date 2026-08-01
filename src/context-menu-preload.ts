import { contextBridge, ipcRenderer } from 'electron'
import type { SerializableMenuItem } from './app/services/types'


contextBridge.exposeInMainWorld('contextMenuAPI', {
  onContextMenuItems: (cb: (items: SerializableMenuItem[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, items: SerializableMenuItem[]) =>
      cb(items)
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
