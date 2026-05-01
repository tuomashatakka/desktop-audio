import { useUI, useAudio } from '../contexts'
import { PlayerView } from '../views/PlayerView'
import { useEffect, useState } from 'react'


export function ExpandedPlayerPortal () {
  const { playerExpanded, togglePlayerExpanded } = useUI()
  const { currentTrack } = useAudio()
  const [ isAnimating, setIsAnimating ] = useState(false)
  const [ showExpanded, setShowExpanded ] = useState(false)

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

  if (!currentTrack)
    return null

  return (
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
  )
}
