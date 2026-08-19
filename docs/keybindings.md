# Key bindings

Keyboard bindings live in `src/keybindings/`, independently of React and
Electron. The package owns normalization, matching, formatting, persistence,
conflict detection, and subscriptions. `useKeybindings` is the small React
adapter; `useKeyboardShortcuts` maps resolved actions onto app services.

## Defaults

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause |
| `N` / `Cmd/Ctrl + Right` | Next track |
| `P` / `Cmd/Ctrl + Left` | Previous track |
| `Cmd/Ctrl + ,` | Open settings |
| `Cmd/Ctrl + L` | Open library |
| `Cmd/Ctrl + P` | Open now playing |
| `Cmd/Ctrl + E` | Toggle the side menu |
| `Cmd/Ctrl + I` | Edit tags for the focused track |
| `Cmd/Ctrl + Up/Down` | Change volume |

Bindings are customizable under **Settings → Hotkeys** and update immediately.
A shortcut can belong to only one command. `Delete` or `Backspace` clears the
focused binding, and **Reset hotkeys** restores the defaults.

Navigation and layout chords remain global while an input or textarea has
focus. Playback letters, arrows, volume, and Space stay with the editing control
so keyboard entry and native button activation are never stolen.

## Standalone use

Use `createKeybindingStore(storage?, defaults?)` for an isolated store. A
storage adapter only needs `read()` and `write(value)`. Call
`shortcutFromEvent()` to normalize a keyboard event, `actionForEvent()` to
resolve it, and `formatShortcut()` for platform-aware display text. The exported
`keybindingStore` is the app's local-storage-backed singleton.
