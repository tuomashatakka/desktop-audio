// Dirty tracking helper - manually called in setters
// This replaces the decorator approach for TypeScript compatibility

export function markDirtyIfChanged<T>(model: { markDirty(): void }, oldValue: T, newValue: T): boolean {
  if (Object.is(oldValue, newValue))
    return false
  model.markDirty()
  return true
}
