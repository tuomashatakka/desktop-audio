# Fix: duplicate overlay close, light-theme control colours, broken grid

## Context

Three visual regressions reported from screenshots, two of them landed by
`73166dc` (the frequency-spectrum commit):

1. **Two close buttons in the now-playing overlay.** `OverlayHost` passes
   `closeButton` to the player's `Overlay` *and* `Player`'s `PlayerActions`
   renders its own `.player-close`. Two `✕`es, same `closeOverlay`.
2. **Wrong icon colour in light theme** on the frequency-spectrum button and
   the prev/next transport arrows.
3. **The grid view is a mess** — one card's artwork renders ~3× its track
   width and paints over its neighbours, blowing out the row height.

The intended outcome is that the overlay has exactly one close affordance,
every control in the player follows the theme at a deliberate tier, and a grid
card is the same size whatever its title says.

---

## Fix 1 — one close button

`.player-close` stays; the generic `.overlay-close` goes. It is the documented
arrangement (CLAUDE.md, "Now playing: what fills the middle" — close sits in
`.player-actions` beside the mode buttons), it is what
`tests/components/composite/Player.test.tsx:105` asserts, and grouping it with
the mode buttons is what the layout already positions.

**`src/app/layout/OverlayHost.tsx:29`** — drop the `closeButton` prop from the
`player` overlay only. Settings and the tag editor keep theirs; the
`OverlayHost` close test (`tests/layout/OverlayHost.test.tsx:61`) drives the
tag editor, so it is unaffected.

Add a regression test to `tests/layout/OverlayHost.test.tsx`: with
`overlay = 'player'`, `screen.queryAllByRole('button', { name: /close/i })`
returns exactly one. The existing `player` mock renders a stub, so assert on
`document.querySelectorAll('.player-overlay .overlay-close').length === 0`
instead if the stub carries no button.

---

## Fix 2 — light-theme control colours

### Root cause

`Icon` always renders `stroke='currentColor'` and `IconButton` only ever emits
`.button.icon`, whose sole colour declaration is `color: inherit`
(`components.css:17`). Any control that never sets an explicit `color` inherits
up to `body { color: var(--text) }` (`base.css:32`). Dark theme hides it
(`--text: #f4f4f8` vs `--text-muted: #8888a0`); light theme snaps it to `#111`.
Play/pause escapes only because `.button.primary` pins `--accent-contrast`,
which the light block never redefines.

Three controls forgot their colour. All fixes are in
**`src/app/styles/layout.css`**:

- **`:539` `:is(.prev, .next) > button`** — add `color: var(--text-dim)` and
  `color: var(--text)` to the existing `&:hover:not(:disabled)` block. This
  establishes the intended three tiers: play/pause accent → prev/next dim →
  shuffle/repeat muted. The `transition` already lists `color`.
- **`:588`** — add `.visualizer-toggle` to the
  `:is(.lyrics-toggle, .player-close)` list.
- **`:595`** — widen to
  `:is(.lyrics-toggle, .visualizer-toggle)[aria-pressed='true']` so the
  spectrum button gets the same accent-when-active signal as lyrics.

### Legibility scrim

Correct tokens are not sufficient: `layout.css:440` gives light theme
`brightness(1.1) saturate(1.05)` on `.album-art-bg img`, so the backdrop is the
real cover art. A dark cover under the light theme leaves `#111` text on a dark
field — exactly the screenshot. Add a scrim that pushes the backdrop toward the
active theme's own surface luminance.

**`src/app/styles/tokens.css`** — two tokens per theme, beside the existing
`--wf-*` / `--shell-wash` structural tokens:

```css
:root                { --art-scrim-strong: rgb(0 0 0 / 45%);       --art-scrim-soft: rgb(0 0 0 / 15%); }
[data-theme='light'] { --art-scrim-strong: rgb(255 255 255 / 72%); --art-scrim-soft: rgb(255 255 255 / 40%); }
```

**`src/app/styles/layout.css:425`** — inside the existing `.album-art-bg`
block, after the nested `img` rule:

```css
&::after {
  position: absolute;
  inset: 0;
  content: '';
  background: linear-gradient(
    var(--art-scrim-strong),
    var(--art-scrim-soft) 45%,
    var(--art-scrim-strong));
}
```

Symmetric because chrome sits at both edges — `.player-actions` at the top,
progress and transport at the bottom — while the middle is the artwork or the
active panel. `.album-art-bg` already has `position: absolute` and `z-index: 0`
and `.player-content` sits at `--z-player`, so the scrim lands over the art and
under every control with no new stacking rules. It also inherits the
`display: none` the small-window tier already applies at `layout.css:968`.

---

## Fix 3 — the grid

### Root cause

Nothing is missing from `.card-cover` — it already declares
`width: 100%; aspect-ratio: 1; object-fit: cover`. The failure is **grid items'
automatic minimum size**.

`.card-open` is `white-space: nowrap`, so a very long album title has a large
min-content width. `.card-title` is a grid item of `.media-card`, and
`.media-card` sets no `grid-template-columns`, so its implicit column is `auto`
— sized to at least the largest min-content contribution of its items. The
column therefore grows to the untruncated title, `.card-cover { width: 100% }`
faithfully paints an image that wide, and the `<li>` (also `min-width: auto`)
refuses to shrink back into its 128px track. Every symptom follows: oversized
art, a title that is the only text in the screenshot *not* ellipsised, a row
~300px tall, and art painted under the neighbouring card's text.

This is why only the card titled `ighty liteepspspspspps shineee
I_12-01-25_08-08-24` is broken while its neighbours are correct.

**`src/app/styles/components.css:490`** — add to `.media-card`:

```css
grid-template-columns: minmax(0, 1fr);
```

That is the load-bearing line: it lets the column collapse below its items'
min-content, so `.card-open` and `.card-sub` actually use the
`overflow: hidden` / `text-overflow: ellipsis` they already declare.

**`src/app/styles/views.css:201`** — add to `.library-grid`:

```css
> li { min-width: 0; }
```

Defensive, and the same idiom `views.css:174` already uses for the breadcrumb
list items. Do **not** add `overflow: hidden` to `.media-card` — it would clip
the `outline-offset: 2px` focus ring at `components.css:531`.

### Two small correctness tidies in the same area

- **`views.css:330` vs `components.css:501`** — `.album-art` sits in
  `@layer views`, `.media-card .card-cover` in `@layer components`, so the
  later layer wins regardless of specificity and the placeholder background is
  `--bg-hover`, not the intended `--bg-input`. `.album-art` already supplies
  `aspect-ratio` and `object-fit`, so drop those two duplicated declarations
  from `.card-cover` and let it carry only what is card-specific (`width`,
  radius, shadow, background) — resolving the background by removing the
  conflict rather than by fighting the layer order.
- **`src/app/components/atomic/AlbumArt.tsx:6`** — the docstring credits
  `.album-art` in views.css with "always square, always cropped". True for
  aspect/crop, false for sizing, which comes from each caller's class. Correct
  the sentence while the reason is fresh.

---

## Files touched

| File | Change |
|---|---|
| `src/app/layout/OverlayHost.tsx` | drop `closeButton` on the player overlay |
| `src/app/styles/layout.css` | prev/next colour, `.visualizer-toggle` in both selector lists, `.album-art-bg::after` scrim |
| `src/app/styles/tokens.css` | `--art-scrim-strong` / `--art-scrim-soft`, per theme |
| `src/app/styles/components.css` | `.media-card` grid column; trim `.card-cover` duplicates |
| `src/app/styles/views.css` | `.library-grid > li { min-width: 0 }` |
| `src/app/components/atomic/AlbumArt.tsx` | docstring correction |
| `tests/layout/OverlayHost.test.tsx` | one-close-button regression test |
| `CLAUDE.md` | see below |

Apply the CSS edits with a script (`sed`/`perl -0777`) rather than by hand —
they are six small, well-anchored substitutions.

## Documentation

- **CLAUDE.md, "Now playing: what fills the middle"** — state that the close
  button belongs to `.player-actions` and the player overlay therefore does
  *not* take `Overlay`'s `closeButton`, so the next person does not re-add it.
- **CLAUDE.md, "Ambient wash"** or "Player tiers" — note the scrim and why:
  the light theme brightens the cover instead of dimming it, so the backdrop's
  luminance is the artwork's, and chrome needs a guaranteed floor.
- **CLAUDE.md, "Layout: list or grid"** — one line on `minmax(0, 1fr)`: a card
  is a grid whose column must be allowed to collapse, or a long title sets the
  card's width.

## Verification

1. `bun run test` — expect green, including `Player.test.tsx` (`Close player`
   still present) and the new `OverlayHost` assertion.
2. `bun run typecheck` && `bun run lint` — CSS-only changes plus one prop
   removal, so no new warnings beyond the 36 known
   `react-strict/prefer-no-use-effect`.
3. `bun run start`, then in the app:
   - Open Now Playing → **exactly one `✕`**, sitting with the spectrum and
     lyrics buttons.
   - Toggle Settings → Appearance → light theme, with Now Playing open over a
     **dark** cover: spectrum / lyrics / close read as one muted tier,
     prev/next a step brighter, title and times legible against the scrim.
     Repeat over a **bright** cover, then repeat both in dark theme.
   - Press the spectrum button → it takes the accent colour like lyrics does.
   - Library → density `grid-sm` and `grid-lg`, grouping `album` and `none`:
     every card identical in size, every over-long title ellipsised, no art
     overlapping a neighbour, uniform row heights. Scroll the folder from the
     screenshot specifically — it holds the pathological title.
4. Sanity-check the track table and the mini player, since `.album-art` and
   `.card-cover` were both touched: row thumbnails still `--art` wide, the
   mini-player `.album-art-card` art still fills its box.
