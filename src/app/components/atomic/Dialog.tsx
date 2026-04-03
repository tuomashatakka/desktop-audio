import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'


interface DialogProps {
  readonly open:     boolean
  readonly onClose:  () => void
  readonly title:    string
  readonly children: ReactNode
}

export function Dialog ({ open, onClose, title, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open)
      return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')
        onClose()
    }
    document.addEventListener('keydown', handler)
    return () =>
      document.removeEventListener('keydown', handler)
  }, [ open, onClose ])

  useEffect(() => {
    if (!open || !panelRef.current)
      return

    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus()
  }, [ open ])

  if (!open)
    return null

  return createPortal(
    <div className='dialog-backdrop' onClick={onClose} aria-hidden='true'>
      <div
        ref={panelRef}
        className='dialog-panel'
        role='dialog'
        aria-modal='true'
        aria-labelledby='dialog-title'
        onClick={e =>
          e.stopPropagation()}
      >
        <div className='dialog-header'>
          <h3 id='dialog-title'>{title}</h3>
          <IconButton label='Close dialog' onClick={onClose}>✕</IconButton>
        </div>

        <div className='dialog-body'>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
