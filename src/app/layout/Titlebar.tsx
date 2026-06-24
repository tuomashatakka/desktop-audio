import { useUI } from '../contexts'
import { useBridge } from '../data'


export function Titlebar () {
  const { currentView, setView } = useUI()
  const bridge = useBridge()

  return (
    <div className='titlebar-drag'>
      <div className='titlebar-logo'>
        <span className='logo-icon'>♫</span>
        <span className='logo-text'>Desktop Audio</span>
      </div>

      <nav className='titlebar-nav'>
        <button
          className={`nav-item ${currentView === 'library' ? 'active' : ''}`}
          onClick={() =>
            setView('library')}
        >
          <span className='nav-icon'>♫</span>
          Library
        </button>

        <button
          className={`nav-item ${currentView === 'player' ? 'active' : ''}`}
          onClick={() =>
            setView('player')}
        >
          <span className='nav-icon'>▶</span>
          Player
        </button>

        <button
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() =>
            setView('settings')}
        >
          <span className='nav-icon'>⚙</span>
          Settings
        </button>
      </nav>

      <div className='titlebar-controls'>
        <button
          className='titlebar-btn'
          onClick={() =>
            bridge.minimizeWindow()}
          aria-label='Minimize'
        >
          ─
        </button>

        <button
          className='titlebar-btn'
          onClick={() =>
            bridge.maximizeWindow()}
          aria-label='Maximize'
        >
          □
        </button>

        <button
          className='titlebar-btn titlebar-btn-close'
          onClick={() =>
            bridge.closeWindow()}
          aria-label='Close'
        >
          ✕
        </button>
      </div>
    </div>
  )
}
