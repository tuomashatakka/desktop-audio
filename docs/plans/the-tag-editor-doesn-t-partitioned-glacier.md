# Tag editor entry points + library column toggles

## Context

Two user-reported faults, both of which turned out to be **context-menu reachability**
problems rather than faults in the features themselves.

1. **"The tag editor doesn't work — it won't even open."** The tag editor's save
   path is intact: the IPC channel strings match (`models:upsert` ↔
   `ipcMain.handle('models:upsert')`), the SQLite upsert lands, and the scanner
   deliberately leaves `mtime_ms` alone so edits survive a rescan
   (`track-schema.ts:194-197`, `scanner-worker.ts:308-322`). Nothing is broken
   *inside* it. The problem is the door: `setEditingTrack` is the only way to
   open the overlay (`UIContext.tsx:284-287`), and its **only** call site is
   `case 3` of the track-row context menu (`LibraryView.tsx:168-173`). That door
   is closed in two situations:
   - **Grid density has no context menu at all.** `LibraryGrid.tsx` /
     `MediaCard.tsx` bind no `onContextMenu` anywhere — confirmed by grep. In
     `grid-sm` / `grid-lg` density (and it persists independently under
     `desktop-audio-density`, `UIContext.tsx:135`), right-clicking a card does
     nothing, so the tag editor is simply unreachable.
   - **The one door is a four-hop round trip** — renderer → main →
     `popoverWindow` (a second `BrowserWindow`) → main → renderer. Any hop
     failing yields silence: `contextmenu:show` returns early when
     `popoverWindow` is null (`main.ts:846-847`), and nothing surfaces an error.

2. **"No way to toggle attributes for the library header row."** The feature
   *exists* — `ColumnMenu` (`TrackTableColumns.tsx:233-276`) is wired to the
   header's right-click (`TrackTable.tsx:691`) and rendered at
   `TrackTable.tsx:735`. It never appears because of a **light-dismiss race**,
   verified in real Chrome 151 (not inferred):

   ```
   contextmenu -> showPopover()
   toggle:closed          <- immediately light-dismissed
   :popover-open = false
   ```

   Per the HTML "light dismiss" algorithm: at `pointerdown` no popover is open,
   so the document's popover-pointerdown-target stays `null`; the `contextmenu`
   event then opens one; at the `pointerup` that ends the same right-click the
   clicked-popover ancestor is also `null`, the two match, and everything is
   hidden. **A `popover=auto` shown from a `contextmenu` handler cannot survive
   the gesture that opened it.** jsdom implements no light dismiss, which is why
   `TrackTable.test.tsx:126-163` passes while the feature is dead in the app.
   The same bug silently kills `PlaylistMenu` (sidebar right-click).

   Separately, the toggles are unreachable from Preferences because
   `useColumnConfig` is plain `useState` local to `TrackTable` (`TrackTable.tsx:327`).

**Intended outcome:** the tag editor is reachable from every library view and
from the keyboard; the column toggles actually open from the header row and are
mirrored in Preferences → Library.

---

## Part 1 — Fix the light-dismiss race (unblocks the header menu)

Add one helper to `src/app/utils/events.ts`. Its module docstring already notes
that listeners needing `once` use the native API directly, so this fits:

```ts
/**
 * Runs `show` once the pointer gesture currently in flight has ended.
 *
 * A `popover` opened *during* a `contextmenu` event is light-dismissed by the
 * `pointerup` that ends the same right-click: nothing was open at pointerdown,
 * so the document records a null clicked-popover target, and at pointerup the
 * target outside the popover matches that null — which hides it. Waiting the
 * gesture out is what lets a pointer-opened menu stay up. A keyboard-triggered
 * menu (Shift+F10 / the Menu key) reports `buttons === 0` and has no gesture
 * to wait for.
 */
export function afterPointerRelease (buttons: number, show: () => void): void
```

Apply at every site that opens a `Popover` from a `contextmenu` event:

- `TrackTableColumns.tsx:174-178` — `HeaderCell.handleContextMenu`. The
  `onKeyDown` branch (lines 195-200) already has no gesture and must keep
  calling `onContextMenu` directly.
- `PlaylistTree.tsx:85-127` — the sidebar playlist/folder right-click, broken by
  the same race today.

Do **not** touch the track-row path — that uses the native `popoverWindow` and a
different mechanism entirely.

## Part 2 — Reach the tag editor without the native menu

**2a. Give grid cards a context menu.** Add `onContextMenu?: (point) => void` to
`MediaCardProps` (`MediaCard.tsx:5-17`) and thread it from `LibraryGrid` up to
`LibraryView`, reusing the existing `handleContextMenu` (`LibraryView.tsx:141-160`)
and its `CONTEXT_MENU_ITEMS`. A card representing a *group* (album/artist) has no
single track, so for group cards the menu is Play / Add to Playlist only; track
cards get the full four-item list. `LibraryGrid` already receives `onPlay` and
`onOpen`, so the plumbing follows the shape that is there.

**2b. Add a keyboard door.** Append to `src/keybindings/defaults.ts` (same shape
as `open-settings` on line 10):

```ts
{ id: 'edit-tags', action: 'edit-tags', label: 'Edit tags', shortcut: 'mod+i' },
```

Add `'edit-tags'` to the action union in `src/keybindings/types.ts` and handle it
in `useKeyboardShortcuts` by calling `setEditingTrack` on the focused/selected
track — the row selection already exists via `useRowSelection`, and `LibraryView`
holds `selectTrack`/`filteredTracks`. This makes the editor reachable with **no**
IPC round trip, which is the real point: it removes the single point of failure.

**2c. Stop the round trip failing silently.** In `main.ts:845-847`, log when
`contextmenu:show` fires with a null `popoverWindow` instead of returning
quietly, using the existing `log.info`/`log.error` used by the `library:*`
handlers. This is what makes a future recurrence diagnosable in one look.

## Part 3 — Column toggles in Preferences

**3a. Lift the config.** `useColumnConfig` keeps its implementation and its
`desktop-audio-column-config` key; expose its `ColumnConfigApi` through
`UIContext`, which already owns exactly this kind of presentation state with its
own storage keys (`density`, `grouping`, `DENSITY_KEY` at `UIContext.tsx:135`).
Call `useColumnConfig()` once in `UIProvider`, spread the seven fields into the
context value and its `useMemo` dependency array. `TrackTable.tsx:327` then reads
them from `useUI()` instead of calling the hook itself. No behaviour change, one
source of truth.

**3b. Add the checkboxes.** In `SettingsView.tsx`, inside the **existing Library
section**, after the "Show subfolders in the track list" checkbox
(`SettingsView.tsx:185-193`). Follow the Analysis section's grouped-checkbox
pattern (`SettingsView.tsx:538-586`) — a `<fieldset>` with a legend, one
`label.field.checkbox-field` per column, `disabled` on `fixed` columns, plus a
Reset button calling `resetColumns`. Reuse `c.label || c.key` for the visible
name exactly as `ColumnMenu` does.

Any new styling goes in `views.css` (a settings screen's own rules) per the
one-file-per-layer invariant; add no tokens outside `tokens.css`.

---

## Verification

1. `bun run lint && bun run typecheck && bun run test`
2. **Real window required** for the light-dismiss fix — jsdom cannot catch it,
   which is exactly how it shipped. In `bun run start`:
   - Right-click a column header → the Columns popover **stays open**; tick
     `Year`, confirm the column appears and survives a restart.
   - Right-click a sidebar playlist → its menu stays open (same fix).
   - Switch density to a grid → right-click a card → menu appears → *Edit Tags*
     opens the overlay.
   - Focus a track row, press `mod+i` → the tag editor opens with **no** context
     menu involved. This is the check that proves the round trip is no longer
     the single door.
   - Settings → Library → toggle a column, confirm the header updates live.
3. Tests, written last and once:
   - `tests/hooks/useColumnConfig.test.ts` — toggle, `fixed` refusal, reset,
     and the `loadConfig` merge-with-defaults path (currently untested).
   - Extend `tests/views/SettingsView.test.tsx` for the new checkboxes.
   - Extend `tests/components/composite/LibraryGrid.test.tsx` (or add it) for
     the card context menu.
   - Add a comment at the `afterPointerRelease` call sites noting the behaviour
     is **not** unit-testable under jsdom, so nobody "simplifies" it away.
4. Docs, last and once: a short **"Context menus and light dismiss"** invariant
   in `AGENTS.md` next to the existing CSS/DOM invariants, and the new `mod+i`
   binding in `docs/keybindings.md`.

## Explicitly out of scope

Writing tags into the audio files themselves. The editor persists to the app's
own SQLite database by design (`TagEditorView.tsx:8-13`) — `music-metadata` reads
only, and nothing installed can write ID3/Vorbis frames. Real file writes would
mean adding `node-taglib-sharp` (6.0.3, pure JS, no native build) and a new
`file:write-tags` channel; that is a separate piece of work and was not what was
asked for here.
