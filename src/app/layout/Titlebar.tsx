import type { ReactNode } from 'react'
import { useUI } from '../contexts'
import { useBridge } from '../data'


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
        <span aria-hidden='true' />
        <span aria-hidden='true' />
        <span aria-hidden='true' />
      </button>

      <div className='titlebar-logo'>
        <span className='logo-icon' aria-hidden='true'>♫</span>
        <span className='logo-text'>Desktop Audio</span>
      </div>

      <nav aria-label='Primary'>
        <ul className='titlebar-nav'>
          <li>
            <button
              className='nav-item'
              aria-current={currentView === 'library' ? 'page' : undefined}
              onClick={() =>
                setView('library')}
            >
              <span className='nav-icon' aria-hidden='true'>♫</span>
              <span className='nav-label'>Library</span>
            </button>
          </li>

          <li>
            <button
              className='nav-item'
              aria-current={currentView === 'player' ? 'page' : undefined}
              onClick={() =>
                setView('player')}
            >
              <span className='nav-icon' aria-hidden='true'>▶</span>
              <span className='nav-label'>Player</span>
            </button>
          </li>

          <li>
            <button
              className='nav-item'
              aria-current={currentView === 'settings' ? 'page' : undefined}
              onClick={() =>
                setView('settings')}
            >
              <span className='nav-icon' aria-hidden='true'>⚙</span>
              <span className='nav-label'>Settings</span>
            </button>
          </li>
        </ul>
      </nav>

      {children && <div className='titlebar-context'>{children}</div>}

      <menu className='titlebar-controls' aria-label='Window controls'>
        <li>
          <button
            className='titlebar-btn'
            onClick={() =>
              bridge.minimizeWindow()}
            aria-label='Minimize'
          >
            <span aria-hidden='true'>─</span>
          </button>
        </li>

        <li>
          <button
            className='titlebar-btn'
            onClick={() =>
              bridge.maximizeWindow()}
            aria-label='Maximize'
          >
            <span aria-hidden='true'>□</span>
          </button>
        </li>

        <li>
          <button
            className='titlebar-btn titlebar-btn-close'
            onClick={() =>
              bridge.closeWindow()}
            aria-label='Close'
          >
            <span aria-hidden='true'>✕</span>
          </button>
        </li>
      </menu>
    </>
  )
}
