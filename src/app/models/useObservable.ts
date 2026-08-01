/**
 * Subscribes a component to a {@link Model}'s `dirty` / `flush` events.
 *
 * Note the snapshot reads below are ternaries rather than an early `return`,
 * and `getServerSnapshot` is omitted rather than passed as `() => undefined`.
 * `useSyncExternalStore` types those callbacks as `() => V | undefined`, so
 * anything that infers `void` fails the build — and `eslint --fix` rewrites a
 * bare `undefined` into exactly that. Writing it this way leaves the linter
 * nothing to "fix". (There is no SSR here, so `getServerSnapshot` is unused.)
 */
import { useSyncExternalStore } from 'react'
import { Model } from './Model'
import { noop } from '../utils/noop'


function subscribeTo (model: Model | null) {
  return (onStoreChange: () => void) => {
    if (!model)
      return noop

    model.addEventListener('dirty', onStoreChange)
    model.addEventListener('flush', onStoreChange)
    return () => {
      model.removeEventListener('dirty', onStoreChange)
      model.removeEventListener('flush', onStoreChange)
    }
  }
}

export function useObservable<K extends string, V> (model: Model | null, key: K): V | undefined {
  return useSyncExternalStore(
    subscribeTo(model),
    () =>
      model
        ? (model as unknown as Record<string, unknown>)[key] as V
        : undefined,
  )
}

export function useModelDirty (model: Model | null): boolean {
  return useSyncExternalStore(
    subscribeTo(model),
    () =>
      model?.dirty ?? false,
    () =>
      false,
  )
}
