# Plan: UI Fixes + Frontend Data API + IPC and Web FS Adapters

This plan now covers two ship-able batches that can be done in either order: a set of focused UI fixes (Part A) and the data-source split (Part B). CSS-first throughout — JS only where the DOM model genuinely requires it (drag-reorder, column resize handles, theme JSON import).

---

# Part A — UI Fixes

## A.1. Player vertical-stack layout at narrow widths

**Problem.** The `PlayerView` (full-screen) and `PlayerBar` (bottom) don't respond well below ~640 px wide. The narrow container query at `src/app/styles/player.css:59` switches to `flex-direction: row` instead of stacking, and the bottom bar's grid (`src/app/components/composite/PlayerBar.tsx:27`) overflows because every region (`player-bar-track`, `player-bar-controls`, `player-bar-progress`, `player-bar-volume`) competes for width.

**Approach (CSS-only).**

1. `PlayerView`: rewrite the narrow `@container` query to stack instead of row-wrap. The order at narrow widths is: art (compact) → title/artist → waveform → prev/play/next.
   ```css
   @container (max-width: 480px) {
     .player-view { flex-direction: column; gap: var(--sp-3); padding: var(--sp-3); }
     .album-art-card { width: clamp(60px, 25cqw, 120px); }
     .player-info, .progress-section { width: 100%; }
     .playback-controls { gap: var(--sp-3); }
     .playback-controls .play-pause-btn { width: 48px; height: 48px; }
   }
   @container (max-width: 320px) {
     .playback-controls .play-pause-btn { width: 40px; height: 40px; font-size: 18px; }
     .playback-controls > :not(.play-pause-btn) { font-size: 14px; }
   }
   ```
2. `PlayerBar` (bottom strip): give it `container-type: inline-size`, then collapse the volume slider and the time labels at narrow widths but keep prev/play/next visible (smaller).
   ```css
   .player-bar { container-type: inline-size; display: grid;
     grid-template-columns: minmax(160px, 22%) auto 1fr auto;
     /* track    controls   progress  volume */
   }
   @container (max-width: 720px) { .player-bar-volume { display: none; } }
   @container (max-width: 520px) {
     .player-bar { grid-template-columns: minmax(120px, 30%) auto 1fr; }
     .player-bar-progress .player-bar-time { display: none; }
   }
   @container (max-width: 380px) {
     .player-bar { grid-template-columns: 1fr auto; grid-auto-rows: auto; }
     .player-bar-track    { grid-column: 1; grid-row: 1; }
     .player-bar-controls { grid-column: 2; grid-row: 1; }
     .player-bar-progress { grid-column: 1 / -1; grid-row: 2; }
     .player-bar-controls > button { width: 32px; height: 32px; font-size: 14px; }
   }
   ```
   Prev/play/next are never `display:none`. They scale via `width`/`height`/`font-size`.

**Files.** `src/app/styles/player.css`, `src/app/styles/components.css` (player-bar styles live there today; if so, edit there).

## A.2. Stable bottom-player title container

**Problem.** `.player-bar-track` flexes around the title length, so the controls and waveform jump horizontally on track change.

**Approach (CSS-only).** Lock `player-bar-track` to a `minmax(160px, 22%)` grid track (already proposed in A.1), and force the title cell to be the flex source of truth, not the contents:

```css
.player-bar-track  { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
.player-bar-info   { flex: 1 1 auto; min-width: 0; }      /* min-width:0 enables ellipsis */
.player-bar-title  { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.player-bar-artist { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
```

The grid template (A.1) reserves the column width regardless of title contents; `min-width: 0` plus ellipsis prevents the inner text from blowing the grid track open. No JS measurement.

## A.3. Waveform fills full width + higher resolution

**Problem.** `WaveformProgress` uses `display: flex; gap: 1px` with fixed `width: 5px` bars (`src/app/styles/waveform-progress.css:23-26`). With 80 bars (current `decodeWaveformBars(ab, 80, ctx)` at `src/app/contexts/AudioContext.tsx:297`) at 5 px + 1 px gap each, that's a fixed 480 px regardless of container width.

**Approach.** Make the bars elastic via CSS, and bump the bar count to a content-derived value.

CSS:
```css
.waveform-progress {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;       /* every bar gets an equal share of available width */
  gap: 1px;
  width: 100%;
  /* ... existing height/padding ... */
}
.wf-bar { width: auto; }         /* drop fixed 5px */
```
Switching to `grid-auto-columns: 1fr` is the whole fix — bars now stretch to fill any width.

Bar-count bump (renderer-side, the only JS change in Part A):
- Raise the default to `min(400, Math.floor(containerWidth / 4))` — measure with a `ResizeObserver` in `WaveformProgress`, recompute on resize, debounce to one frame. Re-decode bars from the cached `ArrayBuffer` only when the count crosses a threshold (e.g. ±64).
- Or, simpler: precompute at 400 bars regardless; CSS `grid-auto-columns: 1fr` averages them. That avoids `ResizeObserver` entirely. Recommended start: 400 bars, no observer.

**Files.** `src/app/styles/waveform-progress.css`, `src/app/contexts/AudioContext.tsx:297` (change `80` → `400`), `src/app/components/atomic/WaveformProgress.tsx` (drop any width math).

## A.4. Library table: padded scroll container, draggable + resizable + sortable headers

**Problem.** `.track-table-wrap` at `src/app/styles/library.css:63` uses `overflow: hidden`, no horizontal scroll, no padding. The header grid template `36px 40px 1fr 22% 22% 52px 52px` is hard-coded. `useSortableTable` already drives sort by header click but only seven columns are exposed.

**Approach.** Convert column widths to CSS custom properties so JS can mutate them per column, drop a horizontal scroll container, add a thin column-resize handle, and HTML5-drag the header cells for reorder. CSS for everything except the drag/resize event listeners.

CSS:
```css
.tracks-container { padding: var(--sp-3) var(--sp-4); }   /* fixes "no padding" */

.track-table-wrap {
  overflow-x: auto;                  /* horizontal scroll on narrow */
  overflow-y: hidden;
}
.track-header,
.track-row {
  display: grid;
  grid-template-columns: var(--track-grid, 36px 40px 1fr 0.55fr 0.55fr 6ch 6ch);
  min-width: max-content;             /* respect intrinsic widths when scrolling */
}

.col-resize-handle {
  position: absolute; top: 0; right: -3px; bottom: 0; width: 6px;
  cursor: col-resize; user-select: none;
}
[role="columnheader"] { position: relative; }            /* anchor handle */
[role="columnheader"][draggable="true"] { cursor: grab; }
[role="columnheader"].dragging          { opacity: 0.4; }
[role="columnheader"].drop-target       { box-shadow: inset 2px 0 0 var(--accent); }
```

JS (minimum):
- Persist a column-config object `{ key, width, hidden, order }[]` in `UIContext` (or a new `useColumnConfig` hook persisted to localStorage). On every change, write `--track-grid` on the wrapper from the config.
- Drag reorder: `onDragStart` on `<th role="columnheader">` stores `dataTransfer.setData('column-key', key)`; `onDragOver` adds `.drop-target`; `onDrop` reorders the config array.
- Resize: `onMouseDown` on `.col-resize-handle` captures pointer, on `mousemove` updates the config's `width` for that column to `Math.max(48, startWidth + dx)` in `px`. CSS `var(--track-grid)` rebuilds.
- Sort: already implemented in `useSortableTable` and `TrackTable.tsx:82` — keep as-is.

**Files.** `src/app/styles/library.css`, `src/app/components/composite/TrackTable.tsx`, new `src/app/hooks/useColumnConfig.ts`.

## A.5. Column visibility menu

**Problem.** Only the seven hard-coded columns are shown. No way to reveal `year`, `genre`, `trackNumber`, `size`, `path`, `dateAdded`.

**Approach.** Right-click any header cell shows a menu with checkboxes for every column. Reuse the existing `Popover` (`src/app/components/atomic/Popover.tsx`) and the `bridge.showContextMenu` IPC; or, simpler and decoupling-friendly, render an in-renderer `Popover` instead of going through Electron — that also makes it work in `bun run dev:web`.

```tsx
// inside TrackTable header onContextMenu
const items: { key: string; label: string; visible: boolean }[] = [
  { key: 'title',       label: 'Title',        visible: true /* always */ },
  { key: 'artist',      label: 'Artist',       visible: cfg.artist.visible },
  { key: 'album',       label: 'Album',        visible: cfg.album.visible },
  { key: 'year',        label: 'Year',         visible: cfg.year.visible },
  { key: 'genre',       label: 'Genre',        visible: cfg.genre.visible },
  { key: 'duration',    label: 'Duration',     visible: cfg.duration.visible },
  { key: 'format',      label: 'Format',       visible: cfg.format.visible },
  { key: 'size',        label: 'Size',         visible: cfg.size.visible },
  { key: 'trackNumber', label: 'Track #',      visible: cfg.trackNumber.visible },
  { key: 'path',        label: 'Path',         visible: cfg.path.visible },
]
```

CSS for the menu reuses `Popover` styles. Toggling `visible` rewrites `--track-grid` so hidden columns simply drop out of the grid template — no DOM removal needed.

**Files.** `src/app/components/composite/TrackTable.tsx`, `src/app/hooks/useColumnConfig.ts` (shared with A.4), `src/app/styles/library.css`.

## A.6. Settings page refactor + custom theme colours

**Problem.** `src/app/views/SettingsView.tsx` is a flat list of sections styled by `settings.css`. No theme customisation.

**Approach (CSS-led).**

1. **Layout refactor.** Switch `.settings-view` to a two-column grid: a left rail of section titles, right pane of editable cards. Use existing `--sp-*` and `--radius-*` tokens; no new tokens needed.
   ```css
   .settings-view {
     display: grid;
     grid-template-columns: 200px 1fr;
     gap: var(--sp-6);
     padding: var(--sp-6) var(--sp-8);
     max-width: 960px;
     margin: 0 auto;
   }
   .settings-nav { position: sticky; top: var(--sp-4); align-self: start; }
   .settings-nav button { display: block; width: 100%; text-align: left;
     padding: var(--sp-2) var(--sp-3); border-radius: var(--radius); background: transparent;
     color: var(--text-muted); }
   .settings-nav button.active { background: var(--bg-raised); color: var(--text); }
   .settings-pane > section { background: var(--bg-raised);
     padding: var(--sp-6); border-radius: var(--radius-lg); margin-bottom: var(--sp-4); }
   @container (max-width: 640px) { .settings-view { grid-template-columns: 1fr; } }
   ```
   Use scroll-spy or `IntersectionObserver` to highlight the active rail item — or skip it and have the rail items scroll-anchor to `<section id>`s with `:target` highlighting.

2. **Theme colours section.** New `<section id="theme">` containing `<input type="color">` for each theme variable. The full token list: `--bg`, `--bg-raised`, `--bg-input`, `--bg-hover`, `--accent`, `--accent-hover`, `--accent-alt`, `--text`, `--text-dim`, `--text-muted`, `--border`, `--border-hover`, `--success`, `--warning`, `--danger`, `--info`, `--wf-unplayed`, `--wf-played`. (Source list: `src/app/styles/tokens.css:2-70`.)

   Each picker writes to `document.documentElement.style.setProperty('--bg', value)` immediately for live preview. The full set of values is mirrored into a `customTheme` blob in `SettingsContext`.

3. **Theme JSON shape.**
   ```ts
   interface CustomTheme {
     readonly version: 1
     readonly name:    string
     readonly colors:  Readonly<Record<string, string>>  // keyed by CSS var name w/o leading --
   }
   ```

4. **Save / Export / Import.**
   - **Save**: write `customTheme` to localStorage via `SettingsContext`; switch `theme` enum from `'dark' | 'light'` to `'dark' | 'light' | 'custom'`. When `theme === 'custom'`, the renderer applies the custom variables on `<html>` once on mount and on every change.
   - **Export**: serialize `CustomTheme` and trigger a download via `const url = URL.createObjectURL(new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' }))`. Plain DOM API, no IPC.
   - **Import**: `<input type="file" accept="application/json">` → `file.text()` → `JSON.parse` → validate `version === 1` and `colors` is a flat string→string record → store + apply. Show inline error on validation failure.

**Files.** `src/app/views/SettingsView.tsx` (rewrite), `src/app/styles/settings.css` (rewrite), `src/app/contexts/SettingsContext.tsx` (add `customTheme`, `setCustomTheme`, `exportTheme`, `importTheme`; broaden `Theme` union), `src/app/hooks/useThemeApply.ts` (apply custom theme variables to `<html>`).

## A.7. Row density button group (relaxed / normal / compact)

**Where.** Two entry points, single source of truth:
- **Library heading** (`src/app/views/LibraryView.tsx:198` `<header className='view-header'>`) — controls the current session's density.
- **Settings → Library section** — sets the default density saved to localStorage.

**Visual.** A three-button toggle group rendered with the existing `IconButton` primitive. Icons: `≡` (relaxed), `≢` (normal — shorter rows), `=` (compact). Active button gets `aria-pressed="true"` styled via CSS.

```tsx
// LibraryView header
<div className='density-toggle' role='group' aria-label='Row density'>
  <IconButton label='Relaxed' aria-pressed={density === 'relaxed'} onClick={() => setDensity('relaxed')}>≡</IconButton>
  <IconButton label='Normal'  aria-pressed={density === 'normal'}  onClick={() => setDensity('normal')}>≢</IconButton>
  <IconButton label='Compact' aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}>=</IconButton>
</div>
```

**State.** Density lives in `UIContext` (`density: 'relaxed' | 'normal' | 'compact'`), with the default seeded from `SettingsContext.defaultDensity`. The wrapper element gets `data-density={density}`; all behaviour follows from CSS attribute selectors.

**CSS — single source of truth via custom properties.**

```css
.track-table-wrap {
  --row-h: 36px;
  --row-pad-y: var(--sp-2);
  --row-pad-x: var(--sp-3);
  --row-clamp: 1;             /* lines per cell */

  &[data-density='compact'] { --row-h: 28px; --row-pad-y: var(--sp-1); --row-clamp: 1; }
  &[data-density='normal']  { --row-h: 36px; --row-pad-y: var(--sp-2); --row-clamp: 1; }
  &[data-density='relaxed'] { --row-h: 64px; --row-pad-y: var(--sp-3); --row-clamp: 2; }
}

.track-row { height: var(--row-h); padding: var(--row-pad-y) var(--row-pad-x); }
.track-row > span {
  /* Compact + normal: clamp overflow */
  display: -webkit-box;
  -webkit-line-clamp: var(--row-clamp);
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Relaxed: title cell wraps to two physical lines with title + secondary line */
[data-density='relaxed'] .col-title {
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.25;
}
[data-density='relaxed'] .col-title .row-subtitle {
  font-size: var(--text-sm);
  color: var(--text-muted);
}
[data-density='relaxed'] .col-artist,
[data-density='relaxed'] .col-album { display: none; }   /* now lives inside title cell */
```

**JSX change in `TrackTable`** for the relaxed subtitle is one line:

```tsx
<span className='col-title'>
  {track.title}
  {density === 'relaxed' && <span className='row-subtitle'>{track.artist} — {track.album}</span>}
</span>
```

**Virtualizer.** The current `useVirtualizer` call at `src/app/components/composite/TrackTable.tsx:61` hard-codes `estimateSize: () => ROW_HEIGHT`. Replace with:
```ts
const ROW_HEIGHT_BY_DENSITY = { compact: 28, normal: 36, relaxed: 64 } as const
const virtualizer = useVirtualizer({
  count: rowCount,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => ROW_HEIGHT_BY_DENSITY[density],
  overscan: 8,
})
```
The numeric constants must match the CSS `--row-h` values. Keep them adjacent (a single export in `TrackTable.tsx` consumed by the CSS via `:root` custom properties is the only way to dedupe; for now, the duplicate is acceptable and tested).

**Files.** `src/app/contexts/UIContext.tsx` (+ `density`, `setDensity`), `src/app/contexts/SettingsContext.tsx` (+ `defaultDensity`), `src/app/views/LibraryView.tsx` (header buttons), `src/app/views/SettingsView.tsx` (default-density selector inside the Library section), `src/app/components/composite/TrackTable.tsx` (subtitle render + virtualizer height), `src/app/styles/library.css`, `src/app/styles/settings.css`.

## A.8. Config caret + dropdown (column toggles + grouping)

**Where.** Rightmost item of the library heading: a single `<button>` showing a chevron `⌄` icon. Click opens a popover menu using the existing `Popover` atomic. The menu has two sections:

1. **Columns** — checkbox list for every column from §A.5. Same source of truth (`useColumnConfig`), reachable from two entry points: right-click on a header cell or the config caret.
2. **Grouping** — radio list: `None`, `By album`, `By artist`, `By path`.

```tsx
<Popover trigger={<IconButton label='Configure'>⌄</IconButton>} placement='bottom-end'>
  <fieldset>
    <legend>Columns</legend>
    {columns.map(c => (
      <label key={c.key}><input type='checkbox' checked={c.visible} onChange={() => toggleColumn(c.key)} /> {c.label}</label>
    ))}
  </fieldset>
  <fieldset>
    <legend>Group by</legend>
    {(['none','album','artist','path'] as const).map(g => (
      <label key={g}><input type='radio' name='group' checked={grouping === g} onChange={() => setGrouping(g)} /> {labelOf(g)}</label>
    ))}
  </fieldset>
</Popover>
```

**Grouping state.** New `grouping: 'none' | 'album' | 'artist' | 'path'` on `UIContext`, persisted to localStorage. When `grouping !== 'none'`, the table renders grouped sections.

**Group rendering.**

For `'none'` — current flat virtualised behaviour, no change.

For `'album' | 'artist' | 'path'` — rebuild the row list as a flat sequence with `{ kind: 'header', group } | { kind: 'track', track }` entries; the virtualizer keeps working with variable-size estimates (group headers are taller). Pseudo:

```ts
const grouped = useMemo(() => {
  if (grouping === 'none') return sorted.map(t => ({ kind: 'track' as const, track: t }))
  const buckets = new Map<string, Track[]>()
  for (const t of sorted) {
    const key = grouping === 'album'  ? `${t.artist}​${t.album}`
              : grouping === 'artist' ? t.artist
              : /* path */              t.path.replace(/[/\\][^/\\]*$/, '')
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(t)
  }
  const out: ({ kind: 'header'; key: string; tracks: Track[] } | { kind: 'track'; track: Track })[] = []
  for (const [key, tracks] of buckets) {
    out.push({ kind: 'header', key, tracks })
    for (const t of tracks) out.push({ kind: 'track', track: t })
  }
  return out
}, [sorted, grouping])
```

**By-album special case — bigger album art spanning rows.** When grouped by album, render each group as a CSS Grid block with the art on the left spanning every row in the group. CSS Grid `grid-row: span N` handles the visual rowspan; no JS measurement.

```css
.track-album-group {
  display: grid;
  grid-template-columns: 96px 1fr;     /* big art | track stack */
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius);
  background: var(--bg-raised);
  margin-bottom: var(--sp-3);
}
.track-album-group .group-art {
  grid-row: 1 / -1;
  align-self: start;
  aspect-ratio: 1;
  background: var(--bg-hover);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.track-album-group .group-art img { width: 100%; height: 100%; object-fit: cover; }
.track-album-group .group-art .swatch {
  width: 100%; height: 100%; display: block;
}
.track-album-group .group-tracks { display: contents; }   /* keep grid flat */
.track-album-group .track-row {
  /* Inside a grouped block, hide the per-row art column — the big art on the left replaces it */
  & .col-art { display: none; }
}
.track-album-group .group-title {
  font-weight: var(--font-semibold);
  margin-bottom: var(--sp-1);
}
.track-album-group .group-subtitle {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-bottom: var(--sp-2);
}
```

For `'artist'` and `'path'` groupings the renderer uses a simpler layout: a sticky group header row (no big art) followed by flat track rows. CSS:

```css
.track-group-header {
  position: sticky;
  top: var(--row-h);                 /* below the table header */
  background: var(--bg-raised);
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--text-sm);
  color: var(--text-dim);
  z-index: 1;
}
```

**Virtualization.** The virtualizer accepts variable sizes via `getEstimatedSize` per index. For an album group, `estimateSize(index)` returns the group's estimated total height (`headerHeight + tracks.length * rowHeight`). Or, simpler, the virtualizer iterates over a flat list where each entry is a single row; the album-art "rowspan" is purely CSS. Recommended start: flat virtualized list with grouping markers; album-art rowspan via grid `grid-row: span N` only when the group is fully visible. If virtualization clipping cuts the art, fall back to a wrapper non-virtualized layout for `'album'` mode (the per-album DOM cost is small — maybe 100-300 albums).

**Files.** `src/app/views/LibraryView.tsx` (heading caret + Popover), `src/app/components/composite/TrackTable.tsx` (grouped render), `src/app/contexts/UIContext.tsx` (+ `grouping`, `setGrouping`), `src/app/styles/library.css`, `src/app/hooks/useColumnConfig.ts` (already added in §A.4).

## A.9. CSS-first principle

For every fix above, the JS additions are limited to:
- `useColumnConfig` localStorage persistence + setter (≈40 lines).
- Drag/reorder + column-resize event listeners on header cells (≈60 lines, in `TrackTable.tsx`).
- Theme JSON parse/serialize and `setProperty` apply (≈40 lines, in `SettingsView.tsx` + new hook).
- Optional `ResizeObserver` for the waveform (skipped in the recommended path; the 400-bar `1fr` grid handles it CSS-only).

Total new JS across Part A: ~200 lines. All visual behaviour — stacking, ellipsis, sticky rail, scroll, sort indicator, dragging affordance, equal columns, density spacing, album-art rowspan — is CSS.

## A.10. Test plan for Part A

- `tests/components/composite/TrackTable.test.tsx` — sort click toggles direction; column-config changes update `--track-grid` style; right-click header opens column menu; drag reorder updates config order; resize handle updates width.
- `tests/components/composite/PlayerBar.test.tsx` — title cell uses ellipsis when title overflows (assert `text-overflow: ellipsis` via computed style or class membership); width of `.player-bar-track` does not change between two tracks of different title lengths (`getBoundingClientRect()` snapshot).
- `tests/views/SettingsView.test.tsx` — theme colour picker change calls `setProperty` on `<html>`; export click triggers a Blob download (mock `URL.createObjectURL`); import with malformed JSON shows error and does not mutate state.
- Visual smoke (manual): resize the window through 1200 / 720 / 520 / 380 px in `bun run dev:web` and confirm all four player layouts behave as expected.
- `tests/components/composite/TrackTable.density.test.tsx` — switching density updates the wrapper `data-density` attribute; relaxed adds the subtitle DOM node; virtualizer `estimateSize` returns the matching numeric height.
- `tests/components/composite/TrackTable.grouping.test.tsx` — `grouping='album'` renders one `.track-album-group` per unique album with a single `.group-art` element and the corresponding tracks; `'artist'` renders sticky group headers; `'path'` groups by parent directory. Sort order is preserved within groups.
- `tests/views/LibraryView.test.tsx` — header density toggle calls `setDensity`; config caret button opens the Popover and toggling a checkbox calls `toggleColumn`; switching grouping updates the rendered structure.
- `tests/views/SettingsView.test.tsx` — default-density selector writes to `SettingsContext.defaultDensity`.

---

# Part B — Frontend Data API

## Context

The `Bridge` abstraction landed in commits `15664b6..25592b8`. It works as a switchable shim — `renderer.tsx` picks `BrowserBridge` when `window.electronAPI` is missing — and `bun run dev:web` boots Vite standalone, serves the renderer, and compiles. Tests pass, typecheck is clean.

But the abstraction is a god-interface: `Bridge` mixes data access (`loadLibrary`, `readFile`, `getAudioMetadata`, `upsertModel`), host integration (`minimizeWindow`, `showContextMenu`, `onMediaPlayPause`, `updateMediaState`), and event streams (`onLibraryBatch`, `onMediaSeek`) under one interface. That makes "use a different source for the data" hard: a future HTTP backend would have to stub out 20 host-only methods. And `BrowserBridge` is mostly stubs — `readFile` returns `new ArrayBuffer(0)`, `selectDirectory` returns the literal string `'/mock/path'`, `getAudioMetadata` returns the wrong shape (it currently declares `Promise<MediaState>` instead of `Promise<AudioMetadata>` — a regression at `src/app/data/Bridge.ts:15`). The browser session loads but cannot actually play audio.

This plan extracts the **data-access surface** from `Bridge` into a focused `DataSource` capability set, and ships two real adapters for it: `IpcDataSource` (delegates to the existing preload IPC) and `WebFsDataSource` (uses the File System Access API to actually pick a directory, scan it, read audio bytes, and parse metadata in the renderer). The leftover host-integration methods (window controls, media keys, MPRIS, context menu) stay on `Bridge` — that's where they belong, since they're inherently Electron-only and a no-op `BrowserHost` already covers the browser case.

The intended outcome: a developer can swap `IpcDataSource` for `WebFsDataSource` (or a future `HttpDataSource`) without touching any view, context, or hook. The browser dev mode actually plays files the user picks. The IPC path keeps current behaviour with no observable change.

---

## Goals

1. Define a `DataSource` interface that captures everything a view/context needs from "the data layer": library scan, file read, metadata, model writes, change events.
2. Ship `IpcDataSource` — wraps `window.electronAPI` calls; preserves current Electron behaviour exactly.
3. Ship `WebFsDataSource` — uses `window.showDirectoryPicker()`, walks the handle tree, reads files via `FileSystemFileHandle.getFile()`, parses tags via `music-metadata` (already a dep) running in the renderer (or a Web Worker, see §6).
4. Composition root: `renderer.tsx` builds `{ data: DataSource, host: HostBridge }` and provides both via context.
5. Migrate every consumer that currently calls `useBridge().{loadLibrary,scanLibrary,readFile,getAudioMetadata,upsertModel,deleteModel,onLibraryBatch,onLibraryDone}` to `useData()`.
6. Fix the `getAudioMetadata` return-type regression (back to `AudioMetadata`).

Non-goals: changing the model classes, the slot layout, the `@observable` story, persistence schema. Those are out of scope.

---

## Design

### Capability split

```
src/app/data/
  Bridge.ts                  →  HostBridge.ts   (window/media-keys/context-menu/MPRIS)
  ElectronBridge.ts          →  ElectronHost.ts (host adapter)
  BrowserBridge.ts           →  BrowserHost.ts  (no-op host adapter)
  BridgeContext.tsx          →  HostContext.tsx (useHost())
  DataSource.ts              NEW interface
  IpcDataSource.ts           NEW
  WebFsDataSource.ts         NEW
  DataContext.tsx            NEW (useData(), DataProvider)
  fixtures/                  NEW (tiny seed library for headless dev)
  index.ts                   re-export both
```

### `DataSource` interface

```ts
// src/app/data/DataSource.ts
export interface DataSource {
  // Library lifecycle
  readonly addRoot:       () => Promise<string | null>          // user picks a folder; returns its handle id/path
  readonly removeRoot:    (rootId: string) => Promise<void>
  readonly listRoots:     () => Promise<readonly LibraryRoot[]>
  readonly scan:          (rootIds: readonly string[]) => void  // fire-and-forget; results stream via subscribe()
  readonly load:          () => Promise<readonly TrackDTO[]>    // hydrate from cache
  readonly subscribe:     (l: DataListener) => () => void       // batch + done events

  // Per-track ops
  readonly readBytes:     (trackId: string) => Promise<ArrayBuffer>
  readonly readMetadata:  (trackId: string) => Promise<AudioMetadata>

  // Mutations
  readonly upsertTrack:   (track: TrackDTO) => Promise<void>
  readonly deleteTrack:   (trackId: string) => Promise<void>
}

export interface LibraryRoot { readonly id: string; readonly label: string }

export type DataEvent =
  | { readonly type: 'batch'; readonly tracks: readonly TrackDTO[] }
  | { readonly type: 'done';  readonly totalCount: number }
  | { readonly type: 'error'; readonly message: string }

export type DataListener = (e: DataEvent) => void
```

Keying by `trackId` (not raw path) lets `WebFsDataSource` keep `FileSystemFileHandle`s in an internal map without exposing them. `IpcDataSource` resolves `trackId` to a path internally (the SQLite row already has both).

### `IpcDataSource`

Thin wrapper over the existing preload methods. `addRoot` calls `selectDirectory` then `scanLibrary([path])`; `subscribe` multiplexes `onLibraryBatch`/`onLibraryDone` into the unified event stream; `readBytes` resolves `trackId → path` via an in-memory map populated by batches, then calls `readFile(path)`. `upsertTrack`/`deleteTrack` call `upsertModel('track', dto)`/`deleteModel('track', id)`.

This adapter has zero behaviour change vs. today.

### `WebFsDataSource`

Uses the File System Access API (Chromium 86+, the only target for `bun run dev:web`):

- `addRoot()` → `window.showDirectoryPicker()` returns a `FileSystemDirectoryHandle`. Persist the handle in IndexedDB (via `idb-keyval` or a 30-line bare-bones helper) keyed by a generated UUID; return the UUID. Granted handles survive reloads as long as the user re-grants permission via `handle.requestPermission()`.
- `scan(rootIds)` → walk the directory handle tree, filter to audio extensions (`.mp3`, `.flac`, `.ogg`, `.wav`, `.m4a`, `.opus`), generate `TrackDTO`s with `id = hash(rootId + relativePath)`, store `{ trackId → fileHandle }` in an internal `Map`. Emit `batch` events of 20, then `done`. Reuses the same chunking pattern as `scanner-worker.ts:41`.
- `readMetadata(trackId)` → `handle.getFile()` then `parseBlob(file)` from `music-metadata` (already in deps; works in the browser via its ESM build).
- `readBytes(trackId)` → `handle.getFile().then(f => f.arrayBuffer())`. Replaces the current 0-byte stub.
- `load()` → no-op the first time; on subsequent reloads, replays cached `TrackDTO`s from IndexedDB (`tracks` object store) so the UI hydrates instantly.
- `upsertTrack`/`deleteTrack` → write to the same IndexedDB store. This gives the browser session SQLite-equivalent persistence without leaving the renderer.

A small Web Worker (`src/app/data/web-fs-worker.ts`) optionally takes the metadata parsing off the main thread — same chunked-batch protocol as `scanner-worker.ts`, but sender/receiver are renderer-side.

### Wiring

```tsx
// src/renderer.tsx
const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI)
const host = isElectron ? new ElectronHost() : new BrowserHost()
const data: DataSource = isElectron ? new IpcDataSource() : new WebFsDataSource()

createRoot(...).render(
  <HostProvider value={host}>
    <DataProvider value={data}>
      <App />
    </DataProvider>
  </HostProvider>
)
```

`Model.bridge` (currently never set anywhere — confirmed at `src/app/models/Model.ts:10` is `null`) becomes `Model.dataSource`, set once by `<DataProvider>` on mount. This unbreaks the `markDirty → flush → upsertTrack` chain: today every flush is a silent no-op because no model ever has a bridge bound.

---

## Migration

| File | Today | After |
|---|---|---|
| `src/app/contexts/AudioContext.tsx:276` | `bridge.readFile(track.path)` | `data.readBytes(track.id)` |
| `src/app/contexts/AudioContext.tsx:211` | `bridge.updateMediaState(...)` | `host.updateMediaState(...)` |
| `src/app/contexts/AudioContext.tsx:230` | `bridge.onMediaSeek(...)` | `host.onMediaSeek(...)` |
| `src/app/contexts/SettingsContext.tsx` getMusicDir | `bridge.getMusicDir()` | drop — `WebFsDataSource` returns null roots; `IpcDataSource.listRoots()` seeds with music dir |
| `src/app/hooks/useLibraryScanner.ts` | `bridge.scanLibrary/loadLibrary/onLibraryBatch/onLibraryDone` | `data.scan/load/subscribe` |
| `src/app/views/SettingsView.tsx:11` | `bridge.selectDirectory()` | `data.addRoot()` |
| `src/app/views/LibraryView.tsx:84,94` | `bridge.showContextMenu/onContextMenuAction` | `host.showContextMenu/onContextMenuAction` |
| `src/app/hooks/useKeyboardShortcuts.ts` | `bridge.onMediaPlayPause/Next/Prev` | `host.onMediaPlayPause/Next/Prev` |
| `src/app/App.tsx` (existing) | `useBridge()` | `useHost()` |
| `src/app/models/Model.ts:10` | `bridge: Bridge \| null = null` | `dataSource: DataSource \| null = null`, set by `DataProvider` |

After migration, delete the old `Bridge.ts`/`ElectronBridge.ts`/`BrowserBridge.ts`/`BridgeContext.tsx` files (they are subsumed by `HostBridge.ts` + the new data files).

Bug fix in the same pass: `Bridge.ts:15` declares `getAudioMetadata(): Promise<MediaState>` — should be `Promise<AudioMetadata>`. The new `DataSource.readMetadata` returns `AudioMetadata` correctly.

---

## File-by-file change list (execution order)

**Phase 1 — Capability split (no behaviour change):**
1. Rename `Bridge.ts` → `HostBridge.ts`, strip data methods (`scanLibrary`, `loadLibrary`, `onLibraryBatch`, `onLibraryDone`, `selectDirectory`, `getMusicDir`, `readFile`, `getAudioMetadata`, `upsertModel`, `deleteModel`).
2. Rename `ElectronBridge.ts` → `ElectronHost.ts`, drop the same methods.
3. Rename `BrowserBridge.ts` → `BrowserHost.ts`, drop the same methods.
4. Rename `BridgeContext.tsx` → `HostContext.tsx` (`HostProvider`, `useHost`).

**Phase 2 — `DataSource` + `IpcDataSource`:**
5. `src/app/data/DataSource.ts` (interface + types).
6. `src/app/data/IpcDataSource.ts` (delegates to `window.electronAPI`).
7. `src/app/data/DataContext.tsx` (`DataProvider`, `useData`). Sets `Model.dataSource = value` on mount.

**Phase 3 — `WebFsDataSource`:**
8. `src/app/data/idb.ts` (50-line key-value helper around IndexedDB; no new deps).
9. `src/app/data/WebFsDataSource.ts` — directory walker, `Map<trackId, FileSystemFileHandle>`, IndexedDB cache for handles + DTOs.
10. (optional) `src/app/data/web-fs-worker.ts` — off-thread metadata parsing. Skip if scan time on a 1k-track folder is acceptable on the main thread.

**Phase 4 — Wiring + migrations:**
11. `src/renderer.tsx` — build `host` and `data`, wrap in both providers.
12. Migrate the 8 call sites in the table above.
13. Update `Model.ts` to use `dataSource.upsertTrack`/`deleteTrack` instead of `bridge.upsertModel`/`deleteModel`.
14. Delete the old `Bridge.ts`/`ElectronBridge.ts`/`BrowserBridge.ts`/`BridgeContext.tsx`.
15. Fix the `AudioMetadata` vs. `MediaState` regression while editing.

**Phase 5 — Tests:**
16. `tests/data/DataSource.contract.test.ts` — shared contract suite that runs against both adapters: `addRoot → scan → subscribe → load → readBytes → upsertTrack → load again` returns the mutation. Seeds an in-memory directory handle for the WebFs run (use a tiny `MemoryDirectoryHandle` test helper) and a fake `electronAPI` for the IPC run (extend `tests/helpers/makeMockBridge.ts`).
17. `tests/data/WebFsDataSource.test.ts` — directory walker filters audio extensions, batch chunking is 20, IndexedDB persistence round-trip.
18. `tests/data/IpcDataSource.test.ts` — every method calls the right `electronAPI` channel exactly once.
19. Update existing `tests/data/BrowserBridge.test.ts` → split into `BrowserHost.test.ts` (host stub) and merge data assertions into the contract test.
20. Update view tests (`tests/views/LibraryView.test.tsx`, `SettingsView.test.tsx`) to inject both `<DataProvider>` and `<HostProvider>`. Extend `tests/helpers/renderWithProviders.tsx`.

---

## Test plan

- Contract suite (`DataSource.contract.test.ts`) is the load-bearing test — every method on every adapter must pass it. Ensures behavioural parity.
- `WebFsDataSource` unit tests:
  - `addRoot` returns `null` when the user cancels the picker.
  - `scan` filters non-audio files (`.txt`, `.jpg`).
  - `subscribe` emits exactly `ceil(n/20)` `batch` events plus one `done`.
  - `readBytes` returns the actual file bytes (not 0).
  - `upsertTrack` then `load` returns the mutated DTO.
  - Permission-denied path: `requestPermission()` returns `'denied'` → `addRoot` returns `null`, no throw.
- `IpcDataSource` unit tests use the existing `tests/mocks/electron.ts` stubs — assert each method routes to the expected channel.
- View tests: `SettingsView` "Add Folder" calls `data.addRoot()` (not `host.selectDirectory`); `LibraryView` mount calls `data.scan(rootIds)` once.
- Smoke test for `bun run dev:web`: start server, fetch `/`, assert no `electronAPI` references in `/src/app/data/index.ts` after dev compilation.

---

## Verification (end-to-end)

1. `bun run typecheck && bun run lint && bun run test` — all green.
2. `bun run start` (Electron):
   - Library scans, plays a track. No regression. (Same path as today, just routed via `IpcDataSource`.)
3. `bun run dev:web` then open `http://localhost:5173`:
   - Settings → Add Folder → pick a real directory containing `.mp3`s.
   - Library populates with real track metadata (titles, artists, durations) — not stubs.
   - Click play → audio actually plays through `<audio>` + `URL.createObjectURL(blob)`.
   - Reload the page → roots and track DTOs come back from IndexedDB; permission re-prompt only on file access.
4. Inspect DevTools Application → IndexedDB → `desktop-audio` database → confirm `roots` and `tracks` stores populated.

---

## Risks & open questions

1. **`music-metadata` in the browser** — its ESM entry imports `node:buffer`. Verify Vite's `define` polyfill or pin to the lighter `music-metadata-browser` fork. Run a 5-line smoke test before committing to it.
2. **File handle persistence** — granting a directory handle that survives reload is supported in Chromium but the user must re-confirm permission per session. Acceptable for dev mode.
3. **Composition surface** — having two providers (`HostProvider` + `DataProvider`) doubles the wiring at the root. Keep `App.tsx` clean by exposing a single `<RootProviders host data>` wrapper.
4. **`Model.dataSource` global** — same pattern as today's `Model.bridge`, just renamed. Acceptable for a singleton renderer; revisit if we ever spawn a second React root.
5. **Worker for metadata parsing** — only needed if scan latency is felt. Defer until measured.
6. **Future adapters** — `HttpDataSource` (REST or tRPC), `FixtureDataSource` (static JSON for screenshots/CI), and `SqliteWasmDataSource` (sql.js running in a worker) all become trivial once the contract test exists.

---

## Critical files to modify

- `src/app/data/Bridge.ts` → `HostBridge.ts` (data methods removed)
- `src/app/data/ElectronBridge.ts` → `ElectronHost.ts`
- `src/app/data/BrowserBridge.ts` → `BrowserHost.ts`
- `src/app/data/BridgeContext.tsx` → `HostContext.tsx`
- `src/app/data/DataSource.ts` (new)
- `src/app/data/IpcDataSource.ts` (new)
- `src/app/data/WebFsDataSource.ts` (new)
- `src/app/data/DataContext.tsx` (new)
- `src/app/data/idb.ts` (new)
- `src/renderer.tsx` (wire both providers + `Model.dataSource`)
- `src/app/contexts/AudioContext.tsx` (split: `useData` for bytes, `useHost` for media state)
- `src/app/hooks/useLibraryScanner.ts` (use `useData`)
- `src/app/hooks/useKeyboardShortcuts.ts` (use `useHost`)
- `src/app/views/SettingsView.tsx` (use `useData().addRoot`)
- `src/app/views/LibraryView.tsx` (use `useHost` for context menu)
- `src/app/models/Model.ts` (`dataSource` instead of `bridge`)
- `tests/helpers/renderWithProviders.tsx` (inject both providers)
- `tests/data/*.test.ts` (contract + per-adapter)

## Reusable existing code

- `parseBlob` from `music-metadata` — same library as `scanner-worker.ts:98`, runnable in the browser.
- `decodeWaveformBars` at `src/app/contexts/AudioContext.tsx:30-58` — unchanged.
- `tests/helpers/makeMockBridge.ts` — split into `makeMockHost` + `makeMockData`.
- The chunked-batch protocol from `scanner-worker.ts:41` — directly portable to `WebFsDataSource.scan`.
