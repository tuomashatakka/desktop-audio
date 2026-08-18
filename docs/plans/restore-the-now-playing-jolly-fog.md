# Now playing restored, styling collapsed to one token contract

## Context

Four things are being asked for at once, and they turn out to be the same change
seen from four sides.

**1. The now-playing view has drifted off its own screenshot.**
`assets/screenshots/now-playing-lyrics.png` (added in `59bba5a`) is the reference:
an editorial page — type column on the left, a full-bleed 3D waterfall mesh
bleeding across the middle, lyrics marked onto the right like highlighter over a
page, transport centred at the bottom, no artwork on screen. The **uncommitted**
`layout.css` diff (implementing `docs/plans/fix-the-now-playing-whimsical-giraffe.md`)
moves away from that: the mesh becomes an in-flow flex item that grows the column
instead of bleeding behind it, and the artwork recedes to a thumbnail instead of
leaving. That is the drift to undo.

**2. The CSS is not messy — it is *fragmented*.** The audit (`docs/plans/refactor-blanner-af-agent-peppy-finch.md`)
already landed its layering phase: `@layer tokens, reset, base, components, layout,
views, utilities` is real, there is no Tailwind, no CSS-in-JS, no PostCSS, and
`font-family` is already 100% tokenised. The remaining debt is narrower and nastier:

- **Three independent enumerations of "the theme's tokens"** — `tokens.css:61` `:root`,
  `tokens.css:202` `[data-theme='light']`, and `CUSTOM_THEME_VARIABLES` in
  `src/app/utils/theme.ts` — kept in sync by hand.
- **Theme tokens leaking into `layout.css`** — two more `:root` blocks (`:385`, `:432`)
  and two more `[data-theme='light']` blocks (`:398`, `:462`) declaring
  `--ambient-*`, `--lyrics-*`, `--matrix-blend`, `--controls-blend`.
- **~10 breakpoint blocks in `layout.css` redeclaring the same six variables**
  (`--art-size`, `--play-size`, `--play-glyph-size`, `--title-size`, `--content-gap`,
  `--content-pad-*`) at different pixel values. This is the single largest duplicated
  pattern in the codebase and the reason `layout.css` is 2,126 lines.
- **Two dead token references** — `components.css:662,707` use `var(--shadow-sm)` /
  `var(--shadow)`; neither is ever defined.
- **An unwritten "elevated surface" recipe** copy-pasted across `.popover-panel`,
  `.media-card`, `.album-art-card`, `.dsp-panel`, `.library-empty-card`, and four
  near-identical `mask-image` fade recipes.

**3. The ambient wash exists but is one flat gradient.** `useAmbientPalette.ts`
already samples the art into a 24² canvas and writes `--ambient-1/2/3`; `layout.css:405`
already renders it as a fixed `body::before`. It is the right architecture producing
an underwhelming result — one `linear-gradient`, no motion, no depth, no grain, and
crucially **the accent colour ignores it entirely** (`useAppearance.ts:58` writes a
user-picked `--accent` with no knowledge of what is playing).

**4. Type is stuck.** Only Montserrat is actually bundled (`src/app/styles/fonts/`,
4 OTFs); `poppins`/`helvetica` resolve to whatever the OS happens to have, and the
`@font-face` for `SofiaProLight.ttf` points at a file that isn't in the repo.

**Intended outcome:** one token contract in one file that every theme, the custom
theme editor, and the new appearance settings all read from; a `layout.css` roughly
half its size because the tier blocks became `clamp()`; the screenshot's now-playing
page back, with lyrics and chords recoloured to the app's own palette instead of
borrowing a hardcoded white; a genuinely alive album-art-driven backdrop; and an
accent that comes from the record you're listening to.

---

## Decisions taken (confirmed with the user)

| Question | Decision |
| --- | --- |
| Restore fidelity | **Re-implement** the screenshot's layout on top of current code — not a git revert. Every function added in `facee9f` / `59bba5a` / `fe27cdb` stays. |
| Lyrics | **Keep the current rendering** (highlighter-marker `<pre>` overlay, `useLyricsScroll` auto-scroll + takeover). Only the *colours* change — theme-derived instead of hardcoded white. |
| Chords | **Keep the current sliding `.chord-ribbon`**. Recolour to the app palette; stop borrowing `--lyrics-marker`. |
| Backgrounds | **Layered ambient wash** — multi-radial mesh from an extracted palette + blurred art layer + grain + vignette, slow drift, crossfade on track change. |
| Fonts to bundle | **Space Grotesk, Geist (+ Geist Mono), Departure Mono**, alongside the existing Montserrat. |
| New settings | Accent source + background intensity; density + corner radius; theme dark/light/**auto**. |
| Workload | Delegate the mechanical bulk to local `opencode` via the `delegate-local` skill. |

### Assumptions being made (flagged, not blocking)

- **`monoFont` is added as a new setting.** The user's settings selection didn't
  include the "font family" option, but that option described settings that already
  exist (`uiFont`, `fontScale`) — and the top-level request explicitly asks for
  multiple bundled font options. Mono is a distinct role here (bpm / hz / key /
  DSP readouts), so it gets its own picker. `uiFont`'s existing options are extended
  in place.
- **Font files are fetched from the network** (Google Fonts + the Departure Mono
  GitHub release). All three are OFL and redistributable. If the machine is offline
  the font phase stalls; everything else is independent of it.
- **This partially reverts in-progress work.** The uncommitted `layout.css` diff is
  the layout-tuning tail of the whimsical-giraffe plan. Its *state model* (two views
  + two composable layers, `dspOpen`, `AnalysisReadout`) landed in `fe27cdb` and is
  **kept in full**. Only the mesh-in-flow and artwork-thumbnail layout choices are
  undone, because they are precisely what moved the page off the screenshot.

---

## What already exists — reuse, do not rebuild

| Need | Already there |
| --- | --- |
| Palette extraction from art | `src/app/hooks/useAmbientPalette.ts` — `extractPalette()` (canvas quantiser), `useAmbientPalette()` |
| Artwork over IPC + cache | `src/app/hooks/useArtwork.ts`, `src/main.ts:704` `library:artwork`, `src/preload.ts:69` |
| Reactive backdrop | `layout.css:405` `body::before`, `@property --ambient-1/2/3` in `tokens.css:43` |
| Accent application | `src/app/hooks/useAppearance.ts` — `applyFont` / `applyScale` / `applyAccent` |
| Settings store + persistence | `src/app/contexts/SettingsContext.tsx` (localStorage, `normalize*` sanitisers) |
| Theme derivation | `src/app/utils/theme.ts` `resolveCustomTheme()`, `src/app/hooks/useThemeApply.ts` |
| Font bundling | Drop files in `src/app/styles/fonts/`, `@font-face` with `url("./fonts/…")` — Vite's CSS asset pipeline handles it, **no forge/vite config change needed** |
| Lyrics scroll | `src/app/hooks/useLyricsScroll.ts` |
| Reduced motion | `tokens.css:227` collapses all duration/shift tokens — keep this pattern, extend it |

---

## Phase 0 — Baseline (do first, do not skip)

```bash
bun run lint && bun run typecheck && bun run test
git add -A && git stash push -m "wip-layout" && git stash apply   # recoverable baseline
wc -l src/app/styles/*.css                                        # record: 4094 total
```

Record the current line counts. Every later phase reports against them.

---

## Phase 1 — One token contract  ⟶ delegated (D2)

**Files:** `src/app/styles/tokens.css`, `src/app/styles/layout.css`, `src/app/utils/theme.ts`

1. **Move every theme-dependent declaration out of `layout.css` into `tokens.css`.**
   The four blocks at `layout.css:385`, `:398`, `:432`, `:462` fold into the existing
   `:root` and the single `[data-theme='light']` block. Afterwards the invariant is:
   **no `:root` and no `[data-theme=…]` selector exists outside `tokens.css`.** That
   invariant gets a test in Phase 7.

2. **Make spacing one knob.** Replace the eight literal `--sp-*` values with
   `--sp-unit: 4px` and `--sp-N: calc(var(--sp-unit) * N)`. Density then costs one line:

   ```css
   [data-ui-density='compact']     { --sp-unit: 3px; }
   [data-ui-density='comfortable'] { --sp-unit: 4px; }
   ```

3. **Make corners one knob**, same shape:

   ```css
   [data-corners='sharp'] { --radius: 0; --radius-lg: 2px; --control-radius: 0; }
   [data-corners='soft']  { --radius: 6px; --radius-lg: 12px; --control-radius: 8px; }
   ```

4. **Kill the dead references.** Define `--shadow-sm` or route `components.css:662,707`
   to `--shadow-card`. Collapse `--shadow-lg` / `--shadow-card` if they are within
   noise of each other; collapse `--art-scrim-strong` / `--art-scrim-soft` / `--overlay`
   to one scrim + an alpha.

5. **Add the art tokens** (Phase 3 consumes them), registered so they interpolate:

   ```css
   @property --art-vibrant { syntax: '<color>';  inherits: true; initial-value: transparent; }
   @property --art-muted   { syntax: '<color>';  inherits: true; initial-value: transparent; }
   @property --art-dark    { syntax: '<color>';  inherits: true; initial-value: transparent; }
   @property --art-light   { syntax: '<color>';  inherits: true; initial-value: transparent; }
   @property --art-lum     { syntax: '<number>'; inherits: true; initial-value: 0.5; }
   ```

6. **Recolour the borrowed literals.** `--lyrics-marker` is currently
   `rgb(255 255 255 / 58%)` / `rgb(17 17 17 / 78%)`. Derive both from the theme:

   ```css
   --lyrics-marker: color-mix(in oklab, var(--text) 62%, transparent);
   --lyrics-ink:    color-mix(in oklab, var(--bg) 88%, var(--accent));
   ```

7. **`CUSTOM_THEME_VARIABLES` in `theme.ts` must list exactly the names declared in
   `tokens.css`'s `:root`** — no more, no fewer. This is the third enumeration; it
   stays (TS can't read CSS) but Phase 7 fences it with a test.

**Budget:** `layout.css` −80, `tokens.css` +60, net ≈ −20 lines but the fragmentation
is gone. Zero visual change — ship it as its own commit so any surprise is attributable.

---

## Phase 2 — Fluid scale + shared recipes  ⟶ delegated (D3, after D2)

**Files:** `src/app/styles/layout.css`, `src/app/styles/utilities.css`, `src/app/styles/components.css`

1. **Collapse the ~10 breakpoint blocks into `clamp()` on container units.** One
   declaration block on `.player-view` replaces the tier ladder at `layout.css:575`,
   `:1657-1660`, `:1687`, `:1823-2033`:

   ```css
   .player-view {
     --art-size:     clamp(48px, 24cqi, 340px);
     --play-size:    clamp(40px, 9cqi,  72px);
     --title-size:   clamp(var(--text-lg), 4.4cqi, var(--text-3xl));
     --content-gap:  clamp(var(--sp-2), 2.6cqi, var(--sp-8));
     --content-pad-block:  clamp(var(--sp-6), 12cqh, 24vh);
     --content-pad-inline: clamp(var(--sp-6), 14cqi, 20vw);
   }
   ```

   **Keep `[data-height-tier]` / `@container` blocks only where the layout
   *rearranges*** — art becoming a full-bleed banner, lyrics stacking under the
   column, transport collapsing. Delete every block whose entire body is a size ramp.
   Container/media-query *thresholds* stay literal px; that is correct.

2. **Extract the elevated-surface recipe** into `utilities.css`, applied via
   `:where()` so it never wins a specificity fight:

   ```css
   .surface {
     background: var(--bg-raised);
     border: 1px solid var(--border);
     border-radius: var(--radius-lg);
     box-shadow: var(--shadow-card);
   }
   ```

   Apply to `.popover-panel`, `.media-card`, `.album-art-card`, `.dsp-panel`,
   `.library-empty-card` and delete the copies.

3. **Extract the fade mask.** Four near-identical `mask-image: linear-gradient(…)`
   recipes (`layout.css:912`, `:1263`, `:1723`, one in `components.css`) become:

   ```css
   .fade-y {
     --fade-start: 0%;
     --fade-end: 12%;
     mask-image: linear-gradient(to bottom,
       transparent var(--fade-start), #000 var(--fade-end),
       #000 calc(100% - var(--fade-end)), transparent 100%);
   }
   ```

4. Replace any `transition: all` with explicit properties. Route the long tail of
   one-off `px` onto `--sp-*` where it is genuinely spacing; leave borders/outlines
   at `1px`/`2px` — that is a convention, not a magic number.

**Budget:** `layout.css` 2,126 → **≈ 1,100–1,300**. This is where most of the
"drastically simplify" ask is actually paid.

---

## Phase 3 — Layered ambient wash + art-derived accent  ⟶ Claude

**Files:** `src/app/hooks/useAmbientPalette.ts`, `src/app/hooks/useAppearance.ts`,
`src/app/App.tsx`, `src/app/styles/layout.css` (ambient block only)

### 3.1 Upgrade the extractor

`extractPalette` currently returns three colours ordered dark→mid→light. Widen it to
return **roles**, not an ordering:

```ts
interface ArtPalette {
  readonly vibrant: string   // highest chroma at mid lightness — this becomes the accent
  readonly muted:   string   // mid chroma, the mesh's second stop
  readonly dark:    string   // lowest lightness bucket
  readonly light:   string   // highest lightness bucket
  readonly lum:     number   // 0–1 mean luminance, drives auto-scrim strength
}
```

Bump `SAMPLE_SIZE` 24 → 32, score buckets on `population × chroma` for `vibrant`
(rejecting anything below a minimum chroma so greyscale covers fall through cleanly),
and keep the existing `track.coverColor` fallback path exactly as-is — its docstring
explains why it is *only* a fallback, and that reasoning still holds.

### 3.2 One writer for `--accent`

`useAmbientPalette` and `useAppearance` both write to `document.documentElement`.
Two writers for one property is a race. **Change `useAmbientPalette` to return its
palette** and let `App.tsx` feed it into `useAppearance`:

```tsx
const artPalette = useAmbientPalette()
useAppearance({ theme, uiFont, monoFont, fontScale, accent, accentSource, artPalette })
```

`applyAccent` gains one branch, keeping its existing custom-theme guard untouched:

```
theme === 'custom'                         → return (unchanged; the picker owns it)
accentSource === 'artwork' && artPalette   → accent = contrastLift(artPalette.vibrant, bg)
otherwise                                  → accent = accentDark / accentLight
```

`contrastLift` walks lightness in OKLCH until the swatch clears ~3:1 against `--bg`,
so a near-black cover can't produce an invisible accent. `--accent-hover` /
`--accent-contrast` keep deriving from it exactly as they do now — which means the
chord ribbon, EQ curve, mesh stroke, meters and the play button all follow the
artwork for free, because `layout.css` never hardcodes a colour.

### 3.3 The wash itself

Replace the single `body::before` linear-gradient with a two-pseudo stack:

- **`body::before` = the mesh.** Three or four `radial-gradient`s from
  `--art-vibrant` / `--art-muted` / `--art-dark`, positioned via `@property`-registered
  `<percentage>` custom properties and animated by a slow (~40s) `drift` keyframe.
  Because the colours are `@property` colours, **the track-change crossfade is free** —
  the existing `transition: --ambient-* var(--duration-slow)` already interpolates them.
- **`body::after` = blurred art + grain + vignette.** `background-image` stacks
  `var(--art-image)` (a `url(data:…)` the hook writes) under a tiled grain gradient,
  with `transform: scale(1.4)`, `filter: blur(var(--art-blur-bg)) saturate(1.35)`,
  and an inset vignette. Its opacity is `calc(var(--ambient-strength) * 0.35 * (1 - var(--art-lum) * 0.4))`
  — bright covers auto-dim so lyrics and the mesh stay legible.

`background-image` is not interpolable, so the art layer needs a one-frame JS assist:
the hook drops `data-art-state="swapping"` on `<html>`, sets the new image, and clears
it on the next frame. That is ~6 lines and it is the only part of this the platform
genuinely cannot do alone.

`prefers-reduced-motion` already collapses `--duration-*` and `--shift-*` in
`tokens.css:227`; extend the same block to set `--ambient-drift-dur: 0s`.
`--ambient-strength` becomes settings-driven (Phase 5).

---

## Phase 4 — Restore the now-playing page  ⟶ Claude

**Files:** `src/app/styles/layout.css` (player section),
`src/app/components/composite/Player.tsx`, `src/app/components/composite/AnalysisReadout.tsx`

Reference: `assets/screenshots/now-playing-lyrics.png`. Deltas against the current
working tree, all of which are **layout, none functional**:

| # | Restore to | Currently (uncommitted diff) |
| --- | --- | --- |
| 1 | `.frequency-matrix` absolutely positioned, full-bleed, mesh bleeding across the middle and *behind/over* the type column | in-flow flex item (`flex: 1 1 auto`) that grows the column |
| 2 | Artwork **absent** in `analysis` mode | recedes to a thumbnail via `--art-size` shrink |
| 3 | Editorial padding — generous block/inline inset, type column pinned left, mesh claiming centre-right | `clamp()`-based tighter padding + `order` interleaving |
| 4 | Peak labels un-chipped: accent note name over dim `--font-mono` frequency, stacked | as-is (keep) |
| 5 | Transport centred at page bottom, circular `--accent` play button | as-is (keep) |
| 6 | Toolbar top-right, active toggle ringed in `--accent` | as-is — but fix the stale `.visualizer-toggle` → `.analysis-toggle` selector, which the working tree already caught |

Express #3 through the Phase-2 `clamp()` variables rather than reintroducing `24vh` /
`20vw` literals — the screenshot's proportions, the new scale's mechanism.

**Explicitly kept, untouched:** `AnalysisReadout` + `AnalysisProgress`, the `.dsp-layer`
grid-row expand/collapse, `EqCurve` and its drag model, `useLyricsScroll`'s
input-event takeover detection, `dspOpen`/`toggleDsp` in `UIContext`, and the
`data-dsp` / `data-lyrics` attributes on `.player-view`.

**Lyrics and chords — recolour only.** Both keep their current rendering. The colour
work is entirely the `--lyrics-marker` / `--lyrics-ink` derivation from Phase 1.6 plus
the chord ramp:

```css
.chord-now  { color: var(--accent); }
.chord-queue > * {
  color: color-mix(in oklab, var(--text-muted) calc(100% - var(--at) * 40%), transparent);
}
```

so the queue fades on the app's own text ramp instead of borrowing the lyrics marker.

---

## Phase 5 — Fonts and appearance settings  ⟶ delegated (D1 + D5)

### 5.1 Bundled faces (D1)

New file `src/app/styles/fonts.css`, imported first from `main.css` as its own layer:

```css
@layer fonts, tokens, reset, base, components, layout, views, utilities;
@import './fonts.css' layer(fonts);
```

Move the existing Montserrat `@font-face` blocks out of `tokens.css:1-40` into it, drop
the Sofia Pro rule (the file isn't in the repo), and add — as variable `woff2` in
`src/app/styles/fonts/`:

| Family | Role | Licence | Source |
| --- | --- | --- | --- |
| Space Grotesk | UI / display | OFL | Google Fonts variable woff2 |
| Geist | UI / display | OFL | `vercel/geist-font` releases |
| Geist Mono | mono readouts | OFL | `vercel/geist-font` releases |
| Departure Mono | mono readouts (pixel/terminal) | OFL | `rektdeckard/departure-mono` releases |

Then extend `SettingsContext.tsx:36-58`:

- `UiFont` union gains `'space-grotesk' | 'geist' | 'departure'`
- `UI_FONT_STACKS` / `UI_DISPLAY_STACKS` / `UI_FONT_LABELS` gain matching entries
- new `MonoFont = 'geist-mono' | 'departure' | 'system'` + `MONO_FONT_STACKS` / `MONO_FONT_LABELS`
- `applyFont` in `useAppearance.ts` also sets `--font-mono`

### 5.2 Settings (D5)

`Settings` gains, each with a `normalize*` sanitiser on read (matching the existing
`normalizeCustomTheme` / `normalizeDsp` pattern):

| Key | Type | Default | Applied as |
| --- | --- | --- | --- |
| `accentSource` | `'artwork' \| 'custom'` | `'artwork'` | branch in `applyAccent` |
| `ambientStrength` | `number` 0–1 | `0.75` | `--ambient-strength` |
| `uiDensity` | `'compact' \| 'comfortable'` | `'comfortable'` | `[data-ui-density]` |
| `cornerStyle` | `'sharp' \| 'soft'` | `'sharp'` | `[data-corners]` |
| `monoFont` | `MonoFont` | `'geist-mono'` | `--font-mono` |
| `theme` | gains `'auto'` | — | resolved via `matchMedia('(prefers-color-scheme: light)')` in `App.tsx`, still writing `data-theme="dark"\|"light"` |

`'auto'` **resolves in JS to the existing dark/light attribute** rather than adding a
`prefers-color-scheme` media block — that is what keeps Phase 1's "exactly one
`[data-theme='light']` block" invariant true.

`uiDensity` is deliberately *not* `defaultDensity` — that one is the track-list row
density and is unrelated.

The Settings UI for these goes in the existing `#settings-appearance` section of
`SettingsView.tsx`, built to Phase 6's rules (`<fieldset>` + `<legend>` per group,
real `<label for>` on every control).

---

## Phase 6 — Semantic HTML pass  ⟶ delegated (D4), Claude reviews

Ground rules: `~/.claude/skills/semantic-html/references/patterns.md`. The high-value
substitutions for this app specifically:

| Currently | Becomes | Why |
| --- | --- | --- |
| `KEY` / `TEMPO` label+value divs in `AnalysisReadout` | `<dl>` + `<dt>`/`<dd>` | It *is* a description list — and `display: grid` on the `<dl>` gives the screenshot's label gutter for free, deleting `--readout-label-w` |
| `.chord-queue` div stack | `<ol>` + `<li>`, `aria-current="true"` on the now chord | Ordered by time; `[aria-current]` replaces the `.current`/`.next` class juggling |
| Computed readouts (bpm, hz, key) | `<output>` | Native semantics for a calculated value |
| Track / elapsed times | `<time datetime="PT3M27S">` | Machine-readable |
| Settings groups | `<fieldset>` + `<legend>`, `<label for>` per control | Every control needs a programmatic name |
| `TagEditorView` | wrap in `<form>`, use native constraint validation | Currently a form with no `<form>` |
| Lyrics panel | `<aside aria-label="Lyrics">` around the existing `<pre>` | Keep the `<pre>` — it genuinely is preformatted text |
| Landmark check | exactly one `<main>`; `<header>`/`<nav>`/`<footer>` as siblings | A div-only tree is unnavigable to AT |
| Toggle buttons (shuffle, repeat, lyrics, DSP, analysis) | `aria-pressed` | They are toggles, not actions |

`Player.tsx` is already decent (`<article>`, `<hgroup>`, `<section>`) — the work is
mostly in the views. **Do not add `role=` where a native element already carries it.**

---

## Phase 7 — Docs and tests  ⟶ delegated (D6), last, once

- `docs/STYLE_GUIDE.md` — rewrite the token section against the real `tokens.css`;
  document `--sp-unit`, `[data-ui-density]`, `[data-corners]`, the art tokens, and
  the `.surface` / `.fade-y` utilities.
- `docs/DESIGN_GUIDE.md` — add the two invariants below.
- `AGENTS.md` — currently `**todo lol**`. Fill it in: bun only, `@layer` order, the
  one-token-contract rule, wcgw for file ops.
- `readme.md` + `assets/screenshots/` — retake the now-playing shots after Phase 4.

New tests (`tests/`, Vitest + jsdom):

1. **Token contract fence** — parse `src/app/styles/tokens.css`; assert every name in
   `CUSTOM_THEME_VARIABLES` is declared in `:root`, and assert **no `:root` or
   `[data-theme` selector appears in any other stylesheet**. This is the regression
   fence for the whole refactor.
2. **`extractPalette`** — currently has *zero* coverage. Cover: greyscale cover falls
   through to fallback; saturated cover yields a `vibrant` distinct from `dark`;
   `lum` tracks input brightness.
3. **`contrastLift`** — a near-black vibrant still clears the contrast floor against `--bg`.
4. **`applyAccent` branch** — `accentSource: 'artwork'` uses the palette;
   `'custom'` uses `accentDark`/`accentLight`; `theme: 'custom'` overrides both.
5. **Settings normalisers** — unknown `uiFont` / `monoFont` / out-of-range
   `ambientStrength` fall back to defaults rather than reaching the DOM.

---

## Delegation map

Via `~/.claude/skills/delegate-local/scripts/delegate.sh`, opencode 1.18.18, default
model (`opencode/big-pickle` — **no `--model` override**, per the skill's guidance and
because the configured default is the capable one). Every brief ends with
`Wrap the final answer in <result></result>` and `Do not commit or push`.

Delegates are partitioned so **no two concurrent runs touch the same file** — they run
`--auto` and will otherwise clobber each other.

| ID | Scope | Files owned | Wave |
| --- | --- | --- | --- |
| **D1** | Fetch + bundle fonts, write `fonts.css`, extend font stacks | `src/app/styles/fonts/**`, `fonts.css` (new) | A |
| **D4** | Semantic HTML pass, all views **except** `SettingsView` | `src/app/views/` (minus SettingsView), `src/app/layout/` | A |
| **D2** | Phase 1 — token consolidation | `tokens.css`, `theme.ts`, theme blocks in `layout.css` | B |
| **D3** | Phase 2 — fluid scale + `.surface` / `.fade-y` | `layout.css`, `utilities.css`, `components.css` | B (after D2) |
| **D5** | Phase 5.2 — settings keys, normalisers, `SettingsView` UI | `SettingsContext.tsx`, `SettingsView.tsx` | C |
| **D6** | Phase 7 — docs + tests | `docs/`, `AGENTS.md`, `tests/` | D (last) |

**Claude keeps** Phase 3 (palette roles, accent wiring, the wash) and Phase 4 (the
restoration) — both are judgment calls against a screenshot a delegate can't see, and
both are exactly the "needs back-and-forth" work the skill says not to hand off.

Sequencing: `A ∥ B(D2→D3)` → Claude(3, 4) → `D5` → `D6`.
Collect with `delegate.sh wait "$d1" "$d4"`, and check `result_source` +
`tool_calls` on every result — an empty `tool_calls` on an editing task means the
delegate talked about the work instead of doing it.

---

## Verification

**Automated** — after every phase, not just at the end:

```bash
bun run lint          # eslint ./src --config config/eslint.config.mjs
bun run typecheck     # tsc --noEmit
bun run test          # vitest run --config config/vitest.config.ts
bun run test:coverage # thresholds: 35% stmts/funcs/lines, 30% branches
wc -l src/app/styles/*.css   # target: 4094 → ≈ 2,900-3,100
```

Respect the shared config's `react-strict/prefer-no-use-effect` rule — new hooks need
the same justification comment the existing ones carry.

**Manual** — `bun run start` never yields an Electron process from an agent shell in
this sandbox, so runtime confirmation is the user's. Checklist to hand over:

1. Play a track with **saturated** artwork → background mesh drifts in its colours;
   the play button, chord ribbon, EQ curve and mesh stroke all shift to match.
2. Skip to a track with **very different** artwork → mesh crossfades over ~`--duration-slow`,
   accent follows, no flash of the old art.
3. Play a track with **greyscale / no** artwork → falls back cleanly, accent stays legible.
4. Open now-playing analysis + lyrics → compare against `assets/screenshots/now-playing-lyrics.png`:
   mesh bleeds full-bleed across the middle, no artwork on screen, lyrics right-aligned
   and readable, chords on the app palette rather than white.
5. Settings → Appearance: each new control moves something immediately, survives an
   app restart, and `theme: auto` follows an OS light/dark flip.
6. Cycle every font option; confirm each renders the bundled face (not a fallback) —
   check DevTools → Rendered Fonts.
7. Resize from smallest to largest window and drag the height through every tier —
   this is where the `clamp()` collapse can bite.
8. Toggle OS "Reduce motion" → drift stops, crossfades collapse.

**Screenshot the before/after of every tier** across Phase 2, per the earlier audit's
warning: `layout.css` is where all the real risk lives.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Phase 2's `clamp()` collapse breaks a specific window size | Phase 1 and 2 ship as separate commits; screenshot every tier before/after; keep the tier blocks that genuinely *rearrange* |
| `--accent` written by two hooks races | Structural fix, not a workaround: `useAmbientPalette` returns, `useAppearance` is the sole writer |
| Art-derived accent is unreadable on some covers | `contrastLift` floor + `accentSource: 'custom'` escape hatch in settings |
| Fonts unfetchable offline | D1 is independent of every other wave; the app keeps working on Montserrat |
| Delegate clobbers a file another delegate owns | Strict file partition + wave sequencing; never two concurrent runs on `src/app/styles/` |
| Restoring the screenshot undoes wanted whimsical-giraffe work | Only the mesh-in-flow and art-thumbnail *layout* choices are reverted; the entire state model and every component it added stay |
| `public/tokens.css` + `public/main.css` drift further | Out of scope (marketing site, `publicDir: false`, never bundled) — noted here so it is a decision, not an oversight |
