import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'


export interface PopoverPoint {
  readonly x: number
  readonly y: number
}

interface PopoverProps {
  readonly open:       boolean
  readonly onClose:    () => void
  readonly children:   ReactNode
  readonly anchor?:    HTMLElement | null
  readonly point?:     PopoverPoint | null
  readonly id?:        string
  readonly placement?: 'top' | 'bottom'
}

export function Popover ({ open, anchor = null, point = null, onClose, children, id, placement = 'bottom' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const popoverId = id || generatedId
  const anchorName = `--popover-${generatedId.replace(/[^a-z0-9_-]/gi, '')}`

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel || !anchor)
      return

    anchor.style.setProperty('anchor-name', anchorName)
    panel.style.setProperty('position-anchor', anchorName)
    return () => {
      if (anchor.style.getPropertyValue('anchor-name') === anchorName)
        anchor.style.removeProperty('anchor-name')
    }
  }, [ anchor, anchorName ])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel)
      return

    const visible = panel.matches(':popover-open')
    if (open && (anchor || point) && !visible)
      panel.showPopover()
    else if ((!open || !(anchor || point)) && visible)
      panel.hidePopover()
  }, [ open, anchor, point ])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel)
      return

    const handleToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed')
        onClose()
    }
    panel.addEventListener('toggle', handleToggle)
    return () =>
      panel.removeEventListener('toggle', handleToggle)
  }, [ onClose ])

  return createPortal(
    <div
      ref={panelRef}
      id={popoverId}
      className={`popover-panel placement-${placement} ${point ? 'at-point' : ''}`.trim()}
      popover='auto'
      style={point ? { left: point.x, top: point.y } as CSSProperties : undefined}
    >
      {children}
    </div>,
    document.body
  )
}
