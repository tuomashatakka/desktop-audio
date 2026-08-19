# Style Guide

Design tokens, layer architecture, and conventions for the desktop-audio stylesheet.

---

## Layer Order

```css
@layer fonts, tokens, reset, base, components, layout, views, utilities;
```

Declared in `src/app/styles/main.css` (the single entry point). Every stylesheet
belongs to exactly one layer:

| Layer | File | What belongs here |
|-------|------|-------------------|
| `fonts` | `fonts.css` | `@font-face` declarations only — resource registrations, not styles |
| `tokens` | `tokens.css` | Every CSS custom property, the `@property` registrations, and the single `:root` / `[data-theme=…]` / `[data-ui-density]` / `[data-corners]` selectors |
| `reset` | `base.css` (imports reset) | Normalize / zero-out browser defaults |
| `base` | `base.css` | Element-level typography and defaults |
| `components` | `components.css` | Every named component — buttons, inputs, the overlay, sidebar rows, and all of the player's own parts (`.album-art-bg`, `.chord-ribbon`, `.frequency-matrix`, `.eq-*`, `.dsp-*`, `.waveform-*`) |
| `layout` | `layout.css` | Structure only: the app shell, titlebar, sidebar box, `.player-view` / `.player-content`, and every `@container player` / `[data-height-tier]` block |
| `views` | `views.css` | One screen's rules: library, settings, tag editor, audio processing |
| `utilities` | `utilities.css` | Shared recipes: `.surface`, `.fade-y` / `.fade-x`, `.sr-only`, text-overflow helpers |

**Invariant:** no `:root` or `[data-theme=…]` selector exists in any stylesheet
other than `tokens.css`. This is enforced by a test in `tests/`.

### Why `fonts` is first

Font faces are resource declarations, not style rules. Placing them first means a
token override can never catch a `@font-face` — a face is a URL, not a colour.

### Why components sit below layout

A component's own rules and the rules that *resize it for a given window* are
different jobs, and they live in different layers on purpose. `.chord-ribbon`
declares its type scale in `components`; the `@container player` block that
retunes that scale at 480px lives in `layout`, one layer up, and therefore wins
without having to be more specific than the default it is overriding.

Putting a component's base rules in `layout.css` breaks that: the two end up in
one layer, and every tier override has to win on specificity or source order
instead — which is what a layer system exists to avoid.

### The `utilities` layer gotcha

`utilities` is the *last* layer, so any property declared here beats the same
property declared in `components` regardless of CSS specificity. This is why
`.surface`'s shadow uses a variable escape hatch:

```css
box-shadow: var(--surface-shadow, var(--shadow-card));
```

A component that needs a different shadow *sets* `--surface-shadow` rather than
overriding `box-shadow` directly — the `utilities` layer would silently eat a
`box-shadow` declaration on the same element no matter how specific the selector.

---

## Design Tokens

All tokens live in `src/app/styles/tokens.css`, inside the `@layer tokens` block.
There is one `:root` block for dark theme defaults and one
`[data-theme='light']` block for light overrides.

### Colour Primitives

Raw palette values, used only as direct references inside `:root`:

```
--mono-ink           --mono-onyx          --mono-graphite
--mono-slate         --mono-fg1           --mono-fg2
--mono-fg3           --mono-fg-inverse    --mono-turquoise
--mono-turquoise-glow --mono-crimson      --mono-violet
--mono-success       --mono-warning       --mono-info
```

### Colour Roles

Semantic aliases that reference the primitives:

| Token | Dark default | Purpose |
|-------|-------------|---------|
| `--bg` | `var(--mono-ink)` | Page background |
| `--bg-raised` | `var(--mono-onyx)` | Elevated surfaces (`.surface`) |
| `--bg-input` | `var(--mono-graphite)` | Input backgrounds |
| `--bg-hover` | `var(--mono-slate)` | Hover backgrounds |
| `--text` | `var(--mono-fg1)` | Primary text |
| `--text-dim` | `var(--mono-fg2)` | Secondary text |
| `--text-muted` | `var(--mono-fg3)` | Tertiary / disabled text |
| `--accent` | `var(--mono-turquoise)` | Primary accent (set by `useAppearance`, see below) |
| `--accent-hover` | `var(--mono-turquoise-glow)` | Accent hover state |
| `--accent-alt` | `var(--mono-violet)` | Alternate accent |
| `--accent-contrast` | `var(--mono-fg-inverse)` | Text on accent surfaces |
| `--accent-muted` | `color-mix(in srgb, var(--accent) 14%, transparent)` | Subtle accent tint |
| `--success` | `var(--mono-success)` | Positive feedback |
| `--warning` | `var(--mono-warning)` | Caution |
| `--danger` | `var(--mono-crimson)` | Error / destructive |
| `--danger-muted` | `color-mix(in srgb, var(--danger) 14%, transparent)` | Subtle danger tint |
| `--info` | `var(--mono-info)` | Informational |

### Borders and Overlays

| Token | Value |
|-------|-------|
| `--border` | `rgb(255 255 255 / 10%)` |
| `--border-hover` | `rgb(255 255 255 / 20%)` |
| `--border-focus` | `var(--accent)` |
| `--overlay` | `rgb(0 0 0 / 38%)` |
| `--overlay-blur` | `8px` |
| `--shell-wash` | `rgb(255 255 255 / 6%)` |
| `--art-scrim-strong` | `rgb(0 0 0 / 45%)` |
| `--art-scrim-soft` | `rgb(0 0 0 / 15%)` |

### Typography

| Token | Value | Notes |
|-------|-------|-------|
| `--font-display` | `"Sofia Pro", "Montserrat", system-ui, sans-serif` | Headings / display |
| `--font` | `"Montserrat", system-ui, -apple-system, "Segoe UI", sans-serif` | Body / UI |
| `--font-mono` | `"SF Mono", Monaco, "Cascadia Code", monospace` | Monospace (overridden by settings) |

Type sizes (rem — the font-size setting scales the root and the whole scale follows):

```
--text-xs: 0.6875rem    --text-sm: 0.75rem
--text-base: 0.875rem   --text-lg: 1rem
--text-xl: 1.25rem      --text-2xl: 1.5rem     --text-3xl: 2rem
```

Weights:

| Token | Value | Notes |
|-------|-------|-------|
| `--weight-hairline` | `100` | Montserrat ships a real hairline face |
| `--weight-light` | `300` | |
| `--font-medium` | `500` | |
| `--font-semibold` | `600` | |

### Spacing

One base unit drives the entire scale via `calc()`:

```css
--sp-unit: 4px;
--sp-0-5: 2px;
--sp-1:  calc(var(--sp-unit) * 1);   /* 4px  */
--sp-2:  calc(var(--sp-unit) * 2);   /* 8px  */
--sp-3:  calc(var(--sp-unit) * 3);   /* 12px */
--sp-4:  calc(var(--sp-unit) * 4);   /* 16px */
--sp-6:  calc(var(--sp-unit) * 6);   /* 24px */
--sp-8:  calc(var(--sp-unit) * 8);   /* 32px */
--sp-12: calc(var(--sp-unit) * 12);  /* 48px */
```

**Density remap** — one attribute changes the whole scale:

```css
[data-ui-density='compact']     { --sp-unit: 3px; }
[data-ui-density='comfortable'] { --sp-unit: 4px; }
```

### Corner Radius

MONO is deliberately sharp. The defaults are:

```css
--radius: 0;
--radius-lg: 2px;
--radius-full: 9999px;
--control-radius: 999px;
```

`--control-radius` is for things that *look* like buttons — it is set by
`.button` in `components.css`, not by the `button` element reset, which uses
`--radius`. Plenty of elements are `<button>` only because they are activatable
(folder rows, track rows, group headings), and a pill reset made each of them a
lozenge the moment it took a background.

**Corner remap** — one attribute changes the trio:

```css
[data-corners='soft'] {
  --radius: 6px;
  --radius-lg: 12px;
  --control-radius: 8px;
}
```

### Shadows

| Token | Usage |
|-------|-------|
| `--shadow-sm` | Subtle elevation |
| `--shadow-lg` | Heavy inset + drop |
| `--shadow-card` | The elevated-surface default (used by `.surface`) |
| `--accent-glow` | Accent ring + ambient glow |
| `--focus-ring` | Keyboard focus outline |

### Motion

```css
--ease:          cubic-bezier(0.4, 0, 0.2, 1);   /* symmetric — hover + colour changes */
--ease-emphasis: cubic-bezier(0.16, 1, 0.3, 1);  /* decelerate — enters */
--ease-exit:     cubic-bezier(0.4, 0, 1, 1);      /* accelerate — exits */

--duration-fast: 180ms;
--duration:      260ms;
--duration-slow: 420ms;

--shift-sm: 6px;
--shift-md: 12px;
```

`prefers-reduced-motion: reduce` collapses all durations to `1ms` and shifts
to `0px` at the token level, so every rule that reads a token follows for free.

### Structural Sizes

Fixed chrome dimensions read by both CSS and component logic:

```
--titlebar-h: 40px       --player-bar-h: 72px     --track-head-h: 34px
--settings-nav-w: 200px  --titlebar-btn-w: 46px   --album-art-lg: 96px
--album-art-sm: 40px     --art-blur: 60px
```

DSP controls:

```
--dsp-fader-h: 104px     --dsp-knob-size: 52px    --dsp-track-w: 4px
```

Pointer targets — the floor on an icon button, stated rather than left to fall
out of the type scale — and the height `content-visibility` reserves for an
off-screen sidebar tree row:

```
--hit-target: 32px       --hit-target-sm: 26px      --tree-row-h: 28px
```

### Z-Index Scale

A token per layer, so a new stacking context is a number you can look up:

```
--z-raised: 1        --z-sticky: 2       --z-player: 5
--z-handle: 10       --z-popover: 150    --z-ambient: 1000000
```

### Waveform

```
--wf-unplayed: rgb(255 255 255 / 15%)
--wf-played:   var(--accent)
```

---

## Art-Palette Tokens (`@property`-registered)

These five are registered at the top of `tokens.css` with `@property`, *outside*
any `@layer`:

```css
@property --art-vibrant { syntax: '<color>';  inherits: true; initial-value: transparent; }
@property --art-muted   { syntax: '<color>';  inherits: true; initial-value: transparent; }
@property --art-dark    { syntax: '<color>';  inherits: true; initial-value: transparent; }
@property --art-light   { syntax: '<color>';  inherits: true; initial-value: transparent; }
@property --art-lum     { syntax: '<number>'; inherits: true; initial-value: 0.5; }
```

**Why they are `@property`-registered:** An unregistered custom property has no
type, so the browser can only swap it. A registered `<color>` is interpolated like
any other animatable value. The `transition` on `:root` for these four colour
properties is what makes the ambient wash crossfade between tracks with no
JavaScript animation — the colours drift smoothly when `useAmbientPalette` writes
new values.

`--art-lum` is a `<number>`, not a colour — it drives the auto-scrim strength so
a bright cover dims the backdrop more.

---

## Ambient Wash Tokens

The decorative backdrop behind the entire UI — three pseudo-elements, no extra DOM:

| Token | Purpose |
|-------|---------|
| `--ambient-blend` | `screen` (dark) / `multiply` (light) — the mesh blend mode |
| `--ambient-strength` | `0.75` — opacity multiplier, settings-driven |
| `--ambient-a1` / `--ambient-a2` / `--ambient-a3` | Radial gradient alpha stops |
| `--ambient-drift-dur` | `40s` — how long a drift cycle takes (collapsed to `0s` under reduced motion) |

Art cover layer tokens:

| Token | Purpose |
|-------|---------|
| `--art-blur-bg` | `84px` — blur radius of the cover pseudo-element |
| `--art-cover-scale` | `1.4` — overscale so the drift never exposes an edge |
| `--art-cover-opacity` | `0.32` (dark) / `0.18` (light) |

Grain and vignette:

| Token | Purpose |
|-------|---------|
| `--grain-image` | SVG turbulence `url()` — 200 bytes, scales to any density |
| `--grain-opacity` | `0.05` (dark) / `0.035` (light) |
| `--grain-blend` | `overlay` (dark) / `multiply` (light) |
| `--vignette` | Radial gradient, inset edges |

The mesh cross-fades for free because `--art-*` are `@property`-registered
colours and `:root` carries a `transition` on them. `background-image` is not
interpolable, so the blurred cover layer re-triggers a fade-in keyframe via a
`data-art-tick` attribute flip — two identical keyframes whose only difference is
the name.

---

## Player Tokens

| Token | Purpose |
|-------|---------|
| `--player-h` | `@property`-registered `<length-percentage>`, initial `72px` — the collapsed/expanded player height |
| `--matrix-blend` | `color-burn` — the frequency mesh blend |
| `--controls-blend` | `color-dodge` (dark) / `normal` (light) — transport controls blend |
| `--analysis-rise` | `calc(var(--shift-md) * 2)` — how far analysis content rises, and how far the cover travels upward as it leaves |
| `--chord-pps` | `clamp(28px, 6cqi, 64px)` — how far one second of chord lookahead is on screen. A **length**, not a bare number: `clamp()` cannot mix unitless values with `cqi`, and `seconds × length` is a length either way |
| `--matrix-wallpaper` | `0.38` — how far back the frequency mesh sits behind the chord lane. Applied to the history and time lines only; `.matrix-current` stays at full strength |
| `--art-banner-h` | `min(58cqh, 96cqw)` — full-bleed cover height on narrow now-playing |
| `--lyrics-nudge` | `6vw` — horizontal nudge for the lyrics column |
| `--lyrics-inset-inline` | `10vw` |
| `--lyrics-inset-block` | `10vh` |
| `--lyrics-marker` | `color-mix(in oklab, var(--text) 62%, transparent)` — auto-recoloured to palette |
| `--lyrics-ink` | `color-mix(in oklab, var(--bg) 88%, var(--accent))` |
| `--lyrics-blend` | `normal` |

---

## Utilities

Shared recipes in `src/app/styles/utilities.css`:

### `.surface`

The elevated-surface recipe, extracted from multiple components that each
re-implemented it:

```css
:where(.surface, .overlay-dialog, .popover-panel, .context-menu-window) {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--surface-shadow, var(--shadow-card));
}
```

`:where()` keeps specificity at zero. The shadow uses a variable fallback so a
component overrides it by *setting* `--surface-shadow`, not by redeclaring
`box-shadow` (which the `utilities` layer would eat — see the gotcha above).

### `.fade-y` / `.fade-x`

Edge-fade masks for scrollable containers:

```css
:where(.fade-y) {
  --fade-start: 0%;
  --fade-end: 12%;
  mask-image: linear-gradient(to bottom,
    transparent var(--fade-start), #000 var(--fade-end),
    #000 calc(100% - var(--fade-end)), transparent 100%);
}
```

`.fade-x` is the same along the inline axis. The `#000` is a mask alpha channel,
not a colour — it must stay literal.

---

## Theme System

Themes are applied via `data-theme` on `<html>`:

| Value | Effect |
|-------|--------|
| `dark` | Default — the `:root` block in `tokens.css` |
| `light` | The `[data-theme='light']` block overrides a subset of tokens |
| `custom` | A user-defined palette applied via `useThemeApply` |
| `auto` | Resolved to `dark` or `light` in JS (`SettingsContext`) via `matchMedia` *before* it reaches the DOM — this is what keeps the single-`[data-theme]` invariant intact |

### Custom Themes

Custom themes are stored in settings as a `CustomTheme` object and applied by
`useThemeApply`, which writes the same custom properties as `tokens.css` onto
`document.documentElement`. The custom-theme variable list in
`src/app/utils/theme.ts` must match the `:root` block in `tokens.css` exactly.

---

## Adding a Bundled Font

1. Drop the font file (woff2 preferred) into `src/app/styles/fonts/`.
2. Add an `@font-face` block to `src/app/styles/fonts.css` with
   `src: url("./fonts/YourFont.woff2")`.
3. Add the family to the relevant stack record in `SettingsContext.tsx`
   (`UI_FONT_STACKS`, `UI_DISPLAY_STACKS`, or `MONO_FONT_STACKS`).

**No build config change required.** Vite's CSS asset pipeline hashes and copies
the file automatically. The `@font-face` rules live in the `fonts` layer, which
is imported first from `main.css`.

Bundled families:

| Family | Role | Format | Licence |
|--------|------|--------|---------|
| Montserrat | UI / body | OTF (static weights 100, 300, 400, 900) | OFL |
| Space Grotesk | UI / display | Variable woff2 (300–700) | OFL |
| Geist | UI / display | Variable woff2 (100–900) | OFL |
| Geist Mono | Mono readouts | Variable woff2 (100–900) | OFL |
| Departure Mono | Mono readouts (pixel/terminal) | Static woff2 (400) | OFL |

---

## Browser Support

Vite targets `chrome146` (Electron). The following are used directly without
polyfills:

- `@layer`
- `@property`
- `color-mix()`
- Container queries (`cqi`, `cqh`, `cqw`)
- Native CSS nesting
- `:where()`, `:has()`
