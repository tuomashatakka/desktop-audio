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
