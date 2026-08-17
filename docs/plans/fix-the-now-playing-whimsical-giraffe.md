# Now playing: two views, two layers

## Context

The now-playing overlay currently has **four mutually exclusive things** competing
for its middle: `playerMode` is `'default' | 'visualizer' | 'dsp'`, and the lyrics
layer sits beside that union as its own boolean. Picking one costs you the others,
and both non-default modes hide `.player-art` *and* `.progress-section` outright —
so the screen you are looking at changes identity every time you press a button.

The harmony readout (key, tempo, chords) is buried *inside* `FrequencyMatrix`,
which means the track's own musical data is a sub-detail of a spectrum widget
rather than a first-class thing to read. The chord strip shows three static words.
The spectrum mesh paints its **oldest** rows on top of its newest. Peak labels
appear and vanish within 160 ms at whatever vertical position the ridge happens to
be. And the sixteen EQ bands are an unlabelled curve — the frequencies exist in the
DOM but are clip-path'd away.

**Intended outcome:** two views (`default` = artwork, `analysis` = mesh + readout)
and two composable layers (lyrics, DSP). Title/artist/album and the transport are
*always* on screen. Everything enters and leaves with a direction that means
something.

---

## 1. State model — `src/app/contexts/UIContext.tsx`

```ts
export type PlayerMode = 'default' | 'analysis'   // was: | 'visualizer' | 'dsp'
```

`dsp` leaves the union and becomes a layer alongside lyrics:

- add `dspOpen: boolean` to `UIState` (initial `false`, beside `lyricsOpen` at ~line 201)
- add `toggleDsp: () => void` and `setDspOpen: (open: boolean) => void` to
  `UIContextValue`, implemented exactly like `toggleLyrics` (lines 225–228)
- session-only, like `overlay` and `playerMode` — not persisted

Call sites to update:
- `src/app/layout/LibrarySidebar.tsx:147-148` — the DSP entry becomes
  `setDspOpen(true)` + `openOverlay('player')` (it must no longer set a mode).
- `src/app/components/composite/Player.tsx:337` — destructure `dspOpen, toggleDsp`.

Rationale for keeping `analysis` a *mode* and `dsp` a *layer*: the analysis view
replaces the artwork (they claim the same space); the DSP page is inserted between
blocks that all stay on screen.

---

## 2. `Player.tsx` — restructure

`.player-view` attributes become:

| attribute | value |
|---|---|
| `data-mode` | `undefined` \| `'analysis'` |
| `data-lyrics` | as today (`lyricsShowing`) |
| `data-dsp` | new — `true` when `expanded && dspOpen` |

`.player-content` children, **in this order** (order is the transition contract):

1. `PlayerArtwork` — `.player-art`, fades out **upward** under `data-mode='analysis'`
2. `PlayerInfo` — `.player-info`, always mounted, always visible
3. **`AnalysisReadout`** — new, always mounted, `data-open` when `mode === 'analysis'`
4. `PlayerActions` — `expanded` only, absolute top-right (unchanged position)
5. `DspPanel` — mounted when `expanded`, wrapped so it can animate open/closed
6. `.progress-section` — **now stays visible in analysis mode** (it was hidden)
7. `PlayerTransport` — always

`FrequencyMatrix` stays the absolutely-positioned backdrop it already is
(`.frequency-matrix`, inset off `.player-content`). It is mounted whenever
`expanded` and driven by `active={mode === 'analysis'}` — the rAF loop already
gates on `active` (FrequencyMatrix.tsx:299), so an inactive mesh costs nothing
while its fade-out plays.

`PlayerActions` changes:
- `.visualizer-toggle` → `.analysis-toggle`, label "Show audio analysis" /
  "Show album art", `aria-pressed={mode === 'analysis'}`
- `.dsp-toggle` → `aria-pressed={dspOpen}`, `onClick={toggleDsp}` (still **not**
  `disabled={!hasTrack}` — an EQ curve is editable in silence)
- lyrics + close unchanged

`PlayerPanel` (Player.tsx:188-214) is deleted — nothing switches on mode any more.

---

## 3. New file — `src/app/components/composite/AnalysisReadout.tsx`

Moves `ChordStrip`, `KeyTempo`, `HarmonyDetails` and `chordAt` **out** of
`FrequencyMatrix.tsx` (lines 180–258) so the mesh component is just the mesh.

```
<section className='analysis-readout' data-open aria-label='Audio analysis'>
  <KeyTempo/>          ← the existing <dl className='key-tempo-summary'>, unchanged
  <ChordRibbon/>       ← replaces .chord-strip
</section>
```

Status branches (`loading` / `error` / no analysis) keep their existing
`.status-message.harmony-status` markup.

### `ChordRibbon` — the moving chord timeline

`ChordSegment` (`services/types.ts:102-108`) carries absolute `start`/`end` in
seconds, which is all the geometry needed.

```
┌─ .chord-now ───┬─ .chord-queue (overflow: hidden) ─────────────┐
│  Am            │      F          C              G              │
│  ↑ pinned      │  ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←     │
└────────────────┴───────────────────────────────────────────────┘
   flashes on          distance from the anchor = time until it plays
   activation
```

- **`.chord-now`** is `position: relative` with two absolutely-stacked children:
  the outgoing segment (`data-state='past'`) and the current one
  (`data-state='current'`). Both are **React-keyed by `chord.start`**, so a chord
  change mounts a new element — which is what makes the CSS animations fire with
  no JS teardown:
  - `@keyframes chord-flash` on `[data-state='current']` — a one-shot accent
    bloom (`scale` + `text-shadow`) settling into the resting style.
  - `@keyframes chord-depart` on `[data-state='past']`, `animation-fill-mode: both`
    — translate left by `--shift-md` and fade to 0, then stay there. It unmounts
    on the *next* chord change; the fill keeps it invisible in between.
- **`.chord-queue`** renders only the visible window — segments with
  `start > now && start < now + LOOKAHEAD_S`. Each is absolutely positioned at
  `left: calc(var(--at) * var(--chord-pps) * 1px)` where `--at` is `chord.start`.
  The **lane** is translated by `-now * pps`, so on-screen offset is exactly
  `(start − now) × pps`. One style write per frame, whatever the chord count.
- **Motion**: `currentTime` reaches the renderer from the `timeupdate` listener
  (`AudioContext.tsx:361`), i.e. ~4 Hz — far too coarse to move a ribbon. A rAF
  loop in `ChordRibbon` interpolates
  `now = currentTime + (performance.now() − stamp) / 1000` while `isPlaying`, and
  writes `lane.style.translate` through a ref. React re-renders only when the
  active chord index changes (~1/s). Same idiom as `FrequencyMatrix` and
  `EqCurve`: refs for the loop, state for the words.
  - Loop is skipped entirely under `prefers-reduced-motion` (positions are still
    written once per `currentTime` prop change).
- **Pure helpers, extracted so they are testable without a DOM**:
  `chordAt(chords, time)` (moved as-is) and
  `visibleChords(chords, time, lookahead)`.

New props `Player` must pass down: `isPlaying`, `currentTime`, `analysis`.

---

## 4. `FrequencyMatrix.tsx` — depth order, current row, peak labels

### 4a. Older lines behind the current one

`paint()` (line 354) emits rows `t = 0 → HISTORY-1`, i.e. **newest first**, and in
SVG later subpaths paint on top — so today the *oldest* row is drawn over
everything. Reverse the loop to `t = HISTORY-1 → 0`.

### 4b. The current row, drawn like the EQ curve

Split row 0 out of `#matrix-freq` into its own `<path ref={currentPathRef}>`:

```
<path className='matrix-line-z'/>                              ← time lines, furthest back
<use className='matrix-line-x' mask='#matrix-far'  filter='#matrix-dof'/>   ← blurred history
<use className='matrix-line-x' mask='#matrix-near'/>                        ← sharp history
<path className='matrix-current' ref={currentPathRef}/>        ← newest row, on top
```

`#matrix-freq` now holds rows `1 … HISTORY-1` only, so the current row is neither
masked nor blurred. Its `d` closes to the baseline
(`… L VIEW_W,baseY[0] L 0,baseY[0] Z`) so it can carry a fill. Three
`setAttribute` calls per frame instead of two.

CSS, ported from `.eq-line` / `.eq-spectrum` (layout.css:1101-1114):

```css
.matrix-current {
  fill: color-mix(in srgb, var(--accent) 20%, transparent);
  stroke: var(--accent);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
```

### 4c. Peak labels: one clean row, long fade

Today `setPeaks` replaces the whole array every `LABEL_INTERVAL_MS` (160 ms), so a
label that drops out of the top 3 vanishes instantly, and `y` is the ridge height
— hence the "random vertical position".

- Keep a `Map<string, { note, hz, x, seenAt }>` in a ref. Each tick upserts the
  found peaks and drops entries older than `LABEL_TTL_MS` (**2400**). Cap the
  rendered set at `LABEL_MAX = 8`, most-recent first.
- `y` is gone. Labels render in one row at the top of `.matrix-peaks`
  (`top: 0`), so only `left` is data.
- Age drives a `--peak-fade` custom property (`1 → 0` across the TTL) written into
  the inline style beside `left`; CSS reads `opacity: var(--peak-fade)`.
- `assignLanes` (lines 107–123) is replaced by **`spreadLabels`** — same
  left-to-right sweep, but it pushes overlapping labels apart *horizontally* to
  `LABEL_MIN_GAP` and clamps into `[0, VIEW_W]`, instead of stacking lanes
  vertically. `--lane` and the `translate: … var(--lane) * 2.4rem` rule
  (layout.css:921) go away.

---

## 5. `EqCurve.tsx` — band frequencies on hover

The sixteen labels already exist (`<span>{band.label} Hz</span>`, EqCurve.tsx:231)
— they are just clipped by `.eq-bands` (layout.css:1131-1140). **Move the clipping
from the `<ol>` to the `<input>`** so the list becomes a real ruler while the range
controls stay visually hidden but focusable.

- Each `<li>` gets `style={{ '--at': BAND_X[index] / VIEW_W }}` and is positioned
  `left: calc(var(--at) * 100%)`, `translate: -50% 0`, along the curve's bottom edge.
- The ruler is `opacity: 0` and reveals on `.eq-curve:is(:hover, :focus-within)`.
- 16 labels over a ~52ch column collide, so **stagger two rows**:
  `li:nth-child(even) { translate: -50% 100% }`.
- Nearest-band highlight: `EqCurve` tracks a `hovered` index from `pointermove`
  using the existing `bandAtX` (line 65) — `setState` only fires when the index
  changes (16 possible values), so this is not a per-frame render. The matching
  `<li>` gets `data-hover` → accent colour and its dB value appended.
- `pointerleave` clears it.

---

## 6. Layout / motion — `src/app/styles/layout.css`

New tokens next to the existing player block (`:root`, ~line 432):

```css
--analysis-rise: var(--shift-md);   /* how far the readout travels up into place */
--dsp-shift: var(--shift-md);
--chord-pps: 34;                    /* px per second of chord lookahead */
--art-banner-h: min(56cqh, 62cqw);
```

### 6a. Analysis view

Replace `&[data-mode='visualizer'] :is(.player-art, .progress-section){display:none}`
(line 469) with:

- `.player-art` — `opacity: 0; translate: 0 calc(-1 * var(--shift-md)); display: none`,
  transitioned with `transition-behavior: allow-discrete` + `@starting-style`
  (the project's standard pairing). **Fades out upward.**
- `.progress-section` stays visible.
- `.analysis-readout` — closed state `opacity: 0; translate: 0 var(--analysis-rise);
  display: none`; `&[data-open]` reverses it with `@starting-style`. **Rises up
  into place**, and leaves back downward via `--ease-exit`.
- `.frequency-matrix` gets the same `data-open` fade, so the mesh arrives with the
  readout rather than popping.

### 6b. DSP layer

Scoped inside the existing `@container player (min-width: 721px)` (line 1264) —
the panel is already hidden below that width and stays so.

- The `DspPanel` sits in a wrapper animating `grid-template-rows: 0fr → 1fr`
  (interpolatable; `display`/`height:auto` are not). The flex items above and
  below therefore *travel* rather than jump: info + readout ride up, progress and
  transport ride down.
- `.player-content[data-dsp]` shrinks what has to give so nothing scrolls:
  `--content-pad-block: 8vh`, `--play-size: 44px`,
  `--play-glyph-size: var(--text-xl)`, `.playback-controls { gap: var(--sp-4) }`.
- `.dsp-panel` keeps `min-height: 0` + `overflow-y: auto` + `scrollbar-width: none`
  as a floor, but the shrink above is what makes it unnecessary in practice.

### 6c. Album art tiers

**Smallest (`mini` / `compact` height tiers) — art pinned left.** Delete
`.player-art { display: none }` from the `@container player (max-width: 260px)`
blocks at lines 1460-1471 and 1511-1520, and from `(max-width: 180px)` (1522).
Instead shrink `--art-size` (`clamp(28px, 50cqh, 48px)`) and keep the existing
`grid-template-areas: 'art info …'` — the art is already leftmost there.

**Semi-small (overlay, `@container player (max-width: 720px)`) — full-bleed banner.**
Scoped with `.player-overlay` (the class `OverlayHost` puts on the dialog), so the
footer bar and the small-window tiers are untouched:

```css
.player-overlay .player-art {
  position: absolute; inset: 0 0 auto; z-index: 0;
  width: 100%; height: var(--art-banner-h);
}
.player-overlay .album-art-card {
  width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0;
  mask-image: linear-gradient(#000 55%, transparent);
}
.player-overlay .player-info { margin-block-start: calc(var(--art-banner-h) - var(--sp-8)); }
```

`.player-content` is already `position: relative` (line 538), so the absolute art
anchors to it; `z-index: 0` puts it **under** the title, and the mask is the
gradient fade the title sits in. The `data-mode='analysis'` fade-out rule above
applies here unchanged.

### 6d. Stacking

`.analysis-readout` needs `position: relative; z-index: var(--z-raised)` for the
chord ribbon — the mesh is positioned and paints over non-positioned siblings
(that overlap is deliberate for `.player-info`, but a moving ribbon under a
`color-burn` wireframe is unreadable). Same one-declaration trick
`.playback-controls` already uses (line 624).

---

## 7. Settings — `src/app/contexts/SettingsContext.tsx`

Flip the defaults at lines ~189-190: `showChordAnalysis: true`,
`showKeyAnalysis: true` (analysis is now a main view; it must not open empty).
`showBeatMarkers` stays `false`.

⚠ **Caveat to state, not fix:** `loadSettings` shallow-merges stored settings, so
an existing install that already persisted `false` keeps it. A one-time migration
is out of scope here — flag it if you want it.

---

## 8. Public pages

Source of truth is `assets/screenshots/` (15 PNGs). Three are currently referenced
nowhere: `now-playing-harmony-derived.png`, `now-playing-lyrics-compact.png`,
`mini-player-themed.png`.

- **`readme.md`** — add the three missing shots; refresh the surrounding copy to
  describe two views + two layers rather than four modes.
- **`public/index.html`** — same, in the `player` / `analysis` / `mini` sections;
  update `alt` text (currently e.g. *"Now playing view with the frequency mesh,
  the current chord, key and tempo"*, line 176).
- Run `node scripts/build-screenshots-manifest.mjs` to refresh
  `public/screenshots/`, `public/screenshots.json` and `public/screenshots.mjs`.
- Delete the orphans: `mini-final.png` (repo root) and `public/prosody.png`.

Screenshots predate this UI change; the copy describes the new model, the images
are the current captures — recapture is a separate pass.

---

## 9. Tests & docs — last, once

**Update**
- `tests/components/composite/Player.test.tsx` — the mode-exclusivity case
  (visualizer ⊻ dsp) inverts to **compose**: analysis + DSP + lyrics all on at
  once, transport and `.track-title` still in the tree. "Clicking active mode
  returns to artwork" now applies to `.analysis-toggle` only.
- `tests/components/composite/FrequencyMatrix.test.tsx` — harmony assertions move
  out; peak-label assertions become row-placement + TTL.
- `tests/contexts/UIContext.test.tsx` — `dspOpen` / `toggleDsp`.
- `tests/components/composite/DspPanel.test.tsx` — EqCurve band-label DOM moved
  from clipped `<ol>` to a positioned ruler.

**Add**
- `tests/components/composite/AnalysisReadout.test.tsx` — `chordAt` and
  `visibleChords` as pure functions (no rAF, no DOM), plus the pinned/queued
  split and `data-state` transitions.

**Docs**
- `CLAUDE.md` — rewrite *"Now playing: what fills the middle"*, *"The lyrics
  layer"*, *"The frequency matrix"*, *"Player tiers"*.
- `docs/music-analysis.md` — note the readout is its own component now.

---

## Verification

```bash
bun run typecheck      # union narrowing must surface every stale 'visualizer' | 'dsp'
bun run lint           # zero errors, zero warnings — every new useEffect needs its disable + reason
bun run test
```

Then, in the running app (`bun run start` — **the agent cannot launch the Electron
GUI in this sandbox, so this is a hand-off step**):

1. Play a track with resolved analysis. Toggle **analysis** — art fades up, key /
   tempo / chords rise in under the title, transport never moves out of reach.
2. Watch the chord ribbon across a boundary: the incoming chord flashes at the
   anchor, the outgoing one scrolls left and fades.
3. Toggle **DSP** on top of analysis — the column pans up, controls pan down and
   shrink, no scrollbar anywhere. Toggle **lyrics** on top of both.
4. Toggle each off; confirm every exit animates the opposite direction.
5. Hover the EQ curve — band frequencies appear, nearest one highlighted.
6. Resize: >720px normal, ≤720px art becomes a top banner with the title in its
   fade, then drag the window short — `compact` and `mini` keep art pinned left
   down to the narrowest width.
7. Confirm the mesh's newest row is the solid accent curve in front and history
   recedes behind it.
