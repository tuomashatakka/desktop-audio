import { Popover } from '../atomic/Popover'


export interface ContextMenuItem {
  readonly label?:     string
  readonly icon?:      string
  readonly action?:    () => void
  readonly danger?:    boolean
  readonly separator?: boolean
}

interface ContextMenuProps {
  readonly items:      readonly ContextMenuItem[]
  readonly anchorRect: DOMRect | null
  readonly onClose:    () => void
}

export function ContextMenu ({ items, anchorRect, onClose }: ContextMenuProps) {
  return (
    <Popover open={anchorRect !== null} anchorRect={anchorRect} onClose={onClose}>
      <ul className='context-menu-list' role='menu'>
        {items.map((item, i) =>
          item.separator
            ? <li key={i} className='context-menu-separator' role='separator' />
            : <li key={i} role='none'>
              <button
                role='menuitem'
                className={`context-menu-item ${item.danger ? 'danger' : ''}`}
                onClick={() => {
                  item.action?.(); onClose()
                }}
              >
                {item.icon && <span className='context-menu-icon' aria-hidden='true'>{item.icon}</span>}
                {item.label}
              </button>
            </li>
        )}
      </ul>
    </Popover>
  )
}
