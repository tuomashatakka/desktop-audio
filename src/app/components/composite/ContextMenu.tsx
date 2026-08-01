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
