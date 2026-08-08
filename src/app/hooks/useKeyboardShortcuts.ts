import { useEffect, useCallback, useMemo } from 'react'
import { actionForEvent } from '../../keybindings'
import type { KeybindingAction } from '../../keybindings'
import { useAudio, useLibrary, useUI } from '../contexts'
import { useHost } from '../data'
import { useKeybindings } from './useKeybindings'
import { listen, collectUnsubscribes } from '../utils/events'


const EDITABLE_TARGETS = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ')

const GLOBAL_EDITABLE_ACTIONS = new Set<KeybindingAction>([
  'open-settings',
  'open-library',
  'open-player',
  'toggle-sidebar',
])

function isEditableTarget (target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_TARGETS) !== null
}

function isNativeActivationTarget (target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest('button, a[href], summary') !== null
}

function shouldIgnoreEvent (
  event: KeyboardEvent,
  action: KeybindingAction | null
): boolean {
  return event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    isEditableTarget(event.target) &&
      (!action || !GLOBAL_EDITABLE_ACTIONS.has(action))
}

export function useKeyboardShortcuts () {
  const { isPlaying, currentTrack, volume, pause, resume, setVolume, playNext, playPrevious } = useAudio()
  const { filteredTracks }                                                                    = useLibrary()
  const { currentView, previousView, sidebarOpen, setView, toggleSidebar }                    = useUI()
  const { bindings }                                                                          = useKeybindings()
  const host                                                                                  = useHost()

  const actions = useMemo<Record<KeybindingAction, () => void>>(() =>
    ({
      'next-track': () =>
        playNext(filteredTracks),
      'previous-track': () =>
        playPrevious(filteredTracks),
      'play-pause': () => {
        if (currentTrack)
          void (isPlaying ? pause() : resume())
      },
      'volume-up': () =>
        setVolume(Math.min(1, volume + 0.1)),
      'volume-down': () =>
        setVolume(Math.max(0, volume - 0.1)),
      'open-settings': () =>
        setView('settings'),
      'open-library': () =>
        setView('library'),
      'open-player': () =>
        setView('player'),
      'toggle-sidebar': () => {
        if (currentView === 'player') {
          setView('library')
          if (!sidebarOpen)
            toggleSidebar()
        }
        else
          toggleSidebar()
      },
    }), [
    currentTrack,
    currentView,
    filteredTracks,
    isPlaying,
    pause,
    playNext,
    playPrevious,
    resume,
    setView,
    setVolume,
    sidebarOpen,
    toggleSidebar,
    volume,
  ])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const action = actionForEvent(bindings, event)
    if (shouldIgnoreEvent(event, action))
      return

    if (event.key === 'Escape') {
      if (currentView === 'player') {
        event.preventDefault()
        setView(previousView ?? 'library')
      }
      return
    }

    if (event.key === 'Alt') {
      document.querySelector<HTMLElement>('.titlebar-controls button')?.focus()
      return
    }

    if (!action || action === 'play-pause' && isNativeActivationTarget(event.target))
      return

    event.preventDefault()
    actions[action]()
  }, [ actions, bindings, currentView, previousView, setView ])

  useEffect(() => {
    const keydown = listen(window, 'keydown', handleKeyDown as EventListener)
    return () =>
      keydown.dispose()
  }, [ handleKeyDown ])

  useEffect(() => {
    const mediaKeys = collectUnsubscribes(
      host.onMediaPlayPause(() => {
        if (currentTrack)
          void (isPlaying ? pause() : resume())
      }),
      host.onMediaNext(() =>
        playNext(filteredTracks)),
      host.onMediaPrev(() =>
        playPrevious(filteredTracks)),
    )

    return () =>
      mediaKeys.dispose()
  }, [ currentTrack, isPlaying, pause, resume, playNext, playPrevious, filteredTracks, host ])
}
