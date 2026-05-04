import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'


interface PopoverProps {
  readonly open:       boolean
  readonly anchorRect: DOMRect | null
  readonly onClose:    () => void
  readonly children:   ReactNode
  readonly placement?: 'top' | 'bottom'
}

export function Popover ({ open, anchorRect, onClose, children, placement = 'bottom' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open)
      return

    const onMouse = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose()
    }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [ open, onClose ])

  if (!open || !anchorRect)
    return null

  const top  = placement === 'bottom' ? anchorRect.bottom + 4 : anchorRect.top - 4
  // Anchor to the right side of the button, subtract popup width to keep it on screen
  const left = Math.max(0, anchorRect.right - 200) // 200px is approximate popup width

  return createPortal(
    <div
      ref={panelRef}
      className={`popover-panel placement-${placement}`}
      style={{ top, left }}
    >
      {children}
    </div>,
    document.body
  )
}
