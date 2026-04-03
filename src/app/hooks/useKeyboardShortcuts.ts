import { useEffect, useCallback } from 'react'
import { useAudio, useLibrary } from '../contexts'


export function useKeyboardShortcuts () {
  const { isPlaying, currentTrack, volume, pause, resume, setVolume, playNext, playPrevious } = useAudio()
  const { filteredTracks } = useLibrary()

  // eslint-disable-next-line complexity
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault()
        if (currentTrack) {
          void (isPlaying ? pause() : resume())
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
}
