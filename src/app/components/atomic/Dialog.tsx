import { useId } from 'react'
import type { ReactNode } from 'react'
import { Overlay } from './Overlay'
import { IconButton } from './IconButton'
import { Icon } from './Icon'


interface DialogProps {
  readonly open:     boolean
  readonly onClose:  () => void
  readonly title:    string
  readonly children: ReactNode
}

/** A small titled card — {@link Overlay} plus a heading and a close button. */
export function Dialog ({ open, onClose, title, children }: DialogProps) {
  const titleId = useId()

  return <Overlay
    className='dialog-panel'
    open={ open }
    labelledBy={ titleId }
    variant='panel'
    onClose={ onClose }>
    <header className='dialog-header'>
      <h2 id={ titleId }>{title}</h2>

      <IconButton type='button' label='Close dialog' onClick={ onClose }>
        <Icon name='close' />
      </IconButton>
    </header>

    <div className='dialog-body'>{children}</div>
  </Overlay>
}
