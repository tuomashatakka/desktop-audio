import { useSyncExternalStore } from 'react'
import { Model } from './Model'


export function useObservable<K extends string, V> (model: Model | null, key: K): V | undefined {
  return useSyncExternalStore(
    (onStoreChange: () => void) => {
      if (!model)
        return () => {}
      model.addEventListener('dirty', onStoreChange)
      model.addEventListener('flush', onStoreChange)
      return () => {
        model.removeEventListener('dirty', onStoreChange)
        model.removeEventListener('flush', onStoreChange)
      }
    },
    () => {
      if (!model)
        return undefined
      return (model as unknown as Record<string, unknown>)[key] as V
    },
    () => undefined,
  )
}

export function useModelDirty (model: Model | null): boolean {
  return useSyncExternalStore(
    (onStoreChange: () => void) => {
      if (!model)
        return () => {}
      model.addEventListener('dirty', onStoreChange)
      model.addEventListener('flush', onStoreChange)
      return () => {
        model.removeEventListener('dirty', onStoreChange)
        model.removeEventListener('flush', onStoreChange)
      }
    },
    () =>
      model?.dirty ?? false,
    () =>
      false,
  )
}
