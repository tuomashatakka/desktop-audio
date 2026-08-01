import { Popover } from '../atomic/Popover'


/**
 * The presentational half of a context menu: label, icon, danger tint or a
 * separator. Deliberately carries no action — {@link MenuList} reports the
 * index it was given and lets the caller decide what that means. The two
 * callers need different things from it: the in-renderer menu invokes a
 * function, the separate menu window posts the index over IPC.
 */
export interface MenuEntry {
  readonly label?:     string
  readonly icon?:      string
  readonly danger?:    boolean
  readonly separator?: boolean
}

/** In-renderer context menu item — a {@link MenuEntry} that carries its action. */
export interface ContextMenuItem extends MenuEntry {
  readonly action?: () => void
}

interface MenuListProps {
  readonly items:    readonly MenuEntry[]
  readonly onSelect: (index: number) => void
}

/**
 * The `menu` role list itself, without any positioning opinion. Shared by the
 * anchored {@link ContextMenu} and by the standalone context-menu window.
 */
export function MenuList ({ items, onSelect }: MenuListProps) {
  return (
    <ul className='context-menu-list' role='menu'>
      {items.map((item, i) =>
        item.separator
          ? <li key={i} className='context-menu-separator' role='separator' />
          : <li key={i} role='none'>
            <button
              type='button'
              role='menuitem'
              className={`context-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() =>
                onSelect(i)}
            >
              {item.icon && <span className='context-menu-icon' aria-hidden='true'>{item.icon}</span>}
              {item.label}
            </button>
          </li>
      )}
    </ul>
  )
}

interface ContextMenuProps {
  readonly items:      readonly ContextMenuItem[]
  readonly anchorRect: DOMRect | null
  readonly onClose:    () => void
}

/** Context menu anchored to a rect within the main renderer. */
export function ContextMenu ({ items, anchorRect, onClose }: ContextMenuProps) {
  return (
    <Popover open={anchorRect !== null} anchorRect={anchorRect} onClose={onClose}>
      <MenuList
        items={items}
        onSelect={i => {
          items[i]?.action?.(); onClose()
        }}
      />
    </Popover>
  )
}
