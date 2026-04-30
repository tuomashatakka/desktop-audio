import { useState, useEffect } from 'react'
import type { SerializableMenuItem } from '../services/types'


interface ContextMenuAPI {
  onContextMenuItems: (cb: (items: SerializableMenuItem[]) => void) => () => void
  sendContextMenuAction: (index: number) => void
  closeContextMenu: () => void
}

declare global {
  interface Window {
    contextMenuAPI: ContextMenuAPI
  }
}

export function ContextMenuApp () {
  const [ items, setItems ] = useState<SerializableMenuItem[]>([])

  useEffect(() => {
    const api = window.contextMenuAPI
    if (!api)
      return
    return api.onContextMenuItems(received => setItems(received))
  }, [])

  const handleAction = (index: number) => {
    window.contextMenuAPI?.sendContextMenuAction(index)
    window.contextMenuAPI?.closeContextMenu()
  }

  const handleClose = () =>
    window.contextMenuAPI?.closeContextMenu()

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 0 }}
        onClick={handleClose}
      />
      <ul className='context-menu-list' role='menu' style={{ position: 'relative', zIndex: 1 }}>
        {items.map((item, i) =>
          item.separator
            ? <li key={i} className='context-menu-separator' role='separator' />
            : <li key={i} role='none'>
              <button
                role='menuitem'
                className={`context-menu-item ${item.danger ? 'danger' : ''}`}
                onClick={() => handleAction(i)}
              >
                {item.icon && <span className='context-menu-icon' aria-hidden='true'>{item.icon}</span>}
                {item.label}
              </button>
            </li>
        )}
      </ul>
    </>
  )
}
