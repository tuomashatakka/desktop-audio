import { useEffect, useState } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useUI, useAudio, useSettings } from './contexts'
import { LibraryView } from './views/LibraryView'
import { PlayerView } from './views/PlayerView'
import { SettingsView } from './views/SettingsView'
import { TagEditorView } from './views/TagEditorView'
import { PlayerBar } from './components/composite/PlayerBar'
import { useKeyboardShortcuts } from './hooks'
import bridge from './services/contextBridge'


function AppContent () {
  const { currentView, setView, playerExpanded, togglePlayerExpanded } = useUI()
  const { currentTrack } = useAudio()
  const { theme } = useSettings()
  const [ isAnimating, setIsAnimating ] = useState(false)
  const [ showExpanded, setShowExpanded ] = useState(false)

  // All hooks must be called unconditionally before any early return
  useKeyboardShortcuts()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [ theme ])

  useEffect(() => {
    if (playerExpanded && !showExpanded) {
      setIsAnimating(true)
      setShowExpanded(true)
      setTimeout(() =>
        setIsAnimating(false), 300)
    }
    else if (!playerExpanded && showExpanded) {
      setIsAnimating(true)
      setTimeout(() => {
        setShowExpanded(false)
        setIsAnimating(false)
      }, 200)
    }
  }, [ playerExpanded, showExpanded ])

  const renderView = () => {
    switch (currentView) {
      case 'library':
        return <LibraryView />
      case 'player':
        return <PlayerView />
      case 'settings':
        return <SettingsView />
      case 'tag-editor':
        return <TagEditorView />
      default:
        return <LibraryView />
    }
  }

  return (
    <div className='app-layout'>
      <header className='titlebar'>
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
        </div>

        <div className='titlebar-controls'>
          <button
            className='titlebar-btn'
            onClick={() =>
              bridge?.minimizeWindow()}
            aria-label='Minimize'
          >
            ─
          </button>

          <button
            className='titlebar-btn'
            onClick={() =>
              bridge?.maximizeWindow()}
            aria-label='Maximize'
          >
            □
          </button>

          <button
            className='titlebar-btn titlebar-btn-close'
            onClick={() =>
              bridge?.closeWindow()}
            aria-label='Close'
          >
            ✕
          </button>
        </div>
      </header>

      <main className='main-content'>
        <div className='view-content'>
          {renderView()}
        </div>

        {currentTrack &&
          <>
            <PlayerBar />

            <div
              className={`expanded-player ${showExpanded ? 'expanded-player-visible' : ''} ${isAnimating ? 'animating' : ''}`}
            >
              <div className='expanded-player-backdrop' onClick={togglePlayerExpanded} />

              <div className='expanded-player-content'>
                <button
                  className='expanded-player-close'
                  onClick={togglePlayerExpanded}
                  aria-label='Close player'
                >
                  ✕
                </button>

                <PlayerView />
              </div>
            </div>
          </>
        }
      </main>
    </div>
  )
}

export function App () {
  return (
    <UIProvider>
      <SettingsProvider>
        <LibraryProvider>
          <AudioProvider>
            <AppContent />
          </AudioProvider>
        </LibraryProvider>
      </SettingsProvider>
    </UIProvider>
  )
}
