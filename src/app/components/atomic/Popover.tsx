import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'


interface PopoverProps {
  readonly open:       boolean
  readonly anchor:     HTMLElement | null
  readonly onClose:    () => void
  readonly children:   ReactNode
  readonly id?:        string
  readonly label?:     string
  readonly placement?: 'top' | 'bottom'
}

export function Popover ({ open, anchor, onClose, children, id, label, placement = 'bottom' }: PopoverProps) {
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
    if (!panel || typeof panel.showPopover !== 'function')
      return

    try {
      if (open && anchor)
        panel.showPopover()
      else
        panel.hidePopover()
    }
    catch {
      // The declarative hidden state remains a safe fallback.
    }
  }, [ open, anchor ])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel)
      return

    const handleToggle = (event: Event) => {
      if ((event as Event & { newState?: string }).newState === 'closed')
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
      className={`popover-panel placement-${placement}`}
      popover='auto'
      role='dialog'
      aria-label={label}
      hidden={!open || !anchor}
    >
      {children}
    </div>,
    document.body
  )
}
