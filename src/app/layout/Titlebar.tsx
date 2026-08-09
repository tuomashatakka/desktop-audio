import type { ReactNode } from 'react'
import { useUI } from '../contexts'
import { useHost } from '../data'
import { Icon } from '../components/atomic'


type TitlebarProps = { readonly children?: ReactNode }

/**
 * Window chrome: sidebar toggle, wordmark, a context slot, window buttons.
 *
 * There is no view switcher any more. The library is the only view — Now
 * Playing, Settings and the Tag Editor are overlays over it — so the slot
 * carries just the library search, and Settings lives at the foot of the
 * sidebar where the rest of the library navigation is.
 */
export function Titlebar ({ children }: TitlebarProps) {
  const { sidebarOpen, toggleSidebar } = useUI()
  const host                           = useHost()

  return <>
    <button
      className='menu-toggle'
      aria-label={ sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar' }
      aria-expanded={ sidebarOpen }
      type='button'
      onClick={ toggleSidebar }>
      <Icon name='menu' />
    </button>

    <Icon className='logo-icon' name='waveform' />
    {children && <div className='titlebar-context'>{children}</div>}

    <menu className='titlebar-controls' aria-label='Window controls'>
      <li>
        <button
          className='titlebar-btn'
          aria-label='Minimize'
          type='button'
          onClick={ () =>
            host.minimizeWindow() }>
          <Icon name='minimize' />
        </button>
      </li>

      <li>
        <button
          className='titlebar-btn'
          aria-label='Maximize'
          type='button'
          onClick={ () =>
            host.maximizeWindow() }>
          <Icon name='maximize' />
        </button>
      </li>

      <li>
        <button
          className='titlebar-btn titlebar-btn-close'
          aria-label='Close'
          type='button'
          onClick={ () =>
            host.closeWindow() }>
          <Icon name='close' />
        </button>
      </li>
    </menu>
  </>
}
