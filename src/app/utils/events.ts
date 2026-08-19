/**
 * Thin helpers over `disposable-events` for DOM subscriptions.
 *
 * The pattern they replace — bind N listeners, then hand-write the matching N
 * `removeEventListener` calls in a cleanup closure — is where listener leaks
 * come from: the two lists drift, or one line is forgotten. A `DisposableEvent`
 * binds and unbinds in one place, and a `DisposableCollection` releases a whole
 * group at once, so `useEffect` cleanup is always the same single call.
 *
 * Note these do not take `AddEventListenerOptions`; a listener that needs
 * `once`, `capture` or `passive` still uses the native API directly.
 */
import { Disposable, DisposableCollection, DisposableEvent } from 'disposable-events'


/** Event type → handler, for {@link listenAll}. */
export type EventHandlers = Record<string, EventListener>

/** Binds one listener; dispose the result to remove it. */
export function listen (
  target: EventTarget,
  type: string,
  handler: EventListener
): DisposableEvent {
  return new DisposableEvent({ target, type, handler })
}

/**
 * Binds several listeners on one target and returns a single handle that
 * removes all of them.
 */
export function listenAll (
  target: EventTarget,
  handlers: EventHandlers
): DisposableCollection {
  return new DisposableCollection(
    ...Object.entries(handlers).map(([ type, handler ]) =>
      listen(target, type, handler))
  )
}

/**
 * Gathers plain unsubscribe callbacks — the shape the preload bridge exposes,
 * which cannot hand class instances across `contextBridge` — into one handle.
 */
export function collectUnsubscribes (...unsubscribes: (() => void)[]): DisposableCollection {
  return new DisposableCollection(
    ...unsubscribes.map(unsubscribe =>
      new Disposable(unsubscribe))
  )
}

/**
 * Runs `show` once the pointer gesture currently in flight has ended.
 *
 * A popover opened *during* a `contextmenu` event cannot survive the gesture
 * that opened it. Light dismiss records the clicked-popover target at
 * `pointerdown` — when nothing was open yet, so it records `null` — and at the
 * `pointerup` ending the same right-click the target outside the popover
 * resolves to `null` too. The two match, and everything open is hidden. The
 * menu is therefore shown and closed before it ever paints.
 *
 * Waiting the gesture out is what lets a pointer-opened menu stay up. A
 * keyboard-triggered menu (Shift+F10 or the Menu key) reports `buttons === 0`
 * and has no gesture to wait for, so it opens immediately.
 *
 * jsdom implements no light dismiss, so **no component test can catch a
 * regression here** — it needs a real window. This is how the column menu and
 * the playlist menu both shipped dead.
 */
export function afterPointerRelease (buttons: number, show: () => void): void {
  if (buttons === 0) {
    show()
    return
  }

  // `once` is why this is the native API rather than `listen` — see the note
  // in this module's docstring.
  window.addEventListener('pointerup', () =>
    show(), { once: true })
}
