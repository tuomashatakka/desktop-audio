/**
 * Dirty tracking helper used in model setters. Calls `markDirty()` only
 * if the new value differs from the old (using `Object.is`). Returns
 * whether a change was recorded. Replaces a decorator-based approach.
 */
type ModelType = { markDirty(): void }

export function markDirtyIfChanged<T> (model: ModelType, oldValue: T, newValue: T): boolean {
  if (Object.is(oldValue, newValue))
    return false
  model.markDirty()
  return true
}
