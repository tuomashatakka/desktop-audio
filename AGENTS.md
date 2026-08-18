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
