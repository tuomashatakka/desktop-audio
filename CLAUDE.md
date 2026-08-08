# Project: desktop-audio

Electron desktop music player. **Electron + React 18 + TypeScript + Vite + bun.**

## Commands

```bash
bun run start        # dev (electron-forge start)
bun run typecheck    # tsc --noEmit
bun run lint         # eslint ./src
bun run test         # vitest run   (`bun test` runs bun's own runner — not this)
bun run test:watch   # vitest --watch
bun run make         # production build
```

Every tool config lives in `config/` (`config/vite/*`, `config/playwright/*`,
`config/eslint.config.mjs`, `config/vitest.config.ts`, `config/forge.config.ts`)
and each one pins its own `projectRoot`, because a config that has moved no
longer sits where its relative paths assume. Only `package.json` and
`tsconfig.json` stay at the root, where their tooling requires them.
`package.json`'s `config.forge` field is what points electron-forge at its
relocated config.

Linting is `@tuomashatakka/eslint-config` applied whole. The 35 remaining
`react-strict/prefer-no-use-effect` warnings are known and deliberate —
rewriting those effects is a separate refactor, not part of adopting the
config.

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

`useLibraryScanner` is the only thing that fills the library. It is cache-first
and everything reaches it as a **stream of events** — nothing returns a library.

- **Both** `data.scan()` and `data.load()` are fire-and-forget. A scan streams
  `batch` → `done`; a hydrate streams `hydrate-batch` → `hydrate-done`. The two
  pairs are deliberately distinct: a scan's `done` prunes ids it did not
  rediscover, so a hydrate must never feed `seenThisScan`.
- Hydration reads SQLite on the `db-reader` worker thread and posts rows back in
  batches of `READ_BATCH_SIZE`. It used to be a synchronous `SELECT *` inside an
  `ipcMain.handle`, which blocked the main process and painted nothing until the
  whole table was read.
- A module-level `Map` holds the tracks, so remounting a view replays the cache
  instead of refetching. Hydration and the auto-rescan are each guarded by a
  module-level flag/key — **never trigger `scanLibrary()` from a view's mount
  effect**, that's what caused the "reloads on every tab switch" bug.
- A scan never clears the cache up front. Batches merge in place; ids the scan
  didn't rediscover are pruned only on `done`, and only if it found something.
- `isLoading` therefore means "a scan is running", not "there's nothing to
  show". Skeletons are for an empty list only, and the first hydrate batch is
  enough to retire the initial spinner.

## Workers

Three of them, all spawned by `main.ts` through one `getWorker(name)`
supervisor and all built from `config/vite/worker.config.ts`:
`scanner-worker`, `db-reader`, `db-writer`. **A worker that is not listed in
`config/forge.config.ts` is never built**, and `new Worker()` then points at a
file that does not exist — that is exactly how every renderer-side tag save was
failing silently before `db-writer` was added to the build.

## Subscriptions

Anything that binds a listener returns a disposable from `disposable-events`,
not a bare unsubscribe function: `src/app/utils/events.ts` wraps it as `listen`
(one DOM listener), `listenAll` (several on one target) and
`collectUnsubscribes` (the plain callbacks the preload bridge hands back, since
`contextBridge` cannot carry class instances). `useEffect` cleanup is then
always one `dispose()` call, and a bind can no longer drift away from its
matching unbind.

## Track metadata & the tag editor

`src/track-schema.ts` is the single description of the `tracks` table. The
scanner worker, the db writer and the db reader all derive their
DDL, their upsert statements and the snake_case ↔ camelCase mapping from it —
**adding a tag field is one line there plus one in `TrackFields`**
(`app/services/types.ts`). `migrate()` back-fills columns on an existing DB via
`PRAGMA table_info`, so an old library file survives an upgrade.

`models/Track` generates its accessors from a field list rather than declaring
thirty getter/setter pairs; the class is merged with an interface so the
compiler knows about properties that only exist at runtime. Assigning any of
them marks the model dirty → debounced `flush()` → `upsertTrack`.

**Tag edits are written to the app's database, not into the audio file.**
Nothing in the tree can write ID3/Vorbis frames. The scanner cooperates: a
renderer-side write leaves `mtime_ms` untouched (`upsertDtoSql`), so the next
scan sees an unchanged file, serves the stored row, and the edit survives.
Touch the file on disk and the re-parse wins.

The editor shows `PRIMARY_TAG_FIELDS` up front and `EXTENDED_TAG_FIELDS` behind
a `<details>`; both lists are ordered as they appear on screen. Artwork is a
data URL either way, whether it came from a picture frame or the file picker.

## Appearance settings

`useAppearance` writes three things onto the document root, because they have
to reach `@layer tokens` which nothing renders:

- `--font` / `--font-display` from the chosen `UiFont`. Only Montserrat and
  Sofia Pro ship with the app; Poppins and Helvetica resolve against installed
  system fonts. The default keeps Sofia Pro for headings (`UI_DISPLAY_STACKS`).
- root `font-size` from `fontScale`. Every `--text-*` token is in **rem** for
  this reason; the spacing scale stays in px so only type moves.
- `--accent` per built-in theme (`accentDark` / `accentLight`), plus a derived
  `--accent-hover` and a luminance-picked `--accent-contrast`. Skipped entirely
  when `theme === 'custom'` — that theme owns its own accent.

It is mounted in `AppContent`, above `useThemeApply` in `SettingsView`, so it
runs *after* it on any commit that changes both. Don't move it deeper.

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
- Every grouping mode (album / artist / path) collapses via one `GroupToggle`
  button next to the heading, keyed by group in a `collapsedGroups` set — not
  `<details>`. Album groups put artwork outside the heading and path groups put
  an interactive breadcrumb trail inside it, and neither survives a
  `<summary>`. A collapsed group renders no rows at all.

## Ambient wash

`body::before` is a page-wide gradient tinted by the current album art.
`useAmbientPalette` samples the artwork on a 24×24 canvas, buckets the pixels,
and writes `--ambient-1/2/3` (dark → light) to the root element.

- Don't reach for `track.coverColor` for this — it's a hash of the *title*
  (`generateCoverColor` in scanner-worker), not the artwork. It's only the
  no-art fallback.
- The three vars are registered with `@property` so they cross-fade between
  tracks; unregistered custom properties can't be transitioned.
- `mix-blend-mode` flips per theme: `screen` on dark (glow), `multiply` at
  lower strength on light (`screen` would blow a light surface out to white).

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

- `CHROME_MAX_HEIGHT` (480) — a **geometric floor**. Titlebar (40) + player bar
  (72) stop being affordable, so they're hidden and PlayerView takes the whole
  window. `useWindowScale` uses this one for "am I the small window?".
- `COMPACT_MAX_HEIGHT` (300) — a **styling choice**. The normal centred stack
  still reads fine above this once the chrome is gone; the 300–479 band is the
  `snug` tier (chrome hidden, normal layout, compressed in two steps by
  `@container (max-height: 420px)` and `(max-height: 340px)`).

Careful: `.player-view` *is* the container, so a `@container` query can never
style `.player-view` itself — its own padding/gap must hang off the tier
attribute.

The mini/compact title marquees with `translateX(min(0px, calc(100cqw - 100%)))`
— `.track-title` is its own `container-type: inline-size`, so `100cqw` is the
box and `100%` is the text. A title that fits yields a positive value, `min()`
clamps it to zero, and the animation runs without moving. No JS measurement,
no `.is-overflowing` class.

## Player transport & lyrics

Shuffle and repeat live in `SettingsContext` (persisted) and are *read* by
`AudioContext` through `useOptionalSettings` — playback stays usable, and
testable, without a settings provider above it. `pickTrack()` is the one place
that knows what next/previous mean under shuffle and repeat; the `ended`
handler goes through `advanceRef` so it never closes over stale modes.

Shuffle ignores direction: "previous" in a shuffled queue is another arbitrary
track, because the engine keeps no play history.

The lyrics panel replaces the progress bar and transport, and only in the
full-window player at the `normal` height tier — the footer bar and the mini
tiers have nowhere to put a column of text, so the toggle is hidden there
rather than being a control that does nothing. Lyrics come from the file's
tags (`common.lyrics`, synced frames flattened); there is no fetching.

The footer bar has **no volume slider** — the system volume and the full player
both already own that, and the width is better spent on the progress bar. The
`.player-volume` element still renders; the bar-mode rules hide it.

## Instant interaction and waveform rendering

Interactive state changes do not wait for transitions: `--duration-fast` and
`--duration` are zero, view changes are ordinary React state updates, and the
sidebar changes width immediately. The slow token remains reserved for
non-blocking feedback such as the loading spinner and ambient album-art wash.

`WaveformProgress` renders amplitudes as one memoized SVG path. The path is
painted once as unplayed and once through an SVG clip as played; a transparent
native `<input type="range">` above it provides pointer, touch, and keyboard
seeking. Playback ticks update the clip edge and range value only. The mini tier
switches the same SVG to two rectangles so its progress indicator stays the
existing solid hairline.

## Context menu window

The menu is a separate frameless `BrowserWindow`, so it inherits nothing —
`contextmenu:show` carries `theme` and `accent` alongside the items, and
`ContextMenuApp` stamps them onto *its* document root. The window stays
transparent (frameless windows show their own corners otherwise); the
`.context-menu-window` panel is what's painted opaque.

## Also see

- code style guide: @docs/DESIGN_GUIDE.md
- design style guide: @docs/STYLE_GUIDE.md
- design guide:  @docs/IMPLEMENTATION_PLAN.md
