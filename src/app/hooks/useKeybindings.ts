import { useCallback, useSyncExternalStore } from 'react'
import { keybindingStore } from '../../keybindings'


/** React adapter around the framework-free keybinding store. */
export function useKeybindings () {
  const bindings = useSyncExternalStore(
    keybindingStore.subscribe,
    keybindingStore.getSnapshot,
    keybindingStore.getSnapshot
  )

  const updateBinding = useCallback((id: string, shortcut: string) =>
    keybindingStore.updateBinding(id, shortcut), [])

  const resetKeybindings = useCallback(() =>
    keybindingStore.reset(), [])

  return { bindings, updateBinding, resetKeybindings }
}
