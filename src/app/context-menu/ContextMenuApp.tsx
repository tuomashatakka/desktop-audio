import { useState, useEffect } from 'react'
import { MenuList } from '../components/composite/ContextMenu'
import type { SerializableMenuItem } from '../services/types'


interface ContextMenuAPI {
  onContextMenuItems:    (cb: (items: SerializableMenuItem[]) => void) => () => void
  sendContextMenuAction: (index: number) => void
  closeContextMenu:      () => void
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
    return api.onContextMenuItems(received =>
      setItems(received))
  }, [])

  const handleAction = (index: number) => {
    window.contextMenuAPI?.sendContextMenuAction(index)
    window.contextMenuAPI?.closeContextMenu()
  }

  const handleClose = () =>
    window.contextMenuAPI?.closeContextMenu()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () =>
      document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className='context-menu-window'>
      <MenuList items={items} onSelect={handleAction} />

      {/* Dismiss surface, painted behind the list. Last in the DOM so the menu
          items come first in tab order; CSS stacks it underneath. */}
      <button
        type='button'
        className='context-menu-dismiss'
        aria-label='Close menu'
        onClick={handleClose}
      />
    </div>
  )
}
