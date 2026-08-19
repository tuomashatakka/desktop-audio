# desktop-audio — Agent Guide

Electron + React + TypeScript music player. Bun only — never npm, yarn, or pnpm.

---

## Commands

```bash
bun install              # install deps
bun run start            # dev (electron-forge start)
bun run lint             # eslint ./src --config config/eslint.config.mjs
bun run typecheck        # tsc --noEmit
bun run test             # vitest run --config config/vitest.config.ts
bun run test:e2e         # playwright test --config config/playwright/playwright.config.ts
bun run test:coverage    # vitest run --coverage (thresholds: 35% stmts/funcs, 30% branches)
bun run make             # production build
```

Always run `bun run lint && bun run typecheck && bun run test` before committing.

---

## Where Things Live

```
src/app/
├── components/atomic/       # Button, Input, Rating, WaveformProgress, etc.
├── components/composite/    # Player, DspPanel, AnalysisReadout, TrackTable, etc.
├── contexts/                # SettingsContext, AudioContext, LibraryContext, UIContext
├── hooks/                   # useAmbientPalette, useAppearance, useKeyboardShortcuts, etc.
├── layout/                  # App shell, titlebar, overlay host
├── services/                # Audio engine, DSP chain, analysis pipeline
├── styles/                  # CSS entry point + all stylesheets
│   ├── main.css             # Entry: @layer declaration + imports
│   ├── fonts.css            # @font-face declarations (fonts layer)
│   ├── tokens.css           # All custom properties (tokens layer)
│   ├── base.css             # Reset + element styles
│   ├── components.css       # Component styles
│   ├── layout.css           # Page-level layout
│   ├── views.css            # View-specific styles
│   └── utilities.css        # .surface, .fade-y, .fade-x, .sr-only
├── utils/                   # color.ts, theme.ts, time.ts, pitch.ts, etc.
└── views/                   # LibraryView, SettingsView, NowPlayingView, etc.
```

```
tests/                       # Vitest + jsdom, mirrors src/app/ structure
config/                      # Vite, Vitest, ESLint, Playwright configs
docs/                        # STYLE_GUIDE.md, DESIGN_GUIDE.md, plans/
```

---

## CSS Architecture

Vite targets `chrome146` — native `@layer`, `@property`, `color-mix()`,
container queries, and CSS nesting are used directly. No Tailwind, no PostCSS,
no CSS-in-JS.

### Layer Order

```
@layer fonts, tokens, reset, base, components, layout, views, utilities;
```

Declared in `src/app/styles/main.css`. Every stylesheet belongs to exactly
one layer. The `fonts` layer is imported first so `@font-face` rules can never
be caught by a token override.

### Invariant: A File Per Layer, And Nothing Else In It

| File | What belongs in it |
|---|---|
| `base.css` | reset, then element-level defaults — `button`, `input`, headings, `<kbd>`. No class ever. |
| `components.css` | every **named component**: buttons, inputs, the overlay, the player's own parts (`.chord-ribbon`, `.frequency-matrix`, `.eq-*`, `.dsp-*`, `.waveform-*`, sidebar rows). |
| `layout.css` | **structure only** — the app shell, the titlebar, the sidebar box, `.player-view` / `.player-content`, and every `@container player` / `data-height-tier` block. |
| `views.css` | one screen's rules: library, settings, tag editor, DSP. |

`base.css`'s `button` reset uses `--radius`, **not** `--control-radius`. Many
elements here are `<button>` because they are *activatable* — a folder row, a
track row, a group heading — and the 999px control radius turned every one of
them into a lozenge as soon as it took a background. `.button` sets the pill for
things that actually look like buttons.

The order is load-bearing, not cosmetic. Component defaults sit one layer
*below* layout, so a tier or container-query override in `layout.css` wins
without having to out-specify anything. Put a component's base rules in
`layout.css` and that stops being true.

### Conventions

Simple class names plus **native nesting**, never BEM: `.button { &.primary {} }`,
not `.button--primary`. Style state with attributes the component already sets
(`[data-open]`, `[aria-pressed]`, `[data-mode]`) rather than toggled classes.

### Invariant: One Token Contract

All CSS custom properties and all theme-dependent selectors (`:root`,
`[data-theme=…]`, `[data-ui-density]`, `[data-corners]`) live in
`src/app/styles/tokens.css` and nowhere else. A test in `tests/` enforces
this. When adding a new token, add it to `tokens.css` — never to a component
or layout file.

### Invariant: One Writer for `--accent`

`useAppearance` is the sole writer of `--accent` on `document.documentElement`.
`useAmbientPalette` *returns* a palette; it does not write the property. Two
hooks writing one custom property on one element is a race decided by effect
ordering.

---

## Now Playing

`Player.tsx` is the whole thing, rendered twice from one component: the footer
bar's copy lives inside `.app-shell`, the overlay's is portaled to `body` by
`Overlay` and so escapes every descendant tier rule. There is no route state —
Now Playing is an overlay, like Settings and the Tag Editor.

### Invariant: One DOM

**`Player` renders exactly one markup, always.** Nothing in it is conditionally
rendered — not the mode panels, not the lyrics layer, not the bar's promote
button. Every state change is a `data-*` attribute that CSS animates.

Two reasons, both load-bearing:

1. An element that unmounts has nothing left to animate, so a `display`
   transition (`allow-discrete` + `@starting-style`) only works when the element
   is always there.
2. The player is rendered **twice** — once in the footer bar inside
   `.app-shell`, once portaled to `body` by the overlay. If either copy could
   branch, the two would drift into two components with one name. A test in
   `tests/components/composite/Player.test.tsx` compares their `innerHTML`
   byte-for-byte.

`expanded` is a prop, but it only ever selects **values** — which copy owns the
analyser's `requestAnimationFrame` loop, and whether the lyrics layer may open.
It must never gate an element.

Where the two copies look different, **the place is what selects it**: the
overlay's copy is outside `.app-shell`, so height-tier rules cannot reach it,
and the analysis layout is scoped `.player-overlay &[data-mode='analysis']`.

#### Two traps this invariant sets

**Collapsed is not hidden.** `.player-content` is a `display: grid` with named
areas in every height tier. Anything always-mounted that has *no* grid area
there must be `display: none` — a merely collapsed element (`height: 0`) is
still a grid item, auto-places into an implicit row and adds the grid's `gap`,
which is what once pushed the transport out of a 72px bar. See
`.app-shell :is(.frequency-matrix, .analysis-readout, .player-lyrics)` in
`layout.css`.

**Hiding a control can strand a whole layout.** `useWindowScale` is the only
thing that resizes the window, and `.player-promote` exists only at the `normal`
tier — so the window-size button in `.player-actions` is the sole way in and out
of the compact and mini players. `.player-actions` is hidden outside the
overlay, so the shell shows exactly that one item (`> li:not(.size)`). jsdom
does not load the cascade, so **no component test can catch this class of bug**;
it needs a real window.

### Invariant: Two Views, One Layer

**Two views**, mutually exclusive, `PlayerMode` in `UIContext`:

| | |
|---|---|
| `default` | the album art |
| `analysis` | chords, key and tempo; the cover fades upward out of frame |

**One layer**, composable with either view:

| | |
|---|---|
| `lyricsOpen` | hangs off the trailing edge; `.player-content` translates to meet it |

Audio processing is **not** here. It is its own overlay (`openOverlay('dsp')` →
`DspView`), because sixteen faders, six knobs and a transport that has to stay
on screen never fitted one window: the panel either clipped its own low bands or
shrank until they were unusable.

**The title, the seek bar and the transport are always mounted and always
visible**, in every view, under the layer, at every tier. A change that hides
any of them behind a mode is the thing this section exists to stop.

The album art is a `<figure>`, not a control. It used to be a button that
resized the window, which made the now-playing view rearrange itself when you
clicked the cover. The window-size toggle is its own labelled button in
`.player-actions`.

### Invariant: The Class Hooks Are a Contract

`.player-view`, `.player-content`, `.player-art`, `.player-info`,
`.progress-section`, `.playback-controls` are addressed by the height-tier
system (`data-height-tier` on `.app-shell`, written from JS) and by the
`@container player` blocks in `layout.css`. Renaming one means rewriting that
system.

### The analysis view is a chord chart

The reader is holding an instrument. The chord lane is the largest type in the
app; key, tempo and meter are one caption line (`.track-meta`); the FFT mesh is
wallpaper at `--matrix-wallpaper` and its note labels are off by default
(`showSpectrumNotes`). `.matrix-current` is deliberately excluded from the
dimming — it is the one line that still has to read as live.

---

## Drag and Drop

### Invariant: One Drag Vocabulary

Everything draggable — track rows, folder rows, sidebar folders, album/artist
group headings, grid cards, playlists — describes itself as a `DragPayload` on
the `application/x-desktop-audio` MIME type (`src/app/utils/dnd.ts`), and every
drop target resolves it with `tracksForPayload`. Add a drag source by adding a
payload kind there, never by inventing a second MIME type. Payloads carry ids
and paths only, so a drop resolves against the library as it stands at drop
time rather than against a snapshot taken when the drag started.

---

## Playlists

Persisted to `localStorage` under `desktop-audio-playlists` as
`{ playlists: StoredPlaylist[], folders: PlaylistFolder[] }` — **ids only**. A
track's id is its path, so membership survives a rescan and can never hold a
stale copy of an edited tag; `LibraryContext` resolves the ids against the
in-memory library on read. Playlists carry an icon from `PLAYLIST_ICONS` and
may be filed into arbitrarily nested `PlaylistFolder`s.

---

## Fonts

Bundled families: Montserrat (OFL), Space Grotesk (OFL), Geist (OFL),
Geist Mono (OFL), Departure Mono (OFL). Files live in `src/app/styles/fonts/`.

Adding a font: drop the file in `fonts/`, add an `@font-face` in `fonts.css`,
add the family to the stack record in `SettingsContext.tsx`. **No build config
change required** — Vite's CSS asset pipeline handles it.

---

## Linting

The project uses a custom `react-strict/prefer-no-use-effect` ESLint rule.
`useEffect` is disallowed by default. Existing hooks carry a justification
comment where an effect is unavoidable — follow the same pattern:

```ts
// eslint-disable-next-line react-strict/prefer-no-use-effect -- <why this effect is necessary>
```

Common valid justifications: DOM writes outside React's render, event listener
subscriptions, async operations, media query listeners, canvas sampling.

---

## Settings

Persisted via `SettingsContext` (localStorage). Appearance settings applied as
custom properties or `data-*` attributes on `document.documentElement`:

| Key | Type | Values | Applied as |
|-----|------|--------|-----------|
| `theme` | `Theme` | `'dark'` `'light'` `'auto'` `'custom'` | `data-theme` (`auto` resolved to `dark`/`light` in JS) |
| `uiFont` | `UiFont` | `'montserrat'` `'space-grotesk'` `'geist'` `'departure'` `'poppins'` `'helvetica'` `'system'` | `--font`, `--font-display` |
| `monoFont` | `MonoFont` | `'geist-mono'` `'departure'` `'system'` | `--font-mono` |
| `accentSource` | `AccentSource` | `'artwork'` `'custom'` | branch in `useAppearance` |
| `ambientStrength` | `number` | `0`–`1` | `--ambient-strength` |
| `uiDensity` | `UiDensity` | `'compact'` `'comfortable'` | `[data-ui-density]` → remaps `--sp-unit` |
| `cornerStyle` | `CornerStyle` | `'sharp'` `'soft'` | `[data-corners]` → remaps radius trio |
| `fontScale` | `number` | `0.8`–`1.4` | root `font-size` (rem-based type scale follows) |
| `showSpectrumNotes` | `boolean` | default `false` | `showNotes` on `FrequencyMatrix`; off skips the `findPeaks` pass entirely |
