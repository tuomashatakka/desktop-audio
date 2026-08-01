# Project: desktop-audio

Electron desktop music player. **Electron + React 18 + TypeScript + Vite + bun.**

## Commands

```bash
bun run start        # dev (electron-forge start)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint ./src
bun test             # vitest run
bun run test:watch   # vitest --watch
bun run make         # production build
```

## Architecture

```
src/
  main.ts              # Electron main process — IPC handlers
  preload.ts           # contextBridge — exposes electronAPI to renderer
  scanner-worker.ts    # Node.js Worker thread — walks dirs, writes SQLite
  app/
    contexts/          # React contexts: Library, Audio, Settings, UI
    hooks/             # useLibraryScanner (scan + subscribe), useKeyboardShortcuts
    services/
      contextBridge.ts # ElectronAPI interface + bridge accessor
      audioEngine.ts   # Web Audio API waveform/analyzer
      types.ts         # Track, FolderNode, AudioMetadata
    views/             # LibraryView, PlayerView, SettingsView, TagEditorView
```

## IPC Conventions

All IPC channels use `namespace:action` format: `library:scan`, `file:read`, `window:minimize`.
Bridge methods `onLibraryBatch` / `onLibraryDone` return unsubscribe functions — use in `useEffect` cleanup.

## Library loading

`useLibraryScanner` is the only thing that fills the library, and it is
cache-first:

- A module-level `Map` holds the tracks, so remounting a view replays the cache
  instead of refetching. Hydration (`data.load()`) and the auto-rescan are each
  guarded by a module-level flag/key — **never trigger `scanLibrary()` from a
  view's mount effect**, that's what caused the "reloads on every tab switch"
  bug.
- A scan never clears the cache up front. Batches merge in place; ids the scan
  didn't rediscover are pruned only on `done`, and only if it found something.
- `isLoading` therefore means "a scan is running", not "there's nothing to
  show". Skeletons are for an empty list only.

## Track table layout

`TrackTable` has exactly one scroll container (`.track-scroll`). Everything
that stays put is `position: sticky` inside it:

- `.track-header` pins at `top: 0`; its row height is fixed to `--head-h`
  (34px) so group headers can pin at `top: var(--head-h)`.
- The flat list is virtualized (absolutely positioned rows inside a spacer);
  grouped views render in full.
- Ancestors (`.app-main`, `.view-content`) are `overflow: hidden` for views
  that scroll internally — `.view-content:has(> .library)`. Document-style
  views (settings, tag editor) still scroll in `.view-content`.

## Player tiers

Two independent axes collapse the player, both in `player.css`:

- **Height** → `data-height-tier` on `.app-shell` (`normal` / `snug` /
  `compact` / `mini`, from `useHeightTier`). Height has to be JS because it
  hides chrome *outside* the `.player-view` container (titlebar, player bar).
- **Width** → `@container` queries against `.player-view`. Shedding order as
  the window narrows: album art at `260px`, then (mini only) the next button
  at `180px`. Below `260px` wide the compact tier stacks
  title → progress → controls instead of putting controls beside the progress
  bar. Title and progress line are the last to go.

Two separate height thresholds, and conflating them is a trap:

- `CHROME_MAX_HEIGHT` (300) — a **geometric floor**. Titlebar (40) + player bar
  (72) stop being affordable, so they're hidden and PlayerView takes the whole
  window. `useWindowScale` uses this one for "am I the small window?".
- `COMPACT_MAX_HEIGHT` (260) — a **styling choice**. The normal centred stack
  still reads fine above this once the chrome is gone; that band is the `snug`
  tier (chrome hidden, normal layout, compressed by
  `@container (max-height: 300px)`).

Careful: `.player-view` *is* the container, so a `@container` query can never
style `.player-view` itself — its own padding/gap must hang off the tier
attribute.

The mini/compact title marquees with `translateX(min(0px, calc(100cqw - 100%)))`
— `.track-title` is its own `container-type: inline-size`, so `100cqw` is the
box and `100%` is the text. A title that fits yields a positive value, `min()`
clamps it to zero, and the animation runs without moving. No JS measurement,
no `.is-overflowing` class.

## Also see

- code style guide: @docs/DESIGN_GUIDE.md
- design style guide: @docs/STYLE_GUIDE.md
- design guide:  @docs/IMPLEMENTATION_PLAN.md