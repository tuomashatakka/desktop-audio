# Four regressions from the one-DOM player pass

## Context

Two recent passes are responsible. The first is committed as `310f976` ("Minor
UI fixes and tweaks") — single-click folder expand, `revealFolder`, the
chord-first analysis view. The second is in the working tree — the DSP page
moved to its own overlay, `Player` rewritten to render **one markup always**
with no conditional rendering, and the stylesheet split along the layer
boundaries `STYLE_GUIDE` describes.

Three of the four reports are regressions from those; the fourth is older and
merely became visible. All are diagnosed from the source, not guessed:

| Symptom | Root cause | From |
|---|---|---|
| The small player variants are never displayed | The only caller of `useWindowScale` is now a button inside `.player-actions`, which is `display: none` outside `.player-overlay` — so from the footer bar the compact window size is **unreachable**. And even when reached, `.frequency-matrix` is an unplaced item in every tier's grid. | working tree |
| Selecting a folder shows its contents wrong | `revealFolderBranch` force-expands the *selected node itself*, not just its ancestors, so it reverts the collapse the same click just fired. | `310f976` |
| A selected folder row in the list view is a pill | `.folder-entry` is a real `<button>`, and the `reset` layer gives every bare `<button>` `border-radius: var(--control-radius)` — `999px`. Nothing ever overrides it. | `da9be1c`, pre-existing |
| The UI freezes for a while | `ChordRibbon`'s rAF effect **re-subscribes four times a second** (its dep array holds `currentTime`) and is ungated by `open`, so it now runs in **both** mounted `Player` copies. Compounded by `subfolderRows` recomputing at O(children × tracks) on every folder click. | working tree + `310f976` |

Everything below is a fix for one of those. No new features.

---

## 1. The small player variants

### 1a. The window-size toggle is unreachable — `Player.tsx`, `layout.css`

`useWindowScale` (`src/app/hooks/useWindowScale.ts`) is what swaps the window
between `expandedSize` and `compactSize` (default `560×240` → the `compact`
height tier). Grepping the tree, it has **exactly one** caller:
`Player.tsx:335` → `onResize` → `.window-size-toggle` inside `PlayerActions`.
And `PlayerActions` is:

```css
.player-actions {
  display: none;
  .player-overlay & { … display: flex; }
}
```

It used to hang off the album-art button, which was in the footer bar. That
button is gone — correctly, since clicking the cover rearranging the view is the
thing that was reported last round — but nothing replaced it *in the bar*.

**Fix, in the spirit of the one-DOM rule: the element is always there, and each
context shows the subset it has room for.** Give each `<li>` in `PlayerActions`
a class the way `PlayerTransport` already does (`<li className='mode shuffle'>`):

```tsx
<li className='view'>…analysis toggle…</li>
<li className='lyrics'>…lyrics toggle…</li>
<li className='size'>…window-size toggle…</li>
<li className='close'>…close…</li>
```

Then in `layout.css`, inside the shell copy only, show the menu with just that
one button in it:

```css
.app-shell .player-actions {
  display: flex;
  grid-area: size;

  > li:not(.size) { display: none; }
}
```

and add a `size` column to the three tier grids that currently have none —
`[data-height-tier='normal']` (`'art info controls progress'`),
`[data-height-tier='compact']`, `[data-height-tier='mini']`. In `mini` this
single button is the only way back out of a 160px-tall window, so it stays even
below the 180px width where `.playback-controls` is dropped.

The icon should reflect direction: `minimize` while large, `maximize` while
already compact. `useWindowScale` already branches on
`window.innerHeight < CHROME_MAX_HEIGHT`; the same test can pick the icon and
the label (`useHeightTier`'s value is already on `.app-shell`, and `Player`
can read `tier` from the same hook rather than re-measuring).

### 1b. `.frequency-matrix` breaks every tier grid — `layout.css`

`.player-content` is `display: grid` with named areas in the `normal`,
`compact` and `mini` tiers. Of the children `Player` now always renders:

| child | grid area | default |
|---|---|---|
| `.player-art`, `.player-info`, `.progress-section`, `.playback-controls` | assigned | — |
| `.analysis-readout` | none | `display: none` ✅ |
| `.player-actions` | none | `display: none` ✅ (fixed by 1a) |
| **`.frequency-matrix`** | **none** | `height: 0; opacity: 0` — **still a grid item** ❌ |

An unplaced grid item auto-places into an implicit **second row** and adds the
grid's `gap` to it. `.player-view` is `height: var(--player-bar-h)` with
`overflow: hidden`, so the bar's real content is pushed and clipped; in the
`compact`/`mini` tiers `align-content: center` shifts everything off-centre.

Fix — one rule beside the tier blocks, following the same "the place selects it"
principle the analysis layout already uses:

```css
/* The analysis furniture is in the DOM of both copies (one markup), but only
   the overlay has anywhere to put it. In the shell's copy `.player-content` is
   a *grid* with named areas, so a merely-collapsed element still auto-places
   into an implicit row and adds a gap — which is what pushed the transport out
   of a 72px bar. */
.app-shell :is(.frequency-matrix, .analysis-readout, .player-lyrics) { display: none; }
```

---

## 2. Folder selection — `LibraryContext.tsx`

`revealFolderBranch` (`src/app/contexts/LibraryContext.tsx:198`) treats the
target as on-chain and rebuilds it with `expanded: true`:

```ts
const onChain = path === folder.path || path.startsWith(`${folder.path}/`) || …
if (!onChain) return folder
…
return FolderEntry.fromFolderNode({ …, expanded: true })
```

Its own docstring says *"Expands every **ancestor** of `path`"* — the node
itself is not an ancestor. Combined with `FolderTree`'s row click now firing
`onSelect` **and** `onToggle`, one click on an open folder collapses it and the
effect immediately re-opens it; clicking the same row again does collapse it,
because `selectedFolderPath` did not change so the effect never ran. That
alternation is the "not displayed correctly".

**Fix:**

- Return the target unchanged: ancestors open, the node keeps its own state.
  ```ts
  if (path === folder.path)
    return folder
  ```
- Guard the separator concat. A library root whose path is `/` produces `'//'`
  and matches nothing; strip a trailing separator before the prefix test. Reuse
  the same normalisation `subfolderRows`/`countUnder` rely on
  (`src/app/utils/folders.ts`) rather than inventing a second one.

The row click keeps toggling — a single click expanding *and* collapsing is what
was asked for, and the track table is driven by `selectedFolderPath`, not by
`expanded`, so collapsing never empties it (`subfolderRows` walks `.children`
directly — verified, `utils/folders.ts:53`).

---

## 3. Pill-shaped rows — `base.css`

*Not a regression — this dates to `da9be1c`, when `.folder-entry` was added
without a radius reset. It is in scope because it was reported.*


`src/app/styles/base.css`, `@layer reset`:

```css
button { border: 0; border-radius: var(--control-radius); … }
```

`--control-radius` is `999px`. `FolderRows.tsx` renders each subfolder as
`<button className='track-row folder-entry'>`, and `views.css` never resets the
radius — so the moment the row takes a background (`:hover`, `[data-selected]`)
it is a pill.

**Fix: the reset stops giving every `<button>` a control radius.** A radius is a
*component* decision, and `.button` in `components.css` already sets it. Drop
the declaration from the reset, then sweep the bare-`<button>` classes that were
silently relying on it and give each an explicit radius where it wants one:
`.sidebar-action`, `.add-playlist`, `.playlist-row`, `.folder-row`,
`.titlebar-btn`, `.track-column-header`, `.player-promote`. Most are full-width
rows and should be square; check each against a screenshot rather than assuming.

---

## 4. Responsiveness

Two independent costs, both introduced or amplified last pass. Fix both.

### 4a. `countUnder` is O(children × tracks) — `src/app/utils/folders.ts`

```ts
function countUnder (tracks, path) { … for (const track of tracks) if (track.path.startsWith(prefix)) count++ }

export function subfolderRows (folders, selectedPath, tracks) {
  return children.map(child => ({ …, trackCount: countUnder(tracks, child.path) }))
}
```

One pass over every track **per subfolder**. Forty subfolders over a
50 000-track library is two million `startsWith` calls, synchronously, inside a
`useMemo` that `LibraryView.tsx:112` re-runs whenever `folders` **or**
`selectedFolderPath` changes.

And a single folder click now changes `folders` **twice** — `toggleFolder` then
`revealFolder` — so that memo, `flattenVisible`, the whole sidebar tree and the
table's virtualizer all recompute twice per click.

**Fix:** count in one pass. Walk `tracks` once, and for each track increment
every child whose prefix it matches — or better, since the children are siblings
under one parent, derive each track's immediate child bucket by slicing the path
after `selectedPath` and counting into a `Map`. O(tracks) total instead of
O(children × tracks).

### 4b. The chord ribbon's loop re-subscribes 4×/sec, in both copies — `AnalysisReadout.tsx`

The worst of the two, and worse than it looks. `AnalysisBody` renders regardless
of `open` (`AnalysisReadout.tsx:360-368`) — `open` only sets `data-open` for the
CSS transition — so `ChordRibbon` mounts whenever `showChordAnalysis` (default
**on**) and the track has chords. Its effect:

```ts
useEffect(() => { … }, [ currentTime, isPlaying ])
```

`currentTime` ticks ~4×/sec off `timeupdate` (`AudioContext.tsx:343`), so this
effect **tears down and re-establishes its `requestAnimationFrame` loop four
times a second** — deliberately, to re-anchor against real playback position.
That was one loop in one mounted copy before. It is now two, permanently,
whether or not the overlay is open and whether or not the analysis view is the
one showing.

`FrequencyMatrix` got this right in the same pass (`active={ animating }`, and
`animating` is `expanded && analysing`); the ribbon was missed.

**Fix:**

- Thread `open` into `AnalysisBody` and gate the ribbon's loop on
  `isPlaying && open`, and `AnalysisProgress`'s `setInterval` likewise. Elements
  stay mounted — the `display` transition needs them — and `open` is a *value*,
  so the one-DOM invariant holds and the `innerHTML`-equality test still passes.
- Wrap `FrequencyMatrix` in `React.memo`. Its props (`analyzer`, `active`,
  `showNotes`) are all stable, it writes through refs, and it is currently
  reconciled — SVG `defs`, gradients, two masks — twice on every `currentTime`
  tick because `Player` is not memoized.

### 4c. The sidebar tree is unvirtualized — `layout`/`components.css`

`TrackTable` uses `@tanstack/react-virtual`; `FolderTree` renders one `<li>` per
visible node with no cap. Expanding a large branch renders every row
synchronously.

Full virtualization is a bigger change than this round warrants and would fight
`useTreeNavigation`'s index arithmetic. Take the cheap 90%: add
`content-visibility: auto` with a `contain-intrinsic-size` matching the row
height to `.folder-row` and `.playlist-row`, so the browser skips layout and
paint for off-screen rows. If that is not enough on a real library, virtualize
the tree in a follow-up — note it rather than half-doing it here.

---

## Files touched

| File | Why |
|---|---|
| `src/app/components/composite/Player.tsx` | §1a `<li>` classes, tier-aware icon/label |
| `src/app/styles/layout.css` | §1a shell action menu + `size` grid column in three tiers; §1b the `display: none` rule |
| `src/app/contexts/LibraryContext.tsx` | §2 ancestors only, separator guard |
| `src/app/styles/base.css` | §3 drop the reset radius |
| `src/app/styles/components.css`, `views.css` | §3 explicit radii on the swept classes; §4c `content-visibility` |
| `src/app/utils/folders.ts` | §4a single-pass counting |
| `src/app/components/composite/AnalysisReadout.tsx` | §4b gate the loops on `open` |
| `src/app/components/composite/FrequencyMatrix.tsx` | §4b `React.memo` |

### Out of scope, noted

`FolderTree` is not virtualized where `TrackTable` is. §4c takes the cheap
`content-visibility` win; if a real library still stalls after that, virtualizing
the tree is a follow-up with its own risk — `useTreeNavigation` does index
arithmetic over `flattenVisible` and calls `.focus()` on rows by
`data-tree-path`, both of which assume every visible row is in the DOM.

---

## Tests and docs — last, once

- `tests/utils/folders.test.ts` — `subfolderRows` returns the same counts after
  the rewrite (nested folders, a track directly in the parent, an empty folder).
- `tests/contexts/LibraryContext.test.tsx` — extend the existing `revealFolder`
  suite: a **collapsed** target stays collapsed while its ancestors open, and a
  root path with a trailing separator still reveals.
- `tests/components/composite/FolderTree.test.tsx` — clicking an open folder
  collapses it (the pair to the existing expand case).
- `tests/components/composite/AnalysisReadout.test.tsx` — no rAF is scheduled
  while `open` is false.
- `tests/components/composite/Player.test.tsx` — the window-size button is in
  the tree in both copies; the `innerHTML`-equality test must still pass.
- `AGENTS.md` — under **Now Playing**, add the trap §1b is: *everything is
  always mounted, so anything without a grid area in the tier layouts must be
  `display: none` there, not merely collapsed.*

---

## Verification

```bash
bun run lint && bun run typecheck && bun run test
```

Plus a CSS compile, since the layer split is recent — this catches a malformed
selector that no test would:

```bash
echo "import './main.css'" > src/app/styles/entry.tmp.js
# vite build with rollupOptions.input pointing at that file, then delete it
```

**The Electron GUI cannot be launched from this environment**, so these are for
you to run with `bun run start`:

1. Click the new size button in the **footer bar** — the window shrinks to the
   compact player. Click it again in the mini player — it grows back. Confirm
   the button is present and reachable at every height tier.
2. In the footer bar and the mini player, confirm no stray empty row under the
   transport (that is §1b) and that the transport is vertically centred.
3. Click an **expanded** folder in the sidebar tree — it collapses and stays
   collapsed. Click a collapsed one — it expands. Click a folder deep inside a
   collapsed branch from a breadcrumb — its ancestors open, and it keeps
   whatever expansion state it had.
4. Select a folder row in the track list — the highlight is square, not a pill.
   Check the sidebar rows, the sidebar footer buttons and the titlebar too.
5. On the largest library you have: click through several folders in the tree
   and time it. There should be no perceptible stall.
