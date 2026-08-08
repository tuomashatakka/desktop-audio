import type { ReactNode } from 'react'
import { useUI } from '../contexts'
import type { ViewType } from '../contexts'
import { useBridge } from '../data'
import { Icon } from '../components/atomic'
import type { IconName } from '../services/types'


const NAV_ITEMS: readonly { view: ViewType; icon: IconName }[] = [
  { view: 'library', icon: 'library' },
  { view: 'player', icon: 'play' },
  { view: 'settings', icon: 'settings' },
]

const NAV_LABELS: Record<ViewType, string> = {
  'library':    'Library',
  'player':     'Player',
  'settings':   'Settings',
  'tag-editor': 'Tag Editor',
}

export function Titlebar ({ children }: { readonly children?: ReactNode }) {
  const { currentView, setView, sidebarOpen, toggleSidebar } = useUI()
  const bridge = useBridge()

  const handleSidebar = () => {
    if (currentView === 'player') {
      setView('library')
      if (!sidebarOpen)
        toggleSidebar()
      return
    }
    toggleSidebar()
  }

  return (
    <>
      <button
        type='button'
        className='menu-toggle'
        onClick={handleSidebar}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={sidebarOpen}
      >
        <Icon name='menu' />
      </button>

      <Icon className='logo-icon' name='waveform' />

      {/* Icon-only: the label is carried by `aria-label` and the `title`
          tooltip, so the tab strip costs the titlebar three glyphs of width
          instead of a third of it. */}
      <nav aria-label='Primary'>
        <ul className='titlebar-nav'>
          {NAV_ITEMS.map(({ view, icon }) =>
            <li key={view}>
              <button
                type='button'
                className='nav-item'
                aria-label={NAV_LABELS[view]}
                title={NAV_LABELS[view]}
                aria-current={currentView === view ? 'page' : undefined}
                onClick={() =>
                  setView(view)}
              >
                <Icon className='nav-icon' name={icon} />
              </button>
            </li>
          )}
        </ul>
      </nav>

      {children && <div className='titlebar-context'>{children}</div>}

      <menu className='titlebar-controls' aria-label='Window controls'>
        <li>
          <button
            type='button'
            className='titlebar-btn'
            onClick={() =>
              bridge.minimizeWindow()}
            aria-label='Minimize'
          >
            <Icon name='minimize' />
          </button>
        </li>

        <li>
          <button
            type='button'
            className='titlebar-btn'
            onClick={() =>
              bridge.maximizeWindow()}
            aria-label='Maximize'
          >
            <Icon name='maximize' />
          </button>
        </li>

        <li>
          <button
            type='button'
            className='titlebar-btn titlebar-btn-close'
            onClick={() =>
              bridge.closeWindow()}
            aria-label='Close'
          >
            <Icon name='close' />
          </button>
        </li>
      </menu>
    </>
  )
}
