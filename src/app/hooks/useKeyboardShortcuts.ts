import { useEffect, useCallback, useMemo } from 'react'
import { actionForEvent } from '../../keybindings'
import type { KeybindingAction } from '../../keybindings'
import { useAudio, useUI } from '../contexts'
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

/**
 * The track the keyboard is on.
 *
 * Read off the DOM because focus is the only place that answer lives: the
 * table's selection index counts rows in *sorted* order, which nothing outside
 * the table can resolve back to a track. The titlebar focus below is reached
 * the same way, for the same reason.
 */
function focusedTrackId (): string | null {
  const row = document.activeElement?.closest('[data-track-id]')
  return row?.getAttribute('data-track-id') ?? null
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
  const { openOverlay, closeOverlay, toggleSidebar, setEditingTrack }                         = useUI()
  const { bindings }                                                                          = useKeybindings()
  const host                                                                                  = useHost()

  const actions = useMemo<Record<KeybindingAction, () => void>>(() =>
    ({
      'next-track':     playNext,
      'previous-track': playPrevious,
      'play-pause':     () => {
        if (currentTrack)
          void (isPlaying ? pause() : resume())
      },
      'volume-up': () =>
        setVolume(Math.min(1, volume + 0.1)),
      'volume-down': () =>
        setVolume(Math.max(0, volume - 0.1)),
      'open-settings': () =>
        openOverlay('settings'),
      // The library is always there; "go to it" means dismissing whatever is
      // covering it. Escape does the same thing via the dialog itself.
      'open-library': closeOverlay,
      'open-player':  () =>
        openOverlay('player'),
      // The row context menu is the only other way into the tag editor, and it
      // is a round trip through a second window — this one reaches it with no
      // IPC at all. Falls back to what is playing when nothing has focus.
      'edit-tags': () => {
        const id = focusedTrackId() ?? currentTrack?.id
        if (id)
          setEditingTrack(id)
      },
      'toggle-sidebar': toggleSidebar,
    }), [
    currentTrack,
    isPlaying,
    pause,
    playNext,
    playPrevious,
    resume,
    openOverlay,
    closeOverlay,
    setEditingTrack,
    setVolume,
    toggleSidebar,
    volume,
  ])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const action = actionForEvent(bindings, event)
    if (shouldIgnoreEvent(event, action))
      return

    if (event.key === 'Alt') {
      document.querySelector<HTMLElement>('.titlebar-controls button')?.focus()
      return
    }

    if (!action || action === 'play-pause' && isNativeActivationTarget(event.target))
      return

    event.preventDefault()
    actions[action]()
  }, [ actions, bindings ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Binds a `keydown` listener on `window`.
  useEffect(() => {
    const keydown = listen(window, 'keydown', handleKeyDown as EventListener)
    return () =>
      keydown.dispose()
  }, [ handleKeyDown ])

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Subscribes to the host's media-key channels.
  useEffect(() => {
    const mediaKeys = collectUnsubscribes(
      host.onMediaPlayPause(() => {
        if (currentTrack)
          void (isPlaying ? pause() : resume())
      }),
      host.onMediaNext(playNext),
      host.onMediaPrev(playPrevious),
    )

    return () =>
      mediaKeys.dispose()
  }, [ currentTrack, isPlaying, pause, resume, playNext, playPrevious, host ])
}
