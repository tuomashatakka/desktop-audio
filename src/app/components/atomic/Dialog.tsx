import { useEffect, useId, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog)
      return

    if (open && !dialog.open)
      dialog.showModal()
    else if (!open && dialog.open)
      dialog.close()
  }, [ open ])

  return createPortal(
    <dialog
      ref={dialogRef}
      className='dialog-panel'
      aria-labelledby={titleId}
      closedby='any'
      onClose={() => {
        if (open)
          onClose()
      }}
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
