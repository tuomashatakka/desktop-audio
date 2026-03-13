import { useRef, useEffect, useState, useCallback } from 'react'
import { UIProvider, SettingsProvider, LibraryProvider, AudioProvider, useUI, useAudio, useLibrary } from './contexts'
import { LibraryView } from './views/LibraryView'
import { PlayerView } from './views/PlayerView'
import { SettingsView } from './views/SettingsView'
import { TagEditorView } from './views/TagEditorView'
import { IconButton } from './components/atomic'


function AppContent () {
  const { currentView, setView, playerExpanded, togglePlayerExpanded } = useUI()
  const { isPlaying, currentTrack, currentTime, duration, volume, play, pause, resume, seek, setVolume, playNext, playPrevious } = useAudio()
  const { filteredTracks } = useLibrary()

  const [ isAnimating, setIsAnimating ] = useState(false)
  const [ showExpanded, setShowExpanded ] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        if (currentTrack) {
          isPlaying ? pause() : resume()
        }
        break
      case 'ArrowRight':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          playNext(filteredTracks)
        }
        break
      case 'ArrowLeft':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          playPrevious(filteredTracks)
        }
        break
      case 'ArrowUp':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          setVolume(Math.min(1, volume + 0.1))
        }
        break
      case 'ArrowDown':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          setVolume(Math.max(0, volume - 0.1))
        }
        break
    }
  }, [ currentTrack, isPlaying, pause, resume, playNext, playPrevious, filteredTracks, setVolume, volume ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () =>
      window.removeEventListener('keydown', handleKeyDown)
  }, [ handleKeyDown ])

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
  }, [ playerExpanded ])

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

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds))
      return '0:00'

    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePlayerBarClick = () => {
    togglePlayerExpanded()
  }

  return (
    <div className='app-layout'>
      <header className='top-menu'>
        <div className='top-menu-logo'>
          <span className='logo-icon'>♫</span>
          <span className='logo-text'>Desktop Audio</span>
        </div>

        <nav className='top-menu-nav'>
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
            Now Playing
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
      </header>

      <main className='main-content'>
        <div className='view-content'>
          {renderView()}
        </div>

        {currentTrack &&
          <>
            <div
              className={`player-bar ${playerExpanded ? 'player-bar-hidden' : ''}`}
              onClick={handlePlayerBarClick}
              style={{ cursor: 'pointer' }}
            >
              <div className='player-bar-track'>
                <div style={{ width: 40, height: 40, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }} />

                <div className='player-bar-info'>
                  <div className='player-bar-title'>{currentTrack.title}</div>
                  <div className='player-bar-artist'>{currentTrack.artist}</div>
                </div>
              </div>

              <div className='player-bar-controls'
                onClick={e =>
                  e.stopPropagation()}>
                <IconButton label='Previous'
                  onClick={() =>
                    playPrevious(filteredTracks)}>
                  ⏮
                </IconButton>

                <IconButton
                  label={isPlaying ? 'Pause' : 'Play'}
                  onClick={isPlaying ? pause : resume}
                >
                  {isPlaying ? '⏸' : '▶'}
                </IconButton>

                <IconButton label='Next'
                  onClick={() =>
                    playNext(filteredTracks)}>
                  ⏭
                </IconButton>
              </div>

              <div className='player-bar-progress'
                onClick={e =>
                  e.stopPropagation()}>
                <span className='player-bar-time'>{formatTime(currentTime)}</span>

                <input
                  type='range'
                  data-slider
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={e =>
                    seek(Number(e.target.value))}
                  style={{ flex: 1 }}
                />

                <span className='player-bar-time'>{formatTime(duration)}</span>
              </div>

              <div className='player-bar-volume'
                onClick={e =>
                  e.stopPropagation()}>
                <IconButton label='Volume'
                  onClick={() =>
                    setVolume(volume > 0 ? 0 : 0.8)}>
                  {volume > 0 ? '🔊' : '🔇'}
                </IconButton>

                <input
                  type='range'
                  data-slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={e =>
                    setVolume(Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </div>
            </div>

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
                  ↓
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
