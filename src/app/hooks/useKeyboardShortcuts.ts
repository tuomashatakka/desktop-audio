import { useEffect, useCallback } from 'react'
import { useAudio, useLibrary, useUI } from '../contexts'
import { useHost } from '../data'


export function useKeyboardShortcuts () {
  const { isPlaying, currentTrack, volume, pause, resume, setVolume, playNext, playPrevious } = useAudio()
  const { filteredTracks } = useLibrary()
  const { currentView, setView, playerExpanded, togglePlayerExpanded } = useUI()
  const host = useHost()

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
      case 'Escape':
        if (playerExpanded)
          togglePlayerExpanded()
        else if (currentView === 'player')
          setView('library')
        e.preventDefault()
        break
      case 'AltLeft':
      case 'AltRight':
        // Focus first title-bar button — do NOT preventDefault (breaks OS Alt combos)
        document.querySelector<HTMLElement>('.titlebar-controls button')?.focus()
        break
    }
  }, [ currentTrack, isPlaying, pause, resume, playNext, playPrevious, filteredTracks, setVolume, volume, playerExpanded, togglePlayerExpanded, currentView, setView ])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () =>
      window.removeEventListener('keydown', handleKeyDown)
  }, [ handleKeyDown ])

  // ─── Media key IPC subscriptions ──────────────────────────────────────────

  useEffect(() => {
    const unsub1 = host.onMediaPlayPause(() => {
      if (currentTrack)
        void (isPlaying ? pause() : resume())
    })
    const unsub2 = host.onMediaNext(() =>
      playNext(filteredTracks))
    const unsub3 = host.onMediaPrev(() =>
      playPrevious(filteredTracks))
    return () => {
      unsub1(); unsub2(); unsub3()
    }
  }, [ currentTrack, isPlaying, pause, resume, playNext, playPrevious, filteredTracks, host ])
}
