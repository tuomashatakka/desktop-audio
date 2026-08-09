# Project: desktop-audio

Electron desktop music player. **Electron + React 19 + TypeScript + Vite + bun.**

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

Linting is `@tuomashatakka/eslint-config` applied whole. The 36 remaining
`react-strict/prefer-no-use-effect` warnings are known and deliberate —
rewriting those effects is a separate refactor, not part of adopting the
config.

## Dependency security

`package.json` and `bun.lock` are one dependency change: update and review them
together. Electron is pinned exactly so a Chromium security update is an
intentional app-runtime upgrade rather than incidental lockfile churn. After
changing it, run `bun install`, `bun run rebuild`, verify the installed Electron
version, and exercise both the dev and packaged apps.

GitHub Dependabot and `bun audit` are separate inventories. Remediating every
open Dependabot alert does not imply that the wider development/build graph has
no transitive audit findings; query and report both explicitly.

## Architecture

```
src/
  main.ts              # Electron main process — IPC handlers
  preload.ts           # contextBridge — exposes electronAPI to renderer
  scanner-worker.ts    # Node.js Worker thread — walks dirs, writes SQLite
  app/
    contexts/          # React contexts: Library, Audio, Settings, UI
    hooks/             # useLibraryScanner (scan + subscribe), useKeyboardShortcuts
    layout/            # AppLayout, Titlebar, LibrarySidebar, OverlayHost
    components/
      atomic/          # Overlay, Dialog, SegmentedControl, Rating, AlbumArt, …
      composite/       # TrackTable, LibraryGrid, MediaCard, Player, Breadcrumbs
    services/
      contextBridge.ts # ElectronAPI interface + bridge accessor
      audioEngine.ts   # Web Audio API waveform/analyzer
      types.ts         # Track, FolderNode, AudioMetadata
    utils/
      grouping.ts      # bucketKey / buildGroups — shared by the table and the grid
    views/             # LibraryView (+ LibraryToolbar, LibrarySearch), Settings, TagEditor
```

## Views are overlays, not routes

The library is the only view. Now Playing, Settings and the Tag Editor are
modal `<dialog>`s over it, so opening one keeps the library — its scroll
position, its selection, the sidebar — exactly where it was.

- `UIContext` has no route state. `overlay: 'player' | 'settings' | 'tag-editor'
  | null` names at most one, via `openOverlay` / `closeOverlay`. There is no
  `currentView`, no `previousView`, and `.app-shell` carries no `data-view`.
- `components/atomic/Overlay.tsx` is the single modal surface: a native
  `<dialog>` opened with `showModal()` and portaled to `document.body`. That
  buys the focus trap, the inert background, `::backdrop` and Escape; adding
  `closedby='any'` buys backdrop dismissal. `Dialog` is `Overlay` plus a titled
  header. Three sizes via `data-variant`: `panel`, `sheet`, `full`.
- `layout/OverlayHost.tsx` mounts only the active one. Its exit animation is
  CSS, so unmounting on close still animates out.

With no routes left, the titlebar has no nav strip: it is sidebar toggle,
wordmark, a context slot holding only `LibrarySearch`, and the window buttons.
Settings moved to `.sidebar-footer`, next to the rest of the library's
navigation. Now Playing opens from `.player-promote`, the invisible full-bar
button over the footer player.

The search field is `<search>` (`role="search"` natively) wrapping the input.
It collapses to its own glyph with no state at all: `:not(:focus-within):has(>
input:placeholder-shown)` shrinks the pill to `--sp-8` and re-centres the icon
at `left: 50%`. It stays transparent until hovered or focused, so it reads as
chrome rather than as a field sitting in the titlebar.

**The player is rendered twice from one component, and where it sits is the
whole layout switch.** The footer bar's copy is inside `.app-shell`, so the
height-tier and footer-bar rules in `layout.css` reach it; the overlay's copy
is portaled outside the shell, so none of those descendant selectors match and
it falls through to the full-window layout. `Player`'s `expanded` prop only
decides what is in the DOM (promote button vs close button and lyrics toggle),
never how it is laid out.

## The playback queue

`AudioContext` owns a real queue. Callers hand over a list **once**, when they
start playback:

- `playQueue(tracks, startIndex)` replaces the queue; `playNext()` /
  `playPrevious()` take no arguments and walk it by index; `enqueue(tracks)`
  appends. `play(track)` is a queue of one, and is honest about that.
- `pickIndex(length, current, step, shuffle, repeat)` is the one place that
  knows what a step means. Shuffle still ignores direction (no play history);
  repeat `all` wraps; repeat `none` returns `null`; repeat `one` re-seeks in
  the caller.
- `queueRef` / `queueIndexRef` are the source of truth because the `ended`
  listener is registered once and must not close over a stale queue; state
  mirrors them for the UI.

Before this, `playNext(tracks)` took a list on every call and `App.tsx` set the
queue globally to `filteredTracks` — so folder and album scoping never reached
playback, and starting a track inside an album left it on the next press.
`LibraryView` now queues `displayTracks`, the list actually on screen.

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
`scanner-worker`, `db-reader`, `db-writer`.

Getting a worker built takes **two** things, and the second one is not obvious:

1. It must be listed in `config/forge.config.ts`, and
2. `config/vite/worker.config.ts` must **not** declare `build.lib`. Forge's Vite
   plugin only injects the per-entry `entry` when the user config leaves
   `build.lib` undefined — declaring it opts out of the injection entirely.
   Because all three workers share that one config file, pinning
   `entry: 'src/scanner-worker.ts'` there meant every worker build compiled the
   scanner and `db-reader.js` / `db-writer.js` were never emitted at all. That
   is why hydration returned nothing and every tag save failed silently, even
   after the forge entries were added.

`getWorker` now `existsSync`-checks the entry and throws by name, and every
streaming handler sends a terminal `done` even when the worker fails to spawn —
a request that can end without one strands the renderer's spinner forever.

`main.ts` stamps a numeric `id` on every worker request and each worker echoes
it. Without that, a listener attached for one request sees every other
request's replies — fine while only one is ever in flight, wrong the moment the
track list asks for forty thumbnails during a hydrate.

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

### Album art is never on a track row

`album_art` is the one column excluded from every list DTO (`LIST_COLUMN_NAMES`
/ `rowToListDto`). It is base64, and on a real library it dwarfs everything
else — 372 MB against ~1 MB for all other columns combined, single rows up to
2.4 MB. Streaming it inline put roughly twice that into the renderer's string
heap on every scan. The reader's and scanner's `SELECT`s name their columns for
this reason; a stray `SELECT *` reintroduces the whole problem.

Art is fetched per track over `library:artwork` instead: the blob read happens
on the reader thread, the downscale in `main.ts` (`nativeImage` is an Electron
API and is unreachable from a worker), and both sizes are cached there and
again in `useArtwork`. Lists ask for `'thumb'`; the player, tag editor and
media session ask for `'full'`.

**Writes are partial, and this is load-bearing.** Since a track in memory has
no `albumArt`, a write that named every column would set `album_art = NULL` for
every track anyone edits. So:

- `Track.fromDTO` only creates a backing property for fields the DTO carried,
  and `toDTO()` only emits fields that have one.
- `dtoColumns()` / `upsertDtoSql(columns)` build a statement over exactly those.
- Absent key ⇒ leave the column alone. Present-but-`undefined` ⇒ write `NULL`.
  That is what still lets the tag editor clear a field, and why clearing
  artwork seeds the stored value first (the setter ignores an assignment equal
  to what it already holds, and a list-hydrated track holds nothing).

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

## Window lifecycle & dev startup

The main window is `frame: false` + `transparent: true` + `#00000000`, which
means **a window that fails to load is not a broken window, it is no window at
all** while the process stays alive. Everything here exists because that failure
mode is invisible:

- `show: false` + `ready-to-show`, so nothing is shown until there is something
  to paint.
- `did-fail-load` logs and retries the dev-server URL (20 × 250 ms), then loads
  an inline error page **and shows it**. `render-process-gone` and
  `unresponsive` log loudly. Before these, every one of those states looked
  identical to "the app didn't start".
- Both renderer configs bind `server: { host: '::' }`. Vite's default bound
  IPv6-only while Forge freezes the literal `http://localhost:<port>` into the
  main bundle at build time, so whether the window appeared came down to which
  family Chromium tried — the origin of the "every other run" bug. `::` accepts
  IPv4-mapped connections, so both spellings answer.

Nothing used to quit the app: `window-all-closed` could never fire because the
popover window is only ever hidden, never closed, and Forge's SIGINT handler
exits without killing its Electron child. Every session leaked a live process
holding the profile's leveldb locks. Now the main window's `closed` destroys the
popover, `window-all-closed` quits on every platform, and
`requestSingleInstanceLock()` makes a surviving orphan fail the next run loudly
instead of colliding silently. `UIContext`'s `localStorage` reads are wrapped
because that collision surfaced as a throw inside a `useState` initialiser.

## Track table layout

`TrackTable` has exactly one scroll container (`.track-scroll`). Everything
that stays put is `position: sticky` inside it:

- `.track-header` pins at `top: 0`; its row height is fixed to `--head-h`
  (`--track-head-h`) so group headers can pin at `top: var(--head-h)`.
- The flat list is virtualized (absolutely positioned rows inside a spacer);
  grouped views render in full.
- `.library-toolbar` — breadcrumb + the grouping and density switches — is a
  `<header>` inside `<section class="library">`, sticky at its top. Scoped to a
  sectioning element it maps to `generic`, **not** a second `banner`; jsdom's
  a11y shim gets this wrong, so don't trust a `getByRole('banner')` there.
- Ancestors (`.app-main`, `.view-content`) are `overflow: hidden` for views
  that scroll internally — `.view-content:has(> .library)`.
- Every grouping mode (album / artist / path) collapses via one `GroupToggle`
  button next to the heading, keyed by group in a `collapsedGroups` set — not
  `<details>`. Album groups put artwork outside the heading and path groups put
  an interactive breadcrumb trail inside it, and neither survives a
  `<summary>`. A collapsed group renders no rows at all, which is also why its
  collapse cannot animate (see Motion) and why it drops out of the keyboard
  navigation order.
- `data-group-key` on each group section is what ArrowLeft uses to find the
  heading to move focus to.
- **The album group heading's cover is a play button** (`.album-art-play` →
  `onPlayGroup`), which queues that album from track 1. It can be a button
  because it sits outside `<header>` and outside every row — a grouped row is
  itself a `<button>`, so a control nested in one would be invalid markup and
  silently unnested by the parser. Row thumbnails have no handler; clicking a
  row already plays it.

## Layout: list or grid

Density is the layout selector, not just a row height. `Density` is
`compact | normal | relaxed | grid-sm | grid-lg`, and `isGridDensity()` — a
type predicate, so call sites narrow — decides which component `LibraryView`
renders.

- **What a grid card is follows the grouping selector.** Ungrouped shows one
  card per track that plays on click; album / artist / path show one card per
  bucket that drills in. That is why there is no separate "browse by" control.
- Drilling in sets `UIContext.selectedGroup` (a `GroupScope`: grouping, the
  `bucketKey`, and a label) and **always renders a list**, whatever density is
  selected. Density is deliberately left untouched so backing out restores the
  chosen card size; `TrackTable.rowDensityOf()` maps a grid density to `normal`
  for the rows it has to draw meanwhile.
- **`selectedFolderPath` and `selectedGroup` compose; a playlist excludes
  both.** A playlist is its own list rather than a filter over the tree, so
  `selectPlaylist` clears the other two (`NO_SCOPE`). But drilling into a card
  narrows the folder you were already browsing: `selectGroup` keeps the folder
  and `displayTracks` applies *both* filters. Clearing the folder there made a
  card labelled "3 tracks" open 5 — the same album, but library-wide. Picking a
  different folder still drops the drill-in, since the bucket may not exist
  under it.
- `MediaCard` uses the stretched-link pattern: the heading holds the button and
  `.card-open::after { inset: 0 }` spreads its hit area over the card. A
  `<button>` takes only *phrasing* content, so `<button><h3>…</h3></button>`
  would be invalid; the play button is a *sibling*, never a descendant.
- `utils/grouping.ts` (`bucketKey`, `groupLabel`, `buildGroups`) is shared by
  `TrackTable`, `LibraryGrid` and `LibraryView`'s scope filter. It used to be
  module-private inside `TrackTable`.

## One-of-N controls

`SegmentedControl` and `Rating` are the same native pattern: `<fieldset>` +
`<legend class="sr-only">` + radios shrunk to a pixel (not `display: none`, so
they stay focusable) with `label:has(:checked)` carrying the look. A radio
group *is* a radiogroup — no `role`, no `tabIndex`, no key handlers, and arrow
navigation comes from the platform.

`SegmentedControl` generates its own radio `name` per instance: grouping and
density sit side by side, and a shared name would make them one group.

`Rating` renders its stars in reverse DOM order and flips them back with
`flex-direction: row-reverse`, which is what lets `:checked ~ label` fill every
star to the left with a plain sibling selector. A separate clear button exists
because a radio group has no uncheck gesture. `rating` was already in the
schema, the scanner and the model — only the editor was missing it.

## Keyboard browsing

Arrow keys act on whatever pane holds focus — there is no global arrow router,
and there shouldn't be one. Each pane handles its own keys, so "sidebar or
list?" answers itself.

**Sidebar** (`FolderTree` + `useTreeNavigation`) is the WAI-ARIA tree pattern:
`role="tree"` / `role="treeitem"`, one tab stop, exactly one row at
`tabIndex={0}`. Up/Down walk the *visible* nodes (a collapsed branch
contributes none), Right opens a closed node and descends into an open one,
Left closes an open node and climbs to the parent from a closed one or a leaf,
Home/End jump. It renders **flat**, not recursively: the hook already flattens
the visible nodes to do index arithmetic, and reusing that list is what
guarantees DOM order matches traversal order. Depth is `--level`, not nesting.
The chevron is a decorative `<span>` — `aria-expanded` lives on the treeitem,
so a nested button would be a second interactive node for the same job.

**Track list** navigates `visibleRows`, the ids in *render* order, not the
global sorted index. A row's index is its position in the sorted list so its
row number stays stable, but grouped views render group by group — stepping
through global indices jumped to whatever row held the adjacent number rather
than the row below. Left/Right mirror the tree: Right opens the row's group,
Left closes it and moves focus to its heading toggle. Both are no-ops in a
flat list, which has no parent to close.

Bare arrows are safe to claim: `src/keybindings/defaults.ts` only ever binds
`mod+arrow*`.

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

Two independent axes collapse the player, both in `layout.css`. Note these
apply to the **footer bar's** copy of the player — the overlay's copy is
portaled outside `.app-shell`, so every `.app-shell[…] &` rule below misses it
and it keeps the full-window layout.

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
  (72) stop being affordable, so they're hidden and the footer player takes the
  whole window — no overlay involved. `useWindowScale` uses this one for "am I
  the small window?", and closes the overlay on the way down so the same screen
  isn't stacked on itself.
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
testable, without a settings provider above it. `pickIndex()` is the one place
that knows what next/previous mean under shuffle and repeat; the `ended`
handler goes through `advanceRef` so it never closes over stale modes. See
"The playback queue" above.

Shuffle ignores direction: "previous" in a shuffled queue is another arbitrary
track, because the engine keeps no play history.

The lyrics panel replaces the progress bar and transport, and only in the
now-playing overlay — the footer bar and the mini tiers have nowhere to put a
column of text, so `.player-actions` (lyrics toggle + close) is not rendered at
all unless `expanded`, rather than being controls that do nothing. Lyrics come from the file's
tags (`common.lyrics`, synced frames flattened); there is no fetching.

The footer bar has **no volume slider** — the system volume and the full player
both already own that, and the width is better spent on the progress bar. The
`.player-volume` element still renders; the bar-mode rules hide it.

## Motion

Every UI mutation animates in **and** out. Durations live in `tokens.css`
(`--duration-fast` 180ms, `--duration` 260ms, `--duration-slow` 420ms); enters
use `--ease-emphasis` and exits `--ease-exit`, so arriving and leaving don't
read the same. `--shift-sm` / `--shift-md` are the travel distances.

Three mechanisms carry the structural transitions:

- **The player bar's height** is `--player-h`, a registered `@property` on
  `.app-player`. `display` and `flex: 1` cannot interpolate; a registered
  length-percentage can, so the bar's top edge travels rather than jumping when
  a track starts (`0px` → `--player-bar-h`, via the `:has(.player-view[data-empty])`
  retract) or when the window crosses a height tier. Now Playing is an overlay,
  so `100%` here is only ever the small-window case.
- **Now playing rises from the bottom edge** — `.overlay-dialog[data-variant='full']`
  starts at `translate: 0 var(--shift-md)` with `@starting-style`, which reads
  as the bar expanding upward. The dialog's `::backdrop` fades with it.
- **The sidebar** animates the outer `.app-sidebar`'s `flex-basis` from its
  persisted pixel width to `0`. `UIContext` exposes that width as
  `--sidebar-w` on the shell; `.library-sidebar` keeps the fixed width while
  the outer box clips it, so the contents slide out without reflowing.
- **Anything that toggles `display`** — every overlay, dialog and popover —
  pairs `transition-behavior: allow-discrete` with `@starting-style`. Without
  `allow-discrete` the outgoing element vanishes on frame one and only the
  enter would animate. On a `<dialog>` the `overlay` property needs the same
  treatment, or it leaves the top layer immediately.

Two deliberate exceptions:

- **Track rows animate colour only.** They are virtualized and re-keyed on
  every scroll tick, so an enter animation would fire on each wheel movement.
- **Group collapse is asymmetric.** A collapsed group unmounts its rows
  outright (a few hundred DOM nodes instead of a few thousand), so only
  expansion can animate; the chevron carries the collapse.

`prefers-reduced-motion` is handled twice: the blanket rule in
`components.css` flattens animations and transitions, and `tokens.css`
additionally collapses the duration tokens themselves — rules that read one
directly, like `--player-h` and the sidebar's `flex-basis`, need the token to
go to zero, not just their own `transition-duration`.

## CSS conventions

Stylesheets use **native CSS nesting** (no PostCSS in this project; Electron's
Chromium supports it), one top-level block per component with `&`-nested
variants, states and descendants. No BEM. Every length, duration, colour and
z-index resolves to a token — including the structural ones
(`--player-bar-h`, `--track-head-h`, `--settings-nav-w`, `--album-art-lg`,
the `--z-*` scale). Media-query breakpoints are the exception: they cannot
read custom properties, so each file collects them at the end with a comment
naming what the breakpoint is for.

## Waveform rendering

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
