import { useState, useEffect } from 'react'
import { MenuList } from '../components/composite/ContextMenu'
import type { SerializableMenuItem, ContextMenuPayload } from '../services/types'
import { listen } from '../utils/events'


interface ContextMenuAPI {
  onContextMenuItems:    (cb: (payload: ContextMenuPayload) => void) => () => void
  sendContextMenuAction: (index: number) => void
  closeContextMenu:      () => void
}

declare global {
  interface Window {
    contextMenuAPI: ContextMenuAPI
  }
}

export function ContextMenuApp () {
  const [ items, setItems ] = useState<readonly SerializableMenuItem[]>([])

  useEffect(() => {
    const api = window.contextMenuAPI
    if (!api)
      return

    return api.onContextMenuItems(payload => {
      setItems(payload.items)

      // Theme is pushed onto this window's own root, since it shares no DOM
      // with the app. Doing it here rather than in render keeps the paint in
      // step with the items — the window is shown as soon as they arrive.
      const root         = document.documentElement
      root.dataset.theme = payload.theme
      if (payload.accent)
        root.style.setProperty('--accent', payload.accent)
      else
        root.style.removeProperty('--accent')
    })
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
    const keydown = listen(document, 'keydown', onKeyDown as EventListener)
    return () =>
      keydown.dispose()
  }, [])

  return <div className='context-menu-window'>
    <MenuList items={ items } onSelect={ handleAction } />

    {/* Dismiss surface, painted behind the list. Last in the DOM so the menu
          items come first in tab order; CSS stacks it underneath. */}
    <button
      className='context-menu-dismiss'
      aria-label='Close menu'
      type='button'
      onClick={ handleClose } />
  </div>
}
