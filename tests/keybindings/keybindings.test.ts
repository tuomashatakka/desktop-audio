import { describe, expect, it, vi } from 'vitest'
import {
  actionForEvent,
  createKeybindingStore,
  DEFAULT_KEYBINDINGS,
  formatShortcut,
  shortcutFromEvent,
} from '../../src/keybindings'


function keyboard (key: string, modifiers: Partial<KeyboardEvent> = {}) {
  return {
    key,
    altKey:   false,
    ctrlKey:  false,
    metaKey:  false,
    shiftKey: false,
    ...modifiers,
  }
}

describe('keybindings package', () => {
  it('normalizes platform modifiers and resolves overlapping letter bindings', () => {
    expect(shortcutFromEvent(keyboard('ArrowRight', { metaKey: true }))).toBe('mod+arrowright')
    expect(shortcutFromEvent(keyboard('ArrowRight', { ctrlKey: true }))).toBe('mod+arrowright')
    expect(actionForEvent(DEFAULT_KEYBINDINGS, keyboard('p'))).toBe('previous-track')
    expect(actionForEvent(DEFAULT_KEYBINDINGS, keyboard('p', { metaKey: true }))).toBe('open-player')
  })

  it('persists customization, rejects conflicts, and resets atomically', () => {
    const write = vi.fn()
    const store = createKeybindingStore({ read: () => null, write })
    const listener = vi.fn()
    store.subscribe(listener)

    expect(store.updateBinding('next-track-letter', 'x')).toBe(true)
    expect(store.getSnapshot().find(binding =>
      binding.id === 'next-track-letter')?.shortcut).toBe('x')
    expect(store.updateBinding('previous-track-letter', 'x')).toBe(false)
    expect(write).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()

    store.reset()
    expect(store.getSnapshot()).toEqual(DEFAULT_KEYBINDINGS)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('hydrates only known slots and formats shortcuts for each platform', () => {
    const saved = JSON.stringify([
      { id: 'open-settings', shortcut: 'alt+s' },
      { id: 'removed-action', shortcut: 'q' },
    ])
    const store = createKeybindingStore({ read: () => saved, write: vi.fn() })

    expect(store.getSnapshot().find(binding =>
      binding.id === 'open-settings')?.shortcut).toBe('alt+s')
    expect(store.getSnapshot()).toHaveLength(DEFAULT_KEYBINDINGS.length)
    expect(formatShortcut('mod+arrowleft', true)).toBe('Cmd + Left')
    expect(formatShortcut('mod+arrowleft', false)).toBe('Ctrl + Left')
    expect(formatShortcut('')).toBe('Unassigned')
  })
})
