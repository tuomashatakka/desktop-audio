# UI polish pass: library loading, empty state, theming, titlebar, player

## Context

A grab-bag of UX/visual fixes surfaced while using the app day to day: the
library gives no feedback during the very first scan (and no guidance when no
folder is configured yet), the dark-theme wash tints the whole shell pink,
the light theme's now-playing backdrop stays dark, the titlebar carries a
redundant app name next to a plain glyph "logo," the player view still shows
a volume slider that duplicates the system/footer controls, and the full
player's padding is cramped at small sizes with no way to dismiss it back to
the library. Two perf complaints (view-switch animation feel, track-list
scroll feel) are folded in as a lightweight isolation fix, not a rewrite.

Research already pinned every change to exact files/lines — this plan
executes against that, it doesn't re-derive it.

## 1. Library: background scan feedback + no-folder empty state

**Files:** `src/app/hooks/useLibraryScanner.ts`, `src/app/views/LibraryView.tsx`,
`src/app/styles/views.css`

- `useLibraryScanner` currently has no "have we ever resolved once" signal —
  `isLoading` is reused for both the very first load and every background
  rescan, and hydration's `data.load()` never touches `isLoading` at all (so
  a cold start briefly renders "No tracks found" before the first scan batch
  arrives). Add a hook-local `isInitialLoading` (`useState(true)`), flipped
  to `false` exactly once via a `markInitialResolved()` callback guarded by a
  module-level flag (same pattern as the existing `hydrated`/`lastScannedKey`
  flags at the top of the file). Call it from both the hydration `.then()`
  and the `done`/`error` branches of the `data.subscribe` callback, so it
  resolves whichever finishes first. Return `isInitialLoading` from the hook.
- `LibraryView` destructures `isInitialLoading` from `useLibraryScanner()`
  and branches its render in this order:
  1. `libraryPaths.length === 0` → the new empty-state card (below).
  2. `isInitialLoading && displayTracks.length === 0` → a spinner.
  3. existing `displayTracks.length === 0 && !isLoading` → existing "No
     tracks found" message (search/empty-playlist case, unchanged).
  4. otherwise → `TrackTable` (unchanged; its own skeleton-row logic for
     `isLoading && sorted.length === 0` still stands as the in-table loading
     treatment once paths exist and a scan is running).
- Spinner: no spinner primitive exists in the codebase today (only
  `Skeleton`). Add a small inline `.spinner` (CSS border-spin, themed via
  `var(--accent)`/`var(--border)`) in `views.css` next to the existing
  `.status-message` block — one-off markup in `LibraryView`, not a new
  atomic component, since nothing else needs it yet.
- Empty-state card (no library path configured): new markup in `LibraryView`
  modeled on the existing `.tag-editor-view.empty-state` centering pattern
  (`display:grid; place-items:center`) wrapping a small raised panel
  (`background: var(--bg-raised); border: 1px solid var(--border); border-radius:
  var(--radius-lg); box-shadow: var(--shadow-card); padding: var(--sp-8)`),
  explaining a folder needs to be added, with a `Button` (imported from
  `../components/atomic`, same barrel `PromptDialog` already comes from)
  that calls `setView('settings')` (destructure `setView` from `useUI()`,
  already imported) and sets `location.hash = '#settings-library'` so it
  lands on/highlights the Library section per the existing `:target` nav
  highlighting in `views.css`.

## 2. Neutral backgrounds (remove the pink/red tint)

**File:** `src/app/styles/tokens.css`

Two concrete sources, both currently pink/salmon with no neutral intent:
- `--shell-wash: rgb(251 89 205 / 25%)` (line 102) — baked into
  `.app-shell`'s corner gradient in *both* themes (no light override exists).
  Change to a neutral, low-alpha white/black sheen: dark stays a faint white
  glow, add a `[data-theme='light']` override with a faint black glow instead
  of inheriting the same value.
- `--ambient-2: #f090f0` / `--ambient-3: #ffafb0` (`@property` initial values,
  lines 49-59) — the ambient-wash fallback colors used before
  `useAmbientPalette` computes real colors from art (or whenever there's no
  art). Replace with neutral grays in the same family as the existing
  `--ambient-1: #606080`, e.g. `#707088` / `#8a8a9a`, so the no-art/startup
  wash reads gray instead of pink. Real album-art-derived ambient colors are
  untouched — this only fixes the neutral *default*.

`--mono-crimson`/`--danger` and the app icon's brand mark are out of scope —
the ask is about backgrounds, not semantic/danger color or the app's icon.

## 3. Light theme now-playing backdrop

**File:** `src/app/styles/layout.css`

`.album-art-bg img` (`filter: blur(60px) brightness(0.2); transform: scale(1.2)`)
unconditionally darkens the blurred album-art backdrop regardless of
`data-theme` — the one spot in the player that isn't theme-aware (everything
else already runs through `var(--bg)`/`var(--text)` tokens). Add a
`[data-theme='light'] .album-art-bg img` override with a light-appropriate
filter (e.g. `brightness(1.1) saturate(1.05)` instead of `brightness(0.2)`)
so the light theme's now-playing view gets an airy backdrop instead of a
near-black one.

## 4. Titlebar: drop the app name, real logo mark

**Files:** `src/app/layout/Titlebar.tsx`, `src/app/styles/layout.css`

- Remove `<span className='logo-text'>Desktop Audio</span>` (Titlebar.tsx:50).
- Replace the `♫` glyph in `.logo-icon` with an inline SVG built from the
  actual app icon's mark: `assets/icon.svg` is a dark rounded-square
  (`#0f0f0f`) with a crimson waveform `<polyline>` on top — there's no
  transparent-background variant anywhere in `assets/`. Inline just the
  `<polyline points="120,512 320,512 432,232 624,792 736,512 904,512">`
  (no `<rect>`) as `stroke="currentColor" fill="none"`, so it renders with a
  transparent background and picks up the existing `.logo-icon { color:
  var(--accent) }` rule for free — no new CSS needed for color.
- Clean up the now-dead `.logo-text` reference in the `@media (max-width:
  900px)` rule (layout.css:162) since the element no longer exists; leave the
  `@media (max-width: 500px) { .titlebar-logo { display: none } }` rule as is.

## 5. Search bar vertical margin

**File:** `src/app/styles/views.css`

Add `margin-block: var(--sp-2)` to `.search-input` (lines 25-29) — the
outermost class on the rendered `<label class="field search-input">`, so it
doesn't affect the toolbar's other children (density/config toggles).

## 6. Player view: drop volume, more padding, close button

**Files:** `src/app/components/composite/Player.tsx`, `src/app/styles/layout.css`

**Remove volume control entirely** (not just hide it in the full view — it's
already hidden in the footer bar via CSS, so removing the JSX removes it
everywhere): delete the `<PlayerVolume ... />` call site (Player.tsx:296-300)
and the `PlayerVolume` function (143-176). Remove the now-dead
`.player-volume` base rule and every tier-specific `display: none` override
that references it in `layout.css` (the footer-bar-hide rule, the
compact/mini-hide rule, etc.) — all of it becomes unreachable once the
element never renders.

**Close button**, patterned directly on the existing `lyrics-toggle`
(`IconButton`, top-right, gated to the full normal-tier view): wrap
`lyrics-toggle` and a new close button in a `.player-actions` flex row
(`position: absolute; top: var(--sp-4); right: var(--sp-4); display: flex;
gap: var(--sp-2); z-index: 2`) instead of positioning `lyrics-toggle`
individually, scoped by the same selector `lyrics-toggle` already uses:
`[data-view='player'][data-height-tier='normal']` — i.e. visible exactly when
the window is tall enough that chrome would otherwise show (the
`CHROME_MAX_HEIGHT` / `normal`-tier threshold `useHeightTier`/`useWindowScale`
already use elsewhere). Click handler: `setView('library')` via `useUI()`
(already available in scope via the surrounding component tree — confirm
import when implementing). Below that tier there's currently no `setView`
escape hatch at all (only the window-shrink gesture on the album art), and
this plan does not add one there — matches the literal ask ("when the
viewport is big enough").

**Padding**: bump the tightest tiers up one step on the existing spacing
scale, keeping today's shedding thresholds intact:

| Selector | Current | New |
|---|---|---|
| `.app-shell[data-height-tier='snug'] .player-content` | `padding: var(--sp-4)` | `var(--sp-6)` |
| `@container player (max-height: 420px)` (snug's compressed step) | `padding: var(--sp-2)` | `var(--sp-3)` |
| `.app-shell:is([data-height-tier='compact'],[data-height-tier='mini']) .player-content` | `padding: var(--sp-2) var(--sp-3)` | `var(--sp-3) var(--sp-4)` |

Normal tier's base padding (`var(--sp-6) var(--sp-8) var(--sp-8)`) and the
width-shedding steps (≤480px, ≤320px) are left as-is — they're already the
most generous tier, and removing the volume row already frees vertical
breathing room there for free.

## 7. Perf: view-transition/scroll feel

**File:** `src/app/styles/layout.css`; `CLAUDE.md`

- `.album-art-bg` (the permanently-mounted, always-painting 60px-blurred
  backdrop layer) has no paint containment or layer-promotion hint today.
  Add `contain: paint` to `.album-art-bg` — isolates the expensive blur's
  repaint scope from the rest of the page and reduces the cost `.player-view`
  pays every time `startViewTransition` snapshots it (it's a child of the
  `view-transition-name: player` element). This is the one concrete,
  low-risk win available without a bigger rewrite.
- Investigated but not the cause: `TrackTable`'s virtualization is handled
  entirely by `@tanstack/react-virtual`'s own scroll listener — there is no
  app-level `onScroll` handler left to throttle (the `data-header-hidden`
  collapsing-header feature `CLAUDE.md` still describes was removed in an
  earlier commit and the doc was never updated — **fix the stale section**
  in `CLAUDE.md`'s "Track table layout" section to drop that paragraph).
- Known but out of scope for this pass: grouped views (album/artist/path)
  render every row without virtualization, which is the likelier source of
  scroll jank on large libraries in a grouped mode — fully virtualizing
  variable-height grouped rows is a separate, sizable piece of work, not a
  quick fix, so it isn't included here.

## Verification

- `bun run typecheck` and `bun run lint` after each file group.
- `bun run start`, then manually:
  - Fresh-ish state: confirm the no-folder empty card appears when
    `libraryPaths` is empty, and its button lands on/highlights Settings →
    Library.
  - Add a folder, confirm a spinner (not the skeleton table, not "No tracks
    found") shows during the very first scan, and that switching tabs or a
    background rescan afterward never re-shows it.
  - Toggle dark/light theme: confirm the shell corner wash and now-playing
    backdrop both read neutral/light-appropriate, not pink/dark.
  - Check the titlebar: no "Desktop Audio" text, logo renders as the
    waveform mark with a transparent background, tinted by the accent color.
  - Open the full player at `normal` height tier: confirm no volume slider
    anywhere, a close button next to the lyrics toggle that returns to
    Library, and comfortable padding; resize through snug/compact/mini and
    confirm existing shedding behavior (art/next-button disappearing) still
    triggers at the same breakpoints, just with more breathing room.
  - Search input has visible vertical margin in the toolbar.
