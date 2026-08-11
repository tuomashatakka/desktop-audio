import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'
import { Icon } from './Icon'


/**
 * `panel` is a small centred card, `sheet` a large scrollable one, `full`
 * covers the window. Sizing hangs off `data-variant` in components.css.
 */
export type OverlayVariant = 'panel' | 'sheet' | 'full'

interface OverlayProps {
  readonly open:    boolean
  readonly onClose: () => void

  /** Accessible name. Omit only when the content supplies `aria-labelledby`. */
  readonly label?:       string
  readonly labelledBy?:  string
  readonly variant?:     OverlayVariant
  readonly closeButton?: boolean
  readonly className?:   string
  readonly children:     ReactNode
}

/**
 * The one modal surface in the app.
 *
 * A native `<dialog>` opened with `showModal()`, which is what buys the focus
 * trap, the inert background, `::backdrop` and Escape for free — none of which
 * is worth reimplementing. `closedby='any'` adds light dismiss, so a click on
 * the backdrop closes it too.
 *
 * It is portaled to `document.body` because a modal dialog is promoted to the
 * top layer anyway; leaving it nested would only mean its ancestors' `overflow`
 * and `transform` could clip or reposition something the browser is already
 * painting above the page.
 *
 * The exit animation is CSS (`transition-behavior: allow-discrete` on `display`
 * and `overlay`, see components.css), not a mount delay here — so `open` may
 * flip to `false` and the element still paints for one transition.
 */
export function Overlay ({
  open, onClose, label, labelledBy, variant = 'panel', closeButton = false, className = '', children,
}: OverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Calls `showModal()`/`close()` on the native `<dialog>`. The top layer, the focus trap and `::backdrop` exist only when the element method is called; the `open` attribute gives a non-modal dialog instead.
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
      ref={ dialogRef }
      className={ `overlay-dialog ${className}`.trim() }
      aria-label={ labelledBy ? undefined : label }
      aria-labelledby={ labelledBy }
      data-variant={ variant }
      closedby='any'
      onClose={ () => {
        if (open)
          onClose()
      } }>
      {closeButton &&
        <IconButton className='overlay-close' type='button' label='Close' onClick={ onClose }>
          <Icon name='close' />
        </IconButton>
      }

      {children}
    </dialog>,
    document.body
  )
}
