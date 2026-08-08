# Fix: collapsed-sidebar gutter + waveform seek bar

> The previous plan in this file (invisible dev window + empty library) is
> **done and verified**: `db-reader.js`/`db-writer.js` build for the first time,
> hydration streams 5991 tracks in 30 batches, the list payload dropped from
> 372 MB to ~1 MB, the dev server binds dual-stack, and no Electron process
> survives a quit. Gates: typecheck clean, 0 lint errors, 220 tests passing.

## Context

Two visual defects in the full-window player, both visible in the same
screenshot:

1. **A ~220px empty gutter down the left of the player view.** Album art,
   title, waveform and transport are centred on the midpoint of the
   *remaining* space, so the player reads as pushed right.
2. **The waveform seek bar looks broken.** A hard 2px accent rectangle frames
   the control, and the played region is a solid accent block that erases the
   waveform shape instead of tinting it.

### Root cause 1 — the sidebar's inline width pins the track open

`LibrarySidebar.tsx:68` applies the resize handle's output unconditionally:

```tsx
return <nav className='library-sidebar' style={{ width }} aria-label='Library'>
```

That definite width defeats the collapse two ways over. `.app-sidebar` is a
`flex-shrink: 0` flex item of `.app-workspace` with `flex-basis: auto`, so it
is sized from its max-content contribution — and under a max-content
constraint a flexible track's growth limit *is* max-content, i.e. the child's
220px. The `0fr` track therefore resolves to 220px in every state; measured in
Chromium, `grid-template-columns` computes to `220px` whether the shell has
`data-sidebar-open` or not, and animating it interpolates 220px → 220px.

Only `opacity: 0` (`layout.css:111`) actually applies, which is why the column
is *empty* rather than gone. The gutter is whatever width you last dragged to.

This is a regression from `e88819a` ("Animate every UI mutation, both
directions"). Before it, `layout.css` had `width: 0` on close and
`display: none` in player view — both were replaced by the `0fr` track, and
nothing took over their effect on the **outer** box.

Two consequences beyond the gutter: `.player-view` is `container: player / size`,
so its container queries see the narrowed width and tier breakpoints fire
early; and the bug is invisible below the `snug` height tier, because
`layout.css:152` still hard-hides `.app-sidebar` with `display: none` there.

### Root cause 2a — the accent rectangle is a stuck focus ring

`layout.css:655`:

```css
&:focus-within { border-radius: var(--radius); box-shadow: var(--focus-ring); }
```

`--focus-ring` is `0 0 0 2px var(--border-focus)` → `--accent`, at
`--radius: 0`. `:focus-within` matches whenever the `opacity: 0` range input
holds focus, including after a plain mouse click to seek — exactly the case
`:focus-visible` exists to exclude. One click leaves the ring painted for the
session. The global input border (`components.css:62`) explicitly excludes
`[type='range']`, so it was never a native border.

The sharp corners are **not** the bug — `--radius: 0` is deliberate, commented
*"MONO is deliberately sharp"* (`tokens.css:134`). The fix keeps it square.

### Root cause 2b — the played block is a stroke scaled by the viewBox

`layout.css:675-678`:

```css
.waveform-unplayed { fill: var(--wf-unplayed); stroke: var(--wf-unplayed); }
.waveform-played   { fill: var(--wf-played);   stroke: var(--wf-played); }
.waveform-shape { transform-box: fill-box; transform-origin: center; }
.waveform-line  { display: block; vector-effect: non-scaling-stroke; stroke-width: 1px; }
```

Those colour rules are shared by *both* representations — the `<use>` amplitude
shapes and the `<line>` hairline fallbacks (`WaveformProgress.tsx:66-74`) — but
only `.waveform-line` constrains the stroke. The shapes stroke at SVG's default
`stroke-width: 1`, which is **one user unit**, and the viewBox is
`0 0 ${barCount} 1` with `preserveAspectRatio='none'`. One vertical user unit
is the full ~40px height of the control, so every bar is outlined with a pen
40px thick and adjacent bars (pitch 1, width 1, no gap) merge into a
continuous full-height band.

That is why the played region is *taller than the waveform it covers*. The clip
is working perfectly — the hard vertical edge is the clip. The unplayed side
has the identical defect and only escapes notice because `--wf-unplayed` is
15% opaque, so its fat stroke reads as haze; the accent is opaque, so its shape
information is annihilated.

Ruled out: the `clipPath` id is unique per instance via `useId()`; mini
two-line mode is not active at this tier; no `<rect>` is ever painted.

## Plan

### 1. Waveform — `src/app/styles/layout.css` only

No component changes. Split the shared colour rule by representation: a
`<line>` has no fill and needs `stroke`; a closed bar path needs only `fill`.

```css
/* Shapes are closed paths — fill only. A stroke here is measured in user
   units and the viewBox is one unit tall, so it paints a band the full height
   of the control instead of an outline. */
.waveform-shape.waveform-unplayed { fill: var(--wf-unplayed); }
.waveform-shape.waveform-played   { fill: var(--wf-played); }
.waveform-shape { fill-rule: nonzero; stroke: none; transform-box: fill-box; transform-origin: center; }

/* Lines have no fill; the stroke *is* the mark, pinned to device pixels. */
.waveform-line.waveform-unplayed { stroke: var(--wf-unplayed); }
.waveform-line.waveform-played   { stroke: var(--wf-played); }
```

Then replace the stuck ring at `layout.css:655`:

```css
/* `:focus-within` matched the invisible range input after a plain click to
   seek and never let go. Keyboard focus still rings. */
&:has(:focus-visible) { box-shadow: var(--focus-ring); }
```

Drop `border-radius: var(--radius)` — it resolves to `0`.

### 2. Sidebar — lift the width into `UIContext`, animate the outer box

`CLAUDE.md` justifies the `0fr` track with "`width: auto` → `0` does not
interpolate". True — but that only forced the grid hack because the width was
`auto`. Once it is a **number in state**, `width: 220px → 0` interpolates
natively, and the outer box is the thing that actually needs to collapse. The
grid track goes away.

**`src/app/contexts/UIContext.tsx`** — add `sidebarWidth` + `setSidebarWidth`
beside `density`/`grouping`, persisted with the same `SIDEBAR_WIDTH_KEY`
pattern and read through the existing guarded `readSetting()` helper (added
this session — it swallows the throw a locked profile raises inside a
`useState` initialiser). Move `MIN_WIDTH`/`MAX_WIDTH`/`DEFAULT_WIDTH` and
`clampWidth` here so the clamp also guards a corrupt stored value.

**`src/app/layout/AppLayout.tsx`** — stamp the width on the shell as a custom
property. A custom property sizes no box, so it cannot pin anything:

```tsx
style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
```

**`src/app/layout/LibrarySidebar.tsx`** — drop `useState`, read width and
setter from `useUI()`, and **remove `style={{ width }}`** along with the
file's now-unneeded `eslint-disable react-strict/no-style-prop` header. The
`role="separator"` handle and its `aria-valuenow` stay exactly as they are.

**`src/app/styles/layout.css`** — replace the `.app-sidebar` grid block:

```css
/*
 * The width is a real length (UIContext → `--sidebar-w` on the shell), so the
 * outer box can animate straight to zero. This used to be a `1fr`→`0fr` grid
 * track because the width was `auto`; the track never actually collapsed, as
 * the child's inline width floored it and only `opacity` ever applied.
 */
.app-sidebar {
  flex: 0 0 var(--sidebar-w);
  overflow: hidden;
  transition:
    flex-basis var(--duration) var(--ease-emphasis),
    opacity var(--duration-fast) var(--ease);

  .app-shell:not([data-sidebar-open]) &,
  .app-shell[data-view='player'] & { flex-basis: 0; opacity: 0; }
}

/* Fixed, not `100%`: the panel keeps its width and is clipped by the parent,
   so its contents slide out instead of reflowing on the way. */
.library-sidebar { width: var(--sidebar-w); }
```

Finally, `--sidebar-w-min` / `--sidebar-w-max` (`tokens.css:144-145`) are dead
— nothing references them, and they duplicate the JS constants. Delete them;
`UIContext` owns the clamp.

## Out of scope (noted, not changed)

- `.waveform-progress.compact` (`layout.css:656, 662-665`) is dead CSS —
  `Player.tsx:244-248` is the only call site and never passes `compact`. Tier
  differences are all CSS. Harmless; a separate cleanup.
- `LibrarySidebar`'s drag uses raw `event.clientX` as the width rather than a
  delta. Correct only because the sidebar sits at viewport x=0 — true today.

## Verification

- **Sidebar**: with the sidebar closed, the player's album art and transport
  must be centred on the **window**, no dark gutter. Toggle it open/closed in
  library view and watch it *animate* rather than jump — that is the part the
  `0fr` track was never actually doing. Drag the handle, restart the app, and
  confirm the width came back.
- **Waveform**: click the bar to seek → **no ring**. Tab to it → **ring**.
  That distinction is the whole fix and the only way to catch a regression.
- The played region must show the waveform silhouette tinted accent, the same
  height as the unplayed side, with a clean vertical edge at the playhead —
  and the unplayed side should now be crisper too, since it had the same
  stroke.
- Check the mini height tier still shows the solid hairline (`waveform-line`),
  and light theme (`--wf-unplayed` differs at `tokens.css:199`).
- `bun run typecheck && bun run lint && bun run test`.

Update `CLAUDE.md` afterwards: the **Motion** section's claim that the sidebar
"collapses a `1fr` → `0fr` grid track" is now wrong in both directions — it
describes a mechanism that never worked, and the replacement animates
`flex-basis` off a persisted `--sidebar-w`.
