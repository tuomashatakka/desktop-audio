import { useUI } from '../contexts'
import { useBridge } from '../data'


export function Titlebar () {
  const { currentView, setView } = useUI()
  const bridge = useBridge()

  return (
    <>
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
              Library
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
              Player
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
              Settings
            </button>
          </li>
        </ul>
      </nav>

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
