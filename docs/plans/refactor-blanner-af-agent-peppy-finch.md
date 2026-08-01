# View & CSS Overhaul — semantic HTML5, CSS-driven layout, halved stylesheet

## Context

The view layer works, but it has drifted into three structural problems that
compound each other.

**1. The player is authored three times over.** `PlayerView` and `PlayerBar`
render the same six things — album art, title/artist/album, waveform, time
labels, transport, volume — in different arrangements, each with its own class
namespace and a byte-identical `formatTime`. `ExpandedPlayerPortal` (which is
*not* a portal; it has no `createPortal`) renders a **second live `PlayerView`**
inside `.app-player`. So when `currentView === 'player'` there are two
`.player-view` elements in the DOM, each its own `container-type: size` context
— meaning identical `@container` rules resolve differently for the two
instances. Two `WaveformProgress` instances also run at once: two
`ResizeObserver`s, two `requestAnimationFrame` loops.

This is exactly the "rendered conditionally to different pages" problem. The
same content is being *re-authored per location* instead of *repositioned*.

**2. The cascade layers are half-wired.** Only `tokens.css`, `reset.css`,
`base.css` and `components.css` declare `@layer` — **1,983 of 2,848 lines (70%)
are unlayered**, and unlayered rules beat *every* layered rule regardless of
specificity or order. `.player-view` (0,1,0) currently outranks `.button.primary`
(0,2,0). The `components` layer is structurally defeated by the view files,
which is why view CSS keeps re-specifying component styles. The ordering
statement `@layer tokens, reset, base, states, components, utilities;` that
`STYLE_GUIDE.md:40` documents **does not exist in any file**; the order works by
luck of `@import` sequence, and `states`/`utilities` were never created.

**3. Layout work CSS does natively is done in JS.** A `setTimeout(300)` /
`setTimeout(200)` state machine drives the expand animation and must stay
manually in sync with CSS transition durations. `Popover` hard-codes a magic
`200` px width in JS to position itself. `LibraryView:196` calls
`getBoundingClientRect()` *during render*.

**Intended outcome:** one player element that CSS repositions; semantic elements
carrying the meaning that classes currently carry; a properly layered stylesheet
around half its size.

### Decisions taken (confirmed with the user)

| Question | Decision |
| --- | --- |
| Visual scope | **Refresh while we're in there** — semantic + CSS cleanup *plus* tightening spacing/type onto the token scale. Deliberate visual drift is fine; things may shift a few px. |
| CSS organisation | **Consolidate to ~6 layered files** under the `@layer` order `STYLE_GUIDE.md` already documents. |
| Class renaming | **Rename freely, update the tests.** Drop redundant classes where a semantic element + attribute selector does the job. |

### Baseline

| | Now |
| --- | --- |
| CSS | 2,848 lines / 14 files — 1,691 load-bearing, 409 duplicated, **334 dead** |
| TSX | 3,777 lines / 32 files |
| `<div>`/`<span>` in views | ~110 |
| `data-*` attributes (the entire CSS contract) | 5 — `data-theme`, `data-height-tier`, `data-header-hidden`, `data-density`, `data-grouping` |
| Unused design tokens | 35 of 118 |
| Raw hex outside `tokens.css` | 4 (all `app.css`) |

Colour-token discipline is already good — savings come from dead code,
duplication and structural collapse, not token substitution.

---

## Constraints — do not break these

- **`.app-shell`, `.app-main`, `data-height-tier`** are asserted in
  `tests/layout/AppLayout.test.tsx:94,121,153-154`. Rename only alongside that test.
- **`useHeightTier` boundaries** are pinned by `tests/hooks/useHeightTier.test.tsx:28-41`.
  That harness overrides `window.innerHeight` and dispatches a raw `resize`
  Event — **switching to `ResizeObserver` or `matchMedia` silently breaks it**;
  jsdom provides neither and `tests/setup.ts` stubs neither.
- **Atomic class contracts** (`primary`/`ghost`/`sm`/`lg`/`icon`/`loading`/`error`)
  are asserted in `tests/components/atomic/*.test.tsx` — note these assert
  classes that the *app* never uses, so the CSS may die while the class stays.
- **`--head-h: 34px` is a hard contract.** `.track-header` pins at `top: 0`;
  group headers pin at `top: var(--head-h)`. Changing one without
  `.track-header [role=row] { height }` (`library.css:324`) breaks group stickiness.
- **`--row-h` is written from JS** (`TrackTable.tsx:320`) and must agree with
  `useVirtualizer({ estimateSize })` (`:314`) and `ROW_HEIGHT_BY_DENSITY` (`:31-35`).
  Change CSS padding without changing all three and virtual rows drift.
- **`--track-grid`** feeds both the header row (`library.css:321`) and body rows
  (`:369`). They must stay identical or columns desync.
- **The nested-flex height chain** `.app-content → .app-body → .app-main`
  (`app.css:47-70`) — every link's `overflow: hidden` is what gives
  `.track-scroll` a definite height to size `overflow: auto` against. Break any
  link and virtualization scrolling dies.
- **`.player-view` is its own `@container`**, so a container query can never
  style `.player-view` itself — its padding/gap must hang off the tier attribute.
- **The `no-drag` opt-out list** (`app.css:32-35`). Below 480px the player becomes
  an Electron drag region, which swallows clicks. `.album-art-card`,
  `.playback-controls`, `.progress-section` are opted back out. **Any control
  added to the player at these tiers must join that list or become unclickable.**
- **The mini grid-area naming trap** (`player.css:290-292`): mini reuses the
  `controls` area from the shared `compact|mini` block; that shared selector is
  more specific, so renaming the area in the mini block silently auto-places
  controls onto their own row.
- `public/` is the **marketing site**, not the app (`prosody.png`, `screenshots/`,
  its own `index.html`). Its `main.css` (29 KB) is out of scope; the app chain is
  `src/index.css` only.
- Native CSS nesting throughout with **no PostCSS plugin** — no transpile safety
  net. See `build.target` under Risks.

---

## Phase 1 — One player, repositioned by CSS

### 1.1 Collapse three implementations into one component

Create `src/app/components/composite/Player.tsx` — one semantic tree with no
layout opinion of its own:

```tsx
<article className='player'>
  <figure className='player-art'>…</figure>
  <hgroup className='player-meta'>
    <h2>{title}</h2>
    <p>{artist}</p>
    <p>{album}</p>
  </hgroup>
  <section className='player-progress'>
    <WaveformProgress … />
    <time dateTime={isoDuration(currentTime)}>{formatTime(currentTime)}</time>
    <time dateTime={isoDuration(duration)}>{formatTime(duration)}</time>
  </section>
  <menu className='player-transport'>…</menu>
  <div className='player-volume'>…</div>
</article>
```

- `<time dateTime>` replaces four `.time-label` / `.player-bar-time` spans and
  gives positions the machine-readable value they lack today.
- `<menu>` is the semantic list-of-commands element for the transport group.
- `<figure>` for art, so the fallback `♫` can be `aria-hidden` inside it.
- Album art keeps its `<button>` wrapper — it toggles window scale. Do not
  regress that to a `<div>`, and keep it in the `no-drag` list.

Export one `formatTime` from `src/app/utils/`; the two copies are identical.

Fold in the a11y gaps that live in this markup: the play/pause `<Button>` has no
`aria-label` (its accessible name is the literal `⏸`/`▶` glyph) and no
`aria-pressed`; `PlayerBar.tsx:105`'s volume `<input type='range'>` has no label
at all; `.art-fallback` / `.art-placeholder` glyphs are announced.

### 1.2 Mount it once, permanently, in the shell

Replace the `currentTrack`-gated `<PlayerBar/>` + `<ExpandedPlayerPortal/>` pair
with a single always-mounted `<Player/>` in `AppLayout`'s player slot. Add one
attribute so CSS can drive promotion:

```tsx
<div className='app-shell' data-height-tier={heightTier} data-view={currentView}>
```

`.app-player` becomes a `<footer>` (it is the shell's contentinfo). Arrangement
is then pure CSS:

```css
.player { display: grid; grid-template-areas: 'art meta transport progress volume'; }

.app-shell[data-view='player'] .player {
  grid-template-areas: 'art' 'meta' 'progress' 'transport';
}
```

`ExpandedPlayerPortal.tsx` is **deleted** — its timeout state machine, its
`expanded-player-*` classes and the `animating` / `expanded-player-visible`
toggles go with it. The `playerExpanded` axis collapses into
`currentView === 'player'`; remove `playerExpanded`, `togglePlayerExpanded`,
`setPlayerExpanded` from `UIContext`.

**Empty state stops being an early return.** `PlayerView`'s `!currentTrack`
branch and `PlayerBar`'s `return null` both disappear; one `<Player>` renders
with empty content and the shell handles the empty case in CSS. One tree, not two.

> ⚠️ `useWindowScale` calls `setPlayerExpanded(false)` (`useWindowScale.ts:36-37`)
> precisely because the click surface collapses under the user. Once
> `playerExpanded` is gone, re-check that path — it becomes a `setView` concern.

### 1.3 Animate the promotion natively

The timeouts existed to fake a morph between two elements. With one element
there's a real mechanism:

```css
.player { view-transition-name: player; }
```

Wrap `setView` in `document.startViewTransition`, feature-detected. No timing
constants either way.

> **Verify before committing.** If the transition fights the virtualized track
> table (the outgoing snapshot includes the whole scroller), fall back to a plain
> `transition` on the grid areas. The `ExpandedPlayerPortal` deletion stands
> regardless — it does not depend on this.

### 1.4 Dedupe the context menu

`composite/ContextMenu.tsx` (46 lines) is imported by **nothing**, while
`context-menu/ContextMenuApp.tsx:43-59` inlines a near-identical
`ul[role=menu] > li > button[role=menuitem]` tree plus two static inline styles
(`{position:'fixed',inset:0,zIndex:0}`, `{position:'relative',zIndex:1}`). Make
`ContextMenuApp` render `<ContextMenu>` and move those styles to CSS. A dedupe,
not a deletion — the shared classes stay live.

### 1.5 Delete genuinely dead code

- `atomic/Waveform.tsx` (73 lines) — exported from `atomic/index.ts:9`, rendered
  nowhere. Holds the only non-token colours in the component layer (`#ff5500`,
  `#ff7733`, `rgba(18,18,18,0.3)`) and does `getBoundingClientRect()` **inside a
  `requestAnimationFrame` loop**.
- `styles/waveform.css` (4 lines) — styles only that dead component.
- `App.tsx:14` `playerExpanded` and `App.tsx:17` `const host = useHost()` — both
  destructured, never used.
- `data-grouping` (`TrackTable.tsx:441`) — **no CSS rule matches it anywhere.**
  Either style it or drop it; don't leave it dangling.

---

## Phase 2 — Semantic markup pass

### 2.1 `SettingsView.tsx` — 22 divs, zero ARIA, and partly unstyled today

The biggest single win. Note the live bug: **`.library-section` and
`.about-section` do not exist in the markup** — `SettingsView.tsx:153` renders
`<section id='library'>`. So `settings.css:59-85` and `:131-136` style nothing,
and `.section-description`, `.path-list`, `.path-item`, `.about-content` are in
the DOM **receiving zero styling**. Re-parent those rules to the real elements
rather than just deleting them; this is part of the "refresh".

| Now | Becomes |
| --- | --- |
| `nav.settings-nav` + 4 loose buttons, `activeSection` in local `useState` | It is a **tablist**, not navigation. Either proper `role='tablist'`/`tab`/`tabpanel` with `aria-selected`, or — better — four `<section>`s with the panel switch done in CSS and no JS at all. |
| `div.path-list` > `div.path-item` × N | `<ul>` / `<li>` |
| `div.field` at `:182` (sibling `<span>`, unassociated `<select>`) | `<label className='field'>` — matches its own siblings at `:205`, `:259`, `:281`; fixes a real unlabelled control |
| `div.color-field` × 18 | `<li>` in `<ul className='color-grid'>` |
| `style={{ marginTop: 'var(--sp-4)' }}` at `:182` | a CSS rule |
| `div.stack.sm` × 3, `div.about-content`, `div.theme-actions` | drop; style the semantic parent |
| `<h4>`/`<h5>` with no `h1`–`h3` above | renumber to `<h2>`/`<h3>` |

The remove-path `<Button>×</Button>` has accessible name `"×"` — name the path.

### 2.2 `TagEditorView.tsx` — a form with no `<form>`

- Wrap the three `<Input>`s and the Save/Cancel `<footer>` in a real
  `<form onSubmit>` so Enter submits. `PromptDialog.tsx:19-26` shows the pattern.
- `div.file-info` (three `<p><strong>Label:</strong> value</p>`) → `<dl>`/`<dt>`/`<dd>`.
  Duration → `<time dateTime>`.
- `div.art-preview` → `<figure>`, glyph `aria-hidden`.
- Root → `<article>`.
- Bug: `useState` at `:13-17` initialises from `track` and is **never re-synced**.
  Add `key={track.id}` at the call site.

### 2.3 `Titlebar.tsx`

- Drop `div.titlebar-drag` — sole child of `<header className='titlebar'>`.
- `nav.titlebar-nav` + three bare buttons → `<ul><li>`; add **`aria-current`**
  (active state is className-only, invisible to AT).
- `div.titlebar-controls` → `<menu>`.
- `aria-hidden` on `.logo-icon` and every `.nav-icon`.
- ⚠️ `useKeyboardShortcuts.ts:59` queries `'.titlebar-controls button'` by class.
  Rename it and you must update that query — class-as-API coupling.

### 2.4 `AppLayout.tsx`

- `div.app-body` wraps `<main>` and nothing else — delete it, but **preserve its
  `flex:1; min-width:0; overflow:hidden`** on whatever absorbs it (see the height
  chain constraint above).
- `div.app-player` → `<footer>`.
- `div.app-content` stays — a genuine grid wrapper, legitimate `<div>`.
- `App.tsx:53`'s `div.view-content` sits directly inside `<main className='app-main'>`.
  Merge; one element does both jobs. Keep the
  `:has(> .library)` / `:has(> .player-view)` overflow switch (`app.css:195-210`)
  working against the merged element.

### 2.5 `LibraryView.tsx`

- `div.view-controls` → `role='toolbar'` (or `<menu>`).
- `.config-toggle` has `aria-expanded` but no `aria-controls`/`aria-haspopup`.
- ⚠️ `:196` calls **`getBoundingClientRect()` during render**, and the whole
  `<Popover>` is gated on `configBtnRef.current` — so it is absent on first paint
  and repositioned every render. Move to a layout effect, or adopt the native
  Popover API.
- `div.view-header-slot` **stays**. It is documented at `:123-124` as existing
  purely so the header can animate `1fr → 0fr`, and the child must also animate
  `padding-block` and `border-block-end-width` to zero or a 33px stub remains
  (`library.css:44-47`). Legitimate layout div.

### 2.6 `TrackTable.tsx` — leave the ARIA table, fix the seams

The docstring at `:1-17` justifies the div-based `role='table'`: a real `<table>`
cannot be virtualized or column-resized without fighting table layout. **That
reasoning is sound — do not convert it.** Fix only the defects:

- The **grouped branch breaks the ARIA table chain**: `<section>`/`<details>`/
  `<header>`/`<h3>`/`<summary>` sit *between* `role='rowgroup'` and `role='row'`,
  which is invalid. Either drop the table roles in grouped mode (it's a list of
  sections, not a table) or move the roles inward.
- Skeleton rows (`:424`) have `className='track-row'` but **no `role='row'`**,
  and their cells no `role='cell'`.
- `tabIndex={0}` on **every** row (`:338`) — use a roving tabindex.
- Rows and sortable headers activate on **Enter only** — add Space.
- `ColumnMenu` (`:238`) hand-writes `className='button ghost sm'` instead of
  `<Button variant='ghost' size='sm'>`.
- Group shapes are inconsistent: album wraps rows in `.group-rows`, path and
  artist don't. Pick one. (`.group-rows` also has **no CSS rule** — see 3.3.)

### 2.7 Dialog / Popover — native elements

- **`Dialog.tsx:45` puts `aria-hidden='true'` on the backdrop, which is the
  *parent* of the `role='dialog'` panel — hiding the entire dialog from assistive
  tech.** A live bug, not a style issue.
- `Dialog.tsx:51` hard-codes `id='dialog-title'`; two open dialogs collide. Use `useId()`.
- Both should become native `<dialog>` + `::backdrop` — brings focus trap, focus
  restore, `inert` background and Escape for free, and deletes the hand-rolled
  versions.
- `Popover.tsx` has zero `aria-*` and positions with a magic `200` px in JS
  (`:42`). Native Popover API + CSS anchor positioning removes the arithmetic.
- Bug: `.popover-panel::before` (`popover.css:15-26`) is pinned to `top: -6px`
  and **never flips for `placement='top'`** — the arrow points the wrong way.

> `<dialog>` and the Popover API are well-supported in Electron's Chromium. CSS
> anchor positioning is newer — check the shipped Chromium before relying on it.

---

## Phase 3 — CSS consolidation

### 3.1 Target structure

```
src/app/styles/
  main.css          @layer statement + @import manifest        (~20)
  tokens.css        prune 35 unused + trim banners             (~180)
  base.css          reset + element defaults merged            (~55)
  components.css    gutted to the 7 classes actually used      (~120)
  layout.css        shell, titlebar, sidebar, player           (~430)
  views.css         library, settings, tag-editor              (~650)
  utilities.css     truncate / center / surface / btn-reset    (~40)
```

`src/index.css` becomes a one-line import of `main.css`, or is dropped in favour
of importing `main.css` from `renderer.tsx:6`.

### 3.2 Fix the cascade first — before deleting anything

Add to the top of `main.css`:

```css
@layer tokens, reset, base, components, layout, views, utilities;
```

Then **wrap every unlayered file in its layer**. This is the highest-value change
in the phase: today 70% of the CSS is unlayered and beats `components`
unconditionally. Once layered, a large amount of defensive re-specification in
the view files becomes redundant and simply deletes.

Relative order is preserved, so this is a **zero-visual-change commit** — do it
on its own so any surprise is attributable.

### 3.3 Deletion, in order

**a. Dead selectors — 334 lines, zero risk.** Verified against `src/**/*.tsx`:

- `components.css` — **235 of 435 lines dead**: `.badge` + modifiers (`186-222`),
  `.card` + subparts (`224-283` — the only "card" in TSX is `.album-art-card`),
  `.alert` (`285-301`), `.tooltip` (`398-422`), `.grid` (`319-323`),
  `.input-group` (`325-350`), `.hidden` (`424-426`), `.field.success/.warning/.info`
  (`164-183` — only `.error` is used), `.button.outline` / `.danger` / `.loading`
  / `.lg` (variants exist in the type but are never passed at a call site).
- `settings.css` — `.library-section` (`59-85`) and `.about-section` (`131-136`);
  re-parent the inner rules per 2.1 rather than dropping the styling.
- `base.css` — `code` (`46-52`), `pre` (`54-61`), `h1` (`21`), `a:hover` (`42-44`).
- `tokens.css` — 35 unused custom properties.

> The atomic tests assert `.outline`, `.danger`, `.lg`, `.loading` classes. The
> *classes* keep working (they're string joins in `Button.tsx`); only their CSS
> dies. Tests stay green. Decide deliberately whether to keep them as public API.

**b. Phase-1 fallout** — `expanded-player*`, `.waveform`, and the whole
`.player-bar-*` namespace.

**c. Duplication — 409 lines.** Extract to `utilities.css` and delete the copies:
- `.truncate` — **10 verbatim copies** of the ellipsis triple
- centering — 11 copies
- button chrome reset — 10 copies, all redundant with `reset.css:41-45`
- hover treatment `--bg-hover` + `--text` — 19 sites
- panel surface — `.dialog-panel` ≡ `.popover-panel` (differ only in position/width/animation)
- `fadeIn` ≡ `backdrop-in` (byte-identical keyframes); `slideUp` ≈ `panel-in` ≈ `popover-in`
- disclosure caret rotate-90 — 3 near-identical implementations
- `list-style: none` / `margin:0;padding:0` — redundant with `reset.css:2-6,37-39`
- footer action rows — `.prompt-actions` ≡ `.footer-actions` ≡ `.card footer`
- `prefers-reduced-motion` — 4 blocks; the global one at `components.css:428`
  already covers two of them

**d. Collapse the `player.css` specificity ladders.** Six variants each of
`.album-art-card { width }`, `.playback-controls .play-pause-btn { … }`, and
`.player-info .track-title { font-size }`. Replace all three families with
custom properties (`--art-size`, `--play-size`, `--title-size`) set once per
tier: `player.css` 459 → ~250. This also removes the specificity ladder the file
documents at `:147-158`.

**e. Flatten nesting.** `settings.css` is one 154-line block nested **5 levels
deep**; `library.css` has similar chains. Two levels max, merging siblings with
`:is()`.

**f. Trim banner comments** (~200 lines of ASCII headers). **Keep the
explanatory ones** — `library.css:29-34`, `library.css:316-318`,
`player.css:147-158`, `player.css:288-292`, `app.css:425-435` encode
hard-won knowledge and belong in the file.

### 3.4 Fix what the audit surfaced as inverse-dead

Classes present in TSX with **no CSS rule at all** — each is either a missing
style or a stale class to remove: `group-rows`, `prev-btn`, `volume-control`,
`volume-value`, `mono`, `text-sm`, `track-group path`, `placement-top`/
`placement-bottom`, `asc`/`desc`. Resolve each explicitly; don't leave them.

### 3.5 Token tightening (the "refresh")

- **Stale colour:** `popover.css:50` uses `rgba(255,0,110,0.1)` — that's the *old*
  danger; current is `#ff2e7e` (`tokens.css:81`). Route to `--danger-muted`.
- **Fold the 4 raw hex in `app.css`** into `tokens.css` (incl. `#fb59cd40`).
- **Merge the radius tokens.** `--radius-xs`, `--radius-sm`, `--radius` are all
  `0`; `--radius-lg`/`--radius-xl` are both `2px`. The flat/sharp look is
  deliberate — collapse five tokens to two rather than restyling.
- **Add `--sp-0.5`** (2px) — currently hand-written at five sites.
- **Add `--titlebar-h`** — `40px` appears three times as a coincidental collision
  (titlebar height, art size, close button).
- Route the ad-hoc `px` in `app.css` (27), `library.css` (38) and `player.css`
  (53) onto `--sp-*`. **Except** container/media-query thresholds, which must
  stay literal.
- Unify focus rings — `2px` in `base.css:69` vs `1px` at `library.css:233,341,379`.
- Replace `transition: all` (6 sites) with explicit properties — it currently
  animates `box-shadow` and `background-position` too.
- Drop the `::-webkit-scrollbar` block (`base.css:73-89`) in favour of
  `scrollbar-width`/`scrollbar-color`; Chromium has supported them since 121.
  Apply to `.library-sidebar`, which currently has neither.

### 3.6 Realistic budget — corrected

| Pass | Lines | Risk |
| --- | ---: | --- |
| Baseline | 2,848 | |
| **Mechanical** — dead selectors, unused tokens, dedupe keyframes/panels, reset-redundant declarations | **−716 → ~2,130** | **zero visual risk** |
| **Structural** — utilities extraction (−80), `components.css` gutted to the 7 used classes (−80), `player.css` custom properties (−60), flatten nesting (−70), trim banners (−120) | **−410 → ~1,720** | moderate |
| Phase-1 fallout — `.player-bar-*` namespace + `expanded-player` | **−250 → ~1,470** | tied to Phase 1 |

**≈ 1,450–1,500, or 48% down.** The ~1,400 target is reachable but *only* with
all three passes. Two honest notes:

1. The single biggest win — 235 dead lines in `components.css` — is **independent
   of the player merge**. It can ship first, on day one.
2. Getting under ~1,700 means touching `library.css` and `player.css`, which is
   where all the real risk lives. Screenshot every tier and breakpoint before and
   after that pass.

---

## Sequencing

Phases 1 → 2 → 3, because Phase 3's deletions are only safe once markup has
stopped referencing those classes. Suggested commits:

1. Delete dead code (1.5) + dedupe context menu (1.4) — no behaviour change.
2. **Delete the 334 dead CSS lines** — pull this forward; it's independent and zero-risk.
3. Unify the player component (1.1).
4. Mount once + CSS repositioning, delete `ExpandedPlayerPortal` (1.2); update
   `AppLayout.test.tsx`.
5. View transition (1.3) — separable; drop if it fights the virtualizer.
6. Semantic pass per view (2.1 … 2.7), one commit each.
7. `@layer` statement + wrap unlayered files (3.2) — **isolated commit**.
8. Consolidate to six files + dedupe (3.1, 3.3a–c).
9. `player.css` custom properties + flatten (3.3d–f) — screenshot-verified.
10. Inverse-dead resolution (3.4) + token tightening (3.5).

---

## Verification

After every commit — the suite is fast:

```bash
bun run typecheck && bun run lint && bun run test
```

Then exercise the real app, because **no automated check covers CSS at all**:

```bash
bun run start
```

Manual checks, in priority order:

1. **Player promotion** — play a track, switch Library ↔ Player. Confirm **one**
   `.player` element in the DOM (not two), the transition is smooth, and the
   waveform stays interactive in both arrangements.
2. **Height tiers** — resize through 480 → 300 → 160 px tall. Titlebar, footer
   and sidebar shed at 480; layout restacks at 300; only the next button survives
   at 160. **The album-art button must still toggle window scale** — verify it
   isn't swallowed by the drag region.
3. **Width shedding** — narrow the window. Album art goes at 260px, next button
   at 180px, and the title marquee still animates with no JS.
4. **Track table** — scroll a large library: header pins, group headers pin below
   it at exactly `--head-h`, view header collapses on scroll-down, virtual rows
   stay aligned. Resize and reorder columns. All three densities, all four
   groupings.
5. **Both themes** — toggle dark/light; the ambient wash must still cross-fade
   between tracks (`@property`-registered `--ambient-1/2/3`) and must not blow
   out to white on light (the `screen`→`multiply` flip).
6. **Keyboard** — tab the whole app. Every control reachable, focus visible,
   Escape closes dialogs and popovers, Space *and* Enter activate rows and
   sortable headers.

Screenshot-compare each view before and after Phase 3 — that phase has no test
coverage whatsoever.

---

## Risks

- **`build.target` is undeclared.** Vite 8 defaults to
  `baseline-widely-available`, and lightningcss minifies against that — *narrower*
  than the Electron Chromium the app runs on. The codebase already leans on native
  nesting and container queries; this refactor adds `:has()`, `<dialog>`, possibly
  view transitions and anchor positioning. For features baseline doesn't cover,
  lightningcss may **drop** rather than lower them. **Pin `build.target` /
  `build.cssTarget` to the real Chromium version in `vite.renderer.config.ts`
  before Phase 3.** Cheap, and it de-risks everything downstream.
- **No CSS is verified by anything.** No stylelint; Vitest defines no `css`
  option so styles never load in tests. `tests/screenshots.spec.ts.disabled` and
  two Playwright configs exist — re-enabling that harness would pay for itself here.
- **`tests/` is neither linted nor typechecked** (`eslint.config.mjs:357` ignores
  it; `tsconfig.json` `include` omits it). Test edits are caught only by actually
  running `bun run test`.
- **`AppLayout.test.tsx` hand-builds the full `UIProvider` value five times.**
  Removing `playerExpanded` means touching all five, and they have **already
  drifted** — only `:129-148` includes `previousView` and `setPlayerExpanded`.
  Extract a shared factory while you're in there.
- **`bun test` vs `vitest`.** `package.json` maps `test` → `vitest run`, but
  `bunfig.toml`, `tests/bun-preload.ts` and `tests/bun-dom-setup.ts` suggest a
  parallel Bun-runner path. Confirm which is authoritative before trusting green.
- **`useWindowScale`, `PlayerView`, `PlayerBar` and `ExpandedPlayerPortal` have
  no tests at all.** Phase 1 is the largest change here and is caught only by
  `AppLayout.test.tsx`'s shell-level assertions. Add a `Player` render test as
  part of 1.1, not after.
- `app.css:478-479` uses `!important` on `body::before` (`position: fixed`,
  `display: block`) for unclear defensive reasons. Test whether it's still needed
  before carrying it forward.
