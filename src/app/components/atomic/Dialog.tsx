import { useEffect, useId, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'


interface DialogProps {
  readonly open:     boolean
  readonly onClose:  () => void
  readonly title:    string
  readonly children: ReactNode
}

const supportsModalDialog = typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal === 'function'

export function Dialog ({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !supportsModalDialog)
      return

    if (open && !dialog.open)
      dialog.showModal()
    else if (!open && dialog.open)
      dialog.close()
  }, [ open ])

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    const dialog = event.currentTarget
    const bounds = dialog.getBoundingClientRect()
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom
    if (!inside)
      onClose()
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className='dialog-panel'
      aria-labelledby={titleId}
      open={!supportsModalDialog && open}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
    >
      <header className='dialog-header'>
        <h2 id={titleId}>{title}</h2>

        <IconButton type='button' label='Close dialog' onClick={onClose}>
          <span aria-hidden='true'>✕</span>
        </IconButton>
      </header>

      <div className='dialog-body'>{children}</div>
    </dialog>,
    document.body
  )
}
