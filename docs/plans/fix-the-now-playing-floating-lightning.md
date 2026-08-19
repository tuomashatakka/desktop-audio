# Now playing: chord-first analysis, and the sidebar/library fixes

## Context

Two things prompted this.

**First — most of the now-playing list is already shipped.** Commit `fe27cdb`
("Fixes for the analysis and the playing view", Aug 17) implemented the previous
plan, `docs/plans/fix-the-now-playing-whimsical-giraffe.md`. Verified in the
working tree today:

| Asked for | State |
|---|---|
| Two modes only (`default` / `analysis`), controls + title always visible | ✅ `UIContext.tsx:42`, `Player.tsx:339` |
| Lyrics pans the rest left | ✅ `layout.css:631` — `[data-lyrics] .player-content { translate: … }` |
| DSP pans title up / transport down, no jump | ✅ `.dsp-layer` `grid-template-rows: 0fr→1fr`, `layout.css:1476` |
| Chord queue moves right→left by time-until-played | ✅ `--at`/`--now`/`--chord-pps`, `AnalysisReadout.tsx:107`, `layout.css:1044` |
| Activated chord flashes; outgoing one scrolls + fades left | ✅ `@keyframes chord-flash` / `chord-depart`, `layout.css:1092` |
| Peak notes held long, faded, one horizontal row | ✅ `LABEL_TTL_MS = 2400`, `spreadLabels`, `.matrix-peak { inset-block-start: 0 }` |
| Mesh: older rows behind, current row drawn like the EQ curve | ✅ `FrequencyMatrix.tsx:291` reverse loop + `.matrix-current` |
| Art becomes a full-bleed banner with a gradient fade on semi-small | ✅ `@container player (max-width: 720px)`, `layout.css:1828` |
| EQ band frequencies on hover | ✅ `.eq-bands` ruler, `EqCurve.tsx:264` |

So this pass is **verify + close the real gaps**, not a rebuild. The gaps are
listed in §1–§8 and every one of them is small except §2.

**Second — the analysis view is cluttered.** It reads as a data panel with a
label gutter (`Chord | … / Key | … / Tempo | …`) sitting on top of a loud 3D
wireframe. The point of the view is for someone to *play along*, so the chords
lead and the mesh becomes wallpaper.

**Assumptions made where the answer wasn't available** (flip either in one line):

- **EQ mouse buttons** — "left and right mouse buttons change the focused band"
  is implemented as: primary press focuses the band under the pointer and then
  drags *that* band's gain (it no longer re-targets mid-drag, which today smears
  the curve sideways); secondary press steps the focus to the next band (Shift:
  previous) without changing any gain. Both buttons change the focused band, and
  drawing on the curve still works.
- **Screenshots** — the four shots in `assets/screenshots/` that no section
  references get wired in and the copy refreshed. No re-capture here; §8 lists
  which shots go stale so they can be re-shot afterwards.

---

## 1. Album art leaves *upwards* — `src/app/styles/layout.css`

`[data-mode='analysis'] .player-art` (line 588) fades and scales but does not
move, while `.player-art`'s own `@starting-style` (line 770) already declares the
upward direction for the arrival. Make the exit mirror it:

```css
.player-art {
  position: absolute;
  opacity: 0;
  scale: 0.94;
  translate: 0 calc(-1 * var(--analysis-rise));   /* ← add */
  pointer-events: none;
}
```

`translate` is already in the element's `transition` list (line 766), so this is
the whole change. The readout's rise (`translate: 0 var(--analysis-rise) → 0`,
line 945) is already correct and stays.

---

## 2. The analysis view, chord-first

The target, at the overlay's normal width:

```
ghost s1gnal hardcvre
unknown artist · unknown album
B minor · 87.5 bpm · 4/4              ← new inline meta row

  ┌─────┐
  │  G  │   Em      G      D      A   ← chord lane, hero size
  └─────┘   ▏       ▏      ▏      ▏
  ◀ now ─── time until played ─────▶

  ░ faint frequency mesh, full bleed ░

  ▂▄▆█▆▄▂ waveform ▂▄▆█▆▄▂
       ⏮   ( ▮▮ )   ⏭
```

### 2a. `KeyTempo` → an inline meta row — `AnalysisReadout.tsx:174`

Replace the stacked `<dl class='key-tempo-summary'>` (label gutter, one pair per
line) with a single inline row that reads as a caption under artist/album:

```tsx
<dl className='track-meta'>
  <div><dt>Key</dt><dd>{analysis.key.label}</dd></div>
  <div><dt>Tempo</dt><dd>{analysis.tempo.bpm.toFixed(1)} <abbr title='beats per minute'>bpm</abbr></dd></div>
  {meter && <div><dt>Meter</dt><dd>{meter}/4</dd></div>}
</dl>
```

- `dt`s are `.sr-only` (`utilities.css` already has the class) — the labels are
  what the gutter existed for, and `B minor · 87.5 bpm` needs no captions on
  screen. Separators are `dd + div::before { content: '·' }`.
- **Meter** comes from the beat data that is already fetched and otherwise
  unused here: `BeatMarker.beat` (`services/types.ts:101`). Add a pure helper
  beside `chordAt`/`firstAfter` so it is testable without a DOM:

  ```ts
  /** Beats per bar, from the highest beat index seen — or null if unusable. */
  export function meterOf (beats: readonly BeatMarker[]): number | null
  ```
  Return `null` for `< 8` beats or a max beat outside 2–12; the row simply drops
  the third pair then.
- `--readout-label-w` and the `.key-tempo-summary` rules (`layout.css:1060`) go
  away with it. `.readout-label` stays only for the analysis *status* line.

### 2b. The chord lane becomes the hero — `AnalysisReadout.tsx:143`, `layout.css:998`

- Drop the `Chord` `<figcaption>`. Once the lane is the largest thing on the
  page it captions itself, and it was the last thing holding the label gutter up.
  Keep the `aria-label` on the `<figure>` so the graphic is still named.
- Re-grid `.chord-ribbon` from `'label now queue'` to `'now queue'`.
- Size up: `--chord-size: clamp(var(--text-3xl), 9cqi, var(--text-6xl))`,
  `--chord-size-next: clamp(var(--text-lg), 3.4cqi, var(--text-3xl))`. The lane
  height already derives from `--chord-size`, so it follows.
- Lookahead: `QUEUE_LENGTH` 10 → 16 (`AnalysisReadout.tsx:27`) and
  `--chord-pps` 34 → `clamp(28, 6cqi, 64)` in `tokens.css`, so a wide window
  shows further ahead instead of the same three chords bigger.
- Add a baseline tick per queued chord — a `::before` on `.chord-queue .chord`,
  1px of `--border`, dropping to the lane's baseline — so the row reads as a
  timeline rather than floating words.
- `.chord-now` gets a bracket rather than a box: `border-inline-start: 2px solid
  var(--accent)` plus padding. A filled card would be the only solid rectangle
  on a page that has none.

### 2c. The mesh becomes wallpaper — `layout.css:1133`, `FrequencyMatrix.tsx`

- New token in `tokens.css` beside the other player tokens:
  `--matrix-wallpaper: 0.38`. `.frequency-matrix[data-open]` opacity goes from
  `1` to `var(--matrix-wallpaper)`. One token, so it is tunable without touching
  the component, and `prefers-reduced-motion` already stops the loop.
- `.matrix-current` keeps full strength — it is the one line that still reads as
  "this is live" — by lifting it back out: `.matrix-current { opacity: calc(1 /
  var(--matrix-wallpaper)) }` is fragile; instead move the dimming onto the two
  `<use>` elements and `.matrix-line-z` only, leaving `.matrix-current`
  untouched. (`.frequency-matrix > svg` keeps `mix-blend-mode`.)
- **Peak note labels default off.** They are decoration on a view that is now
  about chords. Add `showSpectrumNotes: boolean` (default `false`) to
  `SettingsContext.tsx` — same shape as the existing `showBeatMarkers`
  (`SettingsContext.tsx:348`), same three-line setter — thread it from
  `Player.tsx` into `FrequencyMatrix` as `showNotes`, and skip `updateLabels`
  entirely when it is off (saves the `findPeaks` pass per 160 ms too). Add the
  toggle to `SettingsView` beside the other two analysis switches.
- With labels off, `LABEL_MAX` 8 → 5 for when they are on: eight names across a
  wallpaper is the clutter being removed.

### 2d. Stacking and inset

`[data-mode='analysis'] .player-content` currently pushes the type column ~14cqi
in (line 585) to keep it clear of the mesh. With the mesh as a full-bleed
wallpaper the type no longer needs to dodge it — reduce to
`clamp(var(--sp-6), 8cqi, 12vw)` so the chord lane gets the width it now wants.

---

## 3. DSP shrinks instead of scrolling — `layout.css:1513`

`.dsp-panel` is `max-height: 52cqh; overflow-y: auto` with the scrollbar hidden,
so on a short window the low bands are silently unreachable — the same class of
bug as the sidebar in §5. Make it shrink:

- Drop `max-height` / `overflow-y` from `.dsp-panel`.
- Add a fluid scale the panel's parts read from, declared on `.dsp-layer[data-open]`:
  ```css
  --dsp-scale: clamp(0.62, 40cqh / 30, 1);
  ```
  and express the fader column height, knob diameter and module gap against it
  (`.eq-curve`'s `aspect-ratio` already makes it shrink for free; the knobs and
  `--sp-*` gaps are what need the term).
- Keep `overflow: hidden` on `.dsp-layer` — it is the clip the `0fr→1fr`
  animation needs — but nothing inside may now overflow it at rest.

Also lift the hard cut at `@container player (max-width: 720px)` (line 1817)
which `display: none`s `.dsp-toggle` and `.dsp-layer` outright: with a shrink
scale there is a usable panel at 560px. Keep the cut, moved to `max-width: 480px`.

---

## 4. Album art on the smallest player — `layout.css:2236`

The mini/compact window tiers already pin the art left (`grid-template-areas:
'art info'`, lines 2015/2180) and shrink it — correct as-is. The one place it
still disappears is the **footer bar** under 380px:

```css
@container player (max-width: 380px) {
  :is(.player-art, .track-artist) { display: none; }   /* ← drop .player-art */
}
```

Keep the art, shrink it: `--art-size: clamp(24px, 40cqh, 32px)`. It is the
fastest identification of what is playing and the grid already has a column for it.

---

## 5. Library and sidebar fixes

### 5a. Table margins — `src/app/styles/views.css:255`

`.track-table { padding-inline: var(--sp-4) }` is the sole source of the left and
right margins (nothing above it adds any). Set it to `0` and delete the
`@media (max-width: 620px)` override at line 540. Cells keep their own `--pad-x:
var(--sp-3)`, so nothing touches the window edge — the *table* just stops being
inset from it, and the sticky header spans the full width.

### 5b. Tree scrolls — `layout.css:256` + `LibrarySidebar.tsx`

`.library-sidebar` is `overflow: auto hidden` — horizontal auto, **vertical
hidden** — with a fixed `height: 100%` and a footer pinned by `margin-top: auto`.
Anything past the fold is clipped with no scrollbar and no keyboard route to it.

Wrap the three `<details>` sections (Playback / Folders / Playlists,
`LibrarySidebar.tsx:257-337`) in one scroll region, leaving `.resize-handle` and
`.sidebar-footer` outside it:

```tsx
<div className='sidebar-scroll'>
  <details open>…Playback…</details>
  <details open>…Folders…</details>
  <details open>…Playlists…</details>
</div>
```
```css
.library-sidebar { overflow: hidden; }
.sidebar-scroll  { flex: 1 1 auto; min-height: 0; overflow: hidden auto; overscroll-behavior: contain; }
```

`min-height: 0` is the load-bearing line — a flex item defaults to
`min-height: auto` and refuses to shrink below its content, which is the second
half of why nothing scrolled. `base.css:72` already styles scrollbars for
`.track-scroll, .library-sidebar, .view-content`; add `.sidebar-scroll` there.

### 5c. Single click expands — `FolderTree.tsx:65`

The row click selects and the chevron toggles. Make the row do both:

```tsx
onClick={ () => {
  onSelect(node.path)
  if (hasChildren)
    onToggle(node.path)
} }
```

The chevron keeps its `stopPropagation` (line 79) so it toggles exactly once and
does not also select — that distinction stays useful, and it is what the existing
test at `tests/components/composite/FolderTree.test.tsx:184` asserts.

### 5d. The open folder is revealed — `LibraryContext.tsx` + `LibrarySidebar.tsx`

`selectedFolderPath` lives in `UIContext` (line 113); `expanded` lives on
`FolderEntry` in `LibraryContext`. Nothing expands the ancestors of a folder
selected from a breadcrumb, a track-table folder row, or a restored session, so
the selected row can be inside a collapsed branch.

Add a sibling to `toggleFolder` (`LibraryContext.tsx:240`), reusing the same
immutable-rebuild shape as `toggleFolderBranch` (line 161):

```ts
/** Expands every ancestor of `path` so the row is reachable. Idempotent. */
const revealFolder = useCallback((path: string) => { … }, [])
```

Ancestors are path prefixes, so the walk is `node.expanded || path.startsWith(node.path + sep)`
→ set `expanded: true`; branches off the chain are returned unchanged so React
sees the same references and does not re-render them.

Call it from `LibrarySidebar`, which is the one component holding both values:

```ts
// eslint-disable-next-line react-strict/prefer-no-use-effect -- Reveals a folder selected from somewhere else (breadcrumb, track table, restored session); the selection is not this component's to intercept.
useEffect(() => {
  if (selectedFolderPath)
    revealFolder(selectedFolderPath)
}, [ selectedFolderPath, revealFolder ])
```

### 5e. Now Playing opens on a new track — `src/app/App.tsx`

`AudioContext` cannot reach `openOverlay` (sibling providers, `App.tsx:66-76`),
and the overlay's `Player` only mounts once the overlay is open
(`OverlayHost.tsx:33`), so neither is a valid hook site. `AppContent`
(`App.tsx:10`) sits inside both providers and is the place.

The rule is "starting playback while paused or stopped, onto a *different*
track" — so an auto-advance mid-queue must **not** open it:

```ts
const startedRef = useRef<string | null>(null)   // last id we opened for
const playingRef = useRef(false)                 // isPlaying on the previous tick

// eslint-disable-next-line react-strict/prefer-no-use-effect -- Opens an overlay in response to playback state that no render can derive.
useEffect(() => {
  const id = currentTrack?.id ?? null

  if (id && isPlaying && !playingRef.current && id !== startedRef.current)
    openOverlay('player')

  if (id && isPlaying)
    startedRef.current = id

  playingRef.current = isPlaying
}, [ currentTrack?.id, isPlaying, openOverlay ])
```

`openOverlay` already no-ops when the overlay is the current one
(`UIContext.tsx:238`), so a re-entry is free.

---

## 6. EQ: a focused band — `EqCurve.tsx`

Today `applyAt` re-runs `bandAtX` on every pointer move (line 193), so dragging
sideways re-targets bands and paints a smear. Introduce an explicit focus:

- `const [ focused, setFocused ] = useState(0)` beside the existing `hovered`
  (line 125). `hovered` still drives the ruler on plain mouse-over.
- `onPointerDown`, primary (`event.button === 0`): `setFocused(bandAtX(x))`,
  capture, then `applyAt` — but `applyAt` takes the band as an argument now
  instead of recomputing it, so the whole drag edits the band the press picked.
- `onPointerDown`, secondary (`event.button === 2`): step the focus,
  `setFocused(i => (i + (event.shiftKey ? -1 : 1) + EQ_BANDS.length) % EQ_BANDS.length)`,
  no gain change. Add `onContextMenu={e => e.preventDefault()}` on the `<svg>` so
  the platform menu does not eat it.
- The ruler `<li>` gets `data-focus={focused === index || undefined}` alongside
  the existing `data-hover` (line 270). CSS: `[data-focus]` stays visible even
  when `.eq-curve` is not hovered, in accent, with its `Hz` **and** its `dB`
  shown — the frequency readout the request asks for.
- Keyboard parity is free: the focused band's clipped `<input type='range'>`
  already takes arrows. Add a `useEffect`-free `key`-based scroll into view? Not
  needed — the ruler is a fixed 16-item row, nothing scrolls.

---

## 7. Files touched

| File | Why |
|---|---|
| `src/app/components/composite/AnalysisReadout.tsx` | §2a meta row + `meterOf`, §2b lane |
| `src/app/components/composite/FrequencyMatrix.tsx` | §2c `showNotes` prop, `LABEL_MAX` |
| `src/app/components/composite/EqCurve.tsx` | §6 focused band |
| `src/app/components/composite/FolderTree.tsx` | §5c single-click expand |
| `src/app/contexts/SettingsContext.tsx` | §2c `showSpectrumNotes` |
| `src/app/contexts/LibraryContext.tsx` | §5d `revealFolder` |
| `src/app/layout/LibrarySidebar.tsx` | §5b wrapper, §5d effect |
| `src/app/App.tsx` | §5e auto-open |
| `src/app/components/composite/Player.tsx` | thread `showSpectrumNotes` |
| `src/app/views/SettingsView.tsx` | §2c toggle |
| `src/app/styles/layout.css` | §1, §2b–d, §3, §4, §5b, §6 |
| `src/app/styles/views.css` | §5a |
| `src/app/styles/tokens.css` | `--matrix-wallpaper`, `--chord-pps` |
| `src/app/styles/base.css` | `.sidebar-scroll` scrollbar |

**Token invariant** (`AGENTS.md`): every new custom property goes in
`tokens.css`, nowhere else — a test enforces it.

---

## 8. Public pages

`public/` is a static vanilla site; `public/screenshots/` is generated from
`assets/screenshots/` by `scripts/build-screenshots-manifest.mjs` at deploy
(`.github/workflows/pages.yml`). Twelve of the fifteen tracked shots are already
placed in sections after `def3d55`; the auto-rendered `#screenshot-grid` gallery
already carries all fifteen.

- Place the four that no section references:
  `library-album-groups.png` and `library-sticky-header.png` → `#library`
  (which shows only `library-breadcrumbs.png` today, `index.html:241`);
  `now-playing-lyrics.png` and `now-playing-lyrics-light.png` → `#player`,
  as the light/dark pair for the lyrics layer.
- Add captions for the four in the manifest script's hand-maintained list
  (`scripts/build-screenshots-manifest.mjs:37-113`), or they ship title-cased and
  appended at the end of the gallery.
- Refresh the `#analysis` copy (`index.html:178-200`) to describe the view §2
  produces — chords and key first, spectrum as backdrop — rather than
  "spectrum, chords, key & tempo".
- `readme.md` gets the same two-line correction.

**Goes stale after §2** — re-capture these once the app is running and I will
re-wire them: `now-playing-harmony.png`, `now-playing-harmony-derived.png`
(both show the old label-gutter readout and the full-strength mesh) and
`dsp-chain.png` (if §3's shrink changes the panel's proportions).

---

## 9. Tests and docs — last, once

- `tests/components/composite/AnalysisReadout.test.tsx` — update for the dropped
  `Chord` caption; new cases for the meta row and for `meterOf` (pure, no DOM).
- `tests/components/composite/FolderTree.test.tsx` — line 195's "click selects"
  becomes "click selects and toggles"; line 184's chevron case is unchanged and
  is the guard that the two paths stayed distinct.
- `tests/components/composite/FrequencyMatrix.test.tsx` — labels absent when
  `showNotes` is false.
- New `tests/components/composite/EqCurve.test.tsx` — primary press focuses and
  holds a band through a sideways drag; secondary press steps focus without
  emitting `onGain`.
- New `tests/App.test.tsx` — opens on a different track from paused; does **not**
  open on auto-advance while playing; does not open on resume of the same track.
- `tests/contexts/LibraryContext.test.tsx` — `revealFolder` expands ancestors and
  leaves off-chain branches referentially unchanged.
- `AGENTS.md` — a short **Now Playing** section stating the contract that keeps
  getting rebuilt: two modes (`default`/`analysis`), two composable layers
  (lyrics/DSP), transport and title always mounted, and the class hooks
  (`.player-view`, `.player-content`, `.player-art`, `.progress-section`,
  `.playback-controls`) that the tier and container-query system depends on.
  Add `showSpectrumNotes` to the settings table.
- `docs/DESIGN_GUIDE.md` — the chord-first analysis layout.

---

## What shipped, vs. the plan

Two deviations, both forced by the code:

- **§3's `--dsp-scale`** could not be a unitless `clamp(0.62, 40cqh/30, 1)` —
  `clamp()` cannot mix a bare number with a length. Every DSP dimension is a
  direct `clamp(…px, …cqh, …px)` ramp instead (`--dsp-knob-size`,
  `--dsp-module-gap`, `--dsp-module-pad`, `--dsp-knob-gap` on `.dsp-panel`),
  which is the same idiom `--art-size` already uses. Same effect, one fewer
  indirection. `--chord-pps` hit the identical rule and became a length
  (`clamp(28px, 6cqi, 64px)`), so `.chord-queue` dropped its `* 1px`.
- **§5e** lives in `src/app/hooks/useAutoNowPlaying.ts` rather than inline in
  `App.tsx` — the refs and the reasoning needed a docstring, and it made the
  behaviour testable without mounting the whole app.

§4 turned out to be a grid change as well as a token one: the footer bar's
`(max-width: 380px)` template had no `art` column, so keeping the cover meant
re-templating to `'art info controls'`.

---

## Verification

```bash
bun run lint && bun run typecheck && bun run test
```

Then, for the parts a jsdom test cannot see — **the Electron GUI cannot be
launched from this environment** (`bun run start` never yields a window here), so
these are for you to run:

```bash
bun run start
```

1. Play a track, open Now Playing, toggle the analysis button — the cover should
   fade *upward* out of frame while key/tempo and the chord lane rise into its
   place; the transport must not move except to re-centre.
2. Toggle DSP on a ~900px-tall window and again on a ~600px one — the panel
   shrinks, and no scrollbar appears anywhere in the overlay.
3. Drag sideways across the EQ curve — one band moves, not a smear. Right-click
   steps the highlighted band; Shift+right-click steps back; the ruler shows
   `Hz` and `dB` for the focused band with the pointer away from the curve.
4. Resize the overlay narrow (<720px) — art becomes the top banner with the
   title inside its fade; narrower still, the footer bar keeps a small cover.
5. Collapse every sidebar folder, then click a folder in a breadcrumb — the tree
   expands to it. Add enough folders to overflow the sidebar and confirm it
   scrolls with the footer staying put. Single-click a folder row: it selects
   *and* expands.
6. Pause, then play a different track from the library — Now Playing opens.
   Let a track end and auto-advance — it does **not** open. Resume the same
   track — it does **not** open.

For the site: `node scripts/build-screenshots-manifest.mjs && open public/index.html`
(the `.mjs` manifest exists precisely so `file://` works without a server).
