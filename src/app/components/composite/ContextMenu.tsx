import { Icon } from '../atomic/Icon'
import type { IconName } from '../../services/types'


/**
 * The presentational half of a context menu: label, icon, danger tint or a
 * separator. Deliberately carries no action — {@link MenuList} reports the
 * index it was given and lets the caller decide what that means. The two
 * callers need different things from it: the in-renderer menu invokes a
 * function, the separate menu window posts the index over IPC.
 */
export interface MenuEntry {
  readonly label?:     string
  readonly icon?:      IconName
  readonly danger?:    boolean
  readonly separator?: boolean
}

interface MenuListProps {
  readonly items:    readonly MenuEntry[]
  readonly onSelect: (index: number) => void
}

/**
 * A native action menu. Keeping ordinary buttons preserves the browser's
 * keyboard model instead of claiming the stricter ARIA menu pattern.
 */
export function MenuList ({ items, onSelect }: MenuListProps) {
  return (
    <menu className='context-menu-list'>
      {items.map((item, index) =>
        item.separator
          ? <li key={index} className='context-menu-separator' aria-hidden='true' />
          : <li key={index}>
            <button
              type='button'
              className={`context-menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() =>
                onSelect(index)}
            >
              {item.icon && <Icon className='context-menu-icon' name={item.icon} />}
              {item.label}
            </button>
          </li>
      )}
    </menu>
  )
}
