# Compact & mini now-playing tiers + album-art window resize

## Context

`PlayerView` today is a single centred vertical stack (art → info → progress → controls) that
only degrades via width container queries. When the window gets short it has nowhere to go, so
the player becomes unusable well before the window hits its `minHeight: 60`.

We want the now-playing surface to survive being squashed, and to make shrinking deliberate:

1. **h < 300px (compact)** — media controls move to the *left* of the progress bar, and the track
   title drops to the same size as the artist/album lines.
2. **h < 160px (mini)** — the progress bar becomes a 4px line pinned to the bottom of the window,
   and only the *next* button remains, to the right of the title.
3. **Clicking the album art** toggles the window between a cached large size and a cached small
   size (~560×240), persisted across restarts.

### Constraint discovered during exploration

`.player-view` uses `container-type: size`, so container queries measure *the view*, not the window.
With the 40px titlebar and the always-mounted `PlayerBar` (`min-height: 72px`), a 240px window would
leave PlayerView ~128px and a 160px window ~48px. **Tiers must therefore key off real window height
and must collapse the app chrome**, not just restyle inside the existing box.

Decisions taken with the user:
- At compact/mini, **titlebar and PlayerBar are both hidden**; PlayerView owns the whole window.
  A drag region moves into PlayerView so the frameless window stays movable.
- Shrinking **switches to the player view** and restores the previous view on growing back.
- Cached sizes **persist across restarts** (via the existing `Settings` localStorage blob).

---

## Approach

A single JS-driven `data-height-tier` attribute on `.app-shell` (mirroring the existing
`data-density` idiom at `src/app/styles/library.css:149-167`) drives all CSS. Layout inside
PlayerView uses **CSS grid named areas**, so no JSX reordering is needed for "controls left of
progress".

### 1. Height tier

New `src/app/hooks/useHeightTier.ts`:

```ts
export type HeightTier = 'normal' | 'compact' | 'mini'

export const COMPACT_MAX_HEIGHT = 300
export const MINI_MAX_HEIGHT = 160

const tierFor = (h: number): HeightTier =>
  h < MINI_MAX_HEIGHT ? 'mini' : h < COMPACT_MAX_HEIGHT ? 'compact' : 'normal'
```

A `resize` listener that `setState`s the tier string — React bails out on an identical value, so no
throttling is needed (unlike storing raw pixels).

`src/app/hooks/useWindowSize.ts` is currently **dead code with zero consumers**. Either build on it
or delete it; do not leave two overlapping hooks. Recommend deleting it, since it re-renders per
pixel and nothing needs that.

Export from `src/app/hooks/index.ts`.

### 2. Attribute host

`src/app/layout/AppLayout.tsx` — call `useHeightTier()` and put it on the shell:

```tsx
<div className='app-shell' data-height-tier={tier}>
```

All affected elements (`.titlebar`, `.app-player`, `.app-sidebar`, `.player-view`) are descendants.

### 3. Chrome collapse + drag — `src/app/styles/app.css`

```css
.app-shell[data-height-tier='compact'],
.app-shell[data-height-tier='mini'] {
  & .titlebar,
  & .app-player,
  & .app-sidebar { display: none; }

  & .player-view { -webkit-app-region: drag; }

  & .album-art-card,
  & .playback-controls,
  & .progress-section { -webkit-app-region: no-drag; }
}
```

The `no-drag` list is **required** — album art is now a click target, and drag regions swallow
clicks. Follows the existing pattern at `app.css:48,66,82,117`.

### 4. Compact tier (h < 300) — `src/app/styles/player.css`

```css
.app-shell[data-height-tier='compact'] .player-content {
  display: grid;
  grid-template-columns: auto auto 1fr;
  grid-template-areas:
    'art info     info'
    'art controls progress';
  align-content: center;
  gap: var(--sp-2) var(--sp-4);
}
```

with `.album-art-card { grid-area: art }`, `.player-info { grid-area: info; text-align: left }`,
`.playback-controls { grid-area: controls }`, `.progress-section { grid-area: progress }`.

Title downscale — `.track-title` goes from `var(--text-xl)` to `var(--text-sm)`, matching
`.track-artist`/`.track-album` (`player.css:164-165`). Keep `--font-semibold` for hierarchy.

Album art sizes off container height, reusing the existing `clamp(…cqh…)` idiom from
`player.css:56`.

> **Note:** named grid areas put visual order (controls → progress) at odds with DOM order
> (progress → controls), so tab order differs from the visual layout in this tier. Accepted —
> it's a three-button group and the normal tier is the primary surface.

### 5. Mini tier (h < 160) — `src/app/styles/player.css`

```css
.app-shell[data-height-tier='mini'] .player-content {
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'art info next';
  align-items: center;
}
```

- `.track-artist`, `.track-album` → `display: none`
- `.playback-controls { grid-area: next }`, and `> :not(.next-btn) { display: none }`
- `.progress-section` → `position: absolute; inset: auto 0 0 0;` (`.player-view` is already
  `position: relative`, `player.css:11`), `.time-row` hidden
- 4px line: `.waveform-progress { height: 4px; padding: 0; min-width: 0 }` and
  `.wf-bar { transform: none; max-width: none; border-radius: 0 }` — this flattens the amplitude
  `scaleY(var(--amp))` (`waveform-progress.css:32`) into a solid two-tone bar while **keeping
  click-to-seek and the `role='slider'` keyboard handling intact**. Scope these overrides under the
  tier selector; do not edit the base `.waveform-progress` rules.
- Album art stays visible — it is the only way to grow the window back.

**Cleanup:** delete the legacy `@container (max-height: 80px)` block (`player.css:136-146`). It is
the only pre-existing height rule and would otherwise fight the new tier system.

### 6. Album art becomes a control — `src/app/views/PlayerView.tsx`

Change `<figure className='album-art-card'>` (L42) to a real button:

```tsx
<button
  type='button'
  className='album-art-card'
  aria-label='Toggle compact player'
  onClick={toggleWindowScale}
>
```

Keeps the selector, gains focus/keyboard for free (per the accessibility rule in
`docs/DESIGN_GUIDE.md`). Add a small button reset (`border: 0; padding: 0; background: none`) to
`.album-art-card`.

Add `className='prev-btn'` / `className='next-btn'` to the two `IconButton`s (L73-79, L90-96),
matching the existing `.play-pause-btn` precedent.

> **Pre-flight check:** confirm `src/app/components/atomic/IconButton.tsx` forwards `className`.
> If it does not, add the passthrough rather than falling back to `:last-child`.

### 7. Resize plumbing (new IPC)

There is currently **no** window-sizing IPC. Add `window:set-size` across the bridge chain:

| File | Change |
|---|---|
| `src/main.ts` (near L288-309) | `ipcMain.on('window:set-size', (_e, w, h) => BrowserWindow.getFocusedWindow()?.setContentSize(Math.round(w), Math.round(h), true))` — `setContentSize` so it matches `innerWidth`/`innerHeight`; third arg animates on macOS |
| `src/preload.ts` (L44-52) | `setWindowSize: (w: number, h: number) => ipcRenderer.send('window:set-size', w, h)` |
| `global.d.ts` **and** `src/global.d.ts` (both L17-21) | add the signature — these are duplicated and must stay in sync |
| `src/app/data/HostBridge.ts` (L16-19) | add `setWindowSize(w: number, h: number): void` |
| `ElectronHost.ts` / `BrowserHost.ts` | delegate / no-op, matching existing style |

`main.ts:33` already sets `minWidth: 60, minHeight: 60`, so no constraint changes are needed.

### 8. Persisted cached sizes — `src/app/contexts/SettingsContext.tsx`

Add to the `Settings` interface (L31-38) and `defaultSettings`:

```ts
readonly compactSize:  { readonly width: number, readonly height: number }  // 560 × 240
readonly expandedSize: { readonly width: number, readonly height: number }  // 1200 × 800
```

plus `setCompactSize` / `setExpandedSize` actions. The whole `Settings` object is already
JSON-persisted to `desktop-audio-settings` (L53, L130, L209), so **no new persistence code is
needed** — the fields ride along. Merge loaded settings over `defaultSettings` so existing stored
blobs without these keys still work.

### 9. Previous-view memory — `src/app/contexts/UIContext.tsx`

Add `previousView: ViewType | null` to `UIState`, and have the existing `setView` (L81-83) record
the outgoing view. This is needed because the shrink can be triggered from
`ExpandedPlayerPortal` (which renders `PlayerView` while `currentView` may still be `'library'`),
where a component-local ref would be lost on unmount.

### 10. The toggle hook — new `src/app/hooks/useWindowScale.ts`

```ts
export function useWindowScale () {
  const { compactSize, expandedSize, setCompactSize, setExpandedSize } = useSettings()
  const { previousView, setView, playerExpanded, setPlayerExpanded } = useUI()
  const host = useHost()

  return useCallback(() => {
    const current = { width: window.innerWidth, height: window.innerHeight }

    if (current.height < COMPACT_MAX_HEIGHT) {
      setCompactSize(current)
      host.setWindowSize(expandedSize.width, expandedSize.height)
      setView(previousView ?? 'library')
    }
    else {
      setExpandedSize(current)
      if (playerExpanded) setPlayerExpanded(false)
      setView('player')
      host.setWindowSize(compactSize.width, compactSize.height)
    }
  }, [ /* … */ ])
}
```

Reading `window.innerWidth/innerHeight` at click time means no per-pixel state is needed. Note
`UIContext` currently exposes a toggle rather than a setter for `playerExpanded` — use whichever
exists, adding an explicit setter only if the toggle can't express "collapse".

---

## Files touched

**New:** `src/app/hooks/useHeightTier.ts`, `src/app/hooks/useWindowScale.ts`
**Modified:** `src/main.ts`, `src/preload.ts`, `global.d.ts`, `src/global.d.ts`,
`src/app/data/HostBridge.ts`, `ElectronHost.ts`, `BrowserHost.ts`,
`src/app/contexts/SettingsContext.tsx`, `src/app/contexts/UIContext.tsx`,
`src/app/hooks/index.ts`, `src/app/layout/AppLayout.tsx`, `src/app/views/PlayerView.tsx`,
`src/app/styles/app.css`, `src/app/styles/player.css`
**Deleted:** `src/app/hooks/useWindowSize.ts` (unused), `player.css:136-146` (legacy nano tier)

---

## Verification

```bash
bun run typecheck && bun run lint && bun test
bun run start
```

Manual, in the running app:

1. **Compact tier** — play a track, open Now Playing, drag the window's bottom edge until the
   height crosses 300px. Titlebar and PlayerBar disappear; art moves left; controls sit to the
   left of the waveform; title shrinks to artist/album size.
2. **Mini tier** — keep shrinking past 160px. Progress collapses to a 4px bar flush with the
   window bottom; artist/album and prev/play buttons vanish; only ⏭ remains right of the title.
   Click the 4px bar — playback should seek.
3. **Drag** — drag the window by empty space in the player at both tiers; confirm clicking the
   art, the buttons and the progress bar still register (i.e. `no-drag` is correct).
4. **Toggle** — at a normal size, click the album art: window animates to ~560×240 and the view
   is Now Playing. Click again: it returns to the size it had *before* shrinking, and to the view
   that was active before.
5. **Cache** — resize the small window to something else, click art twice to round-trip, and
   confirm the new small size is remembered. Quit and relaunch, then click the art: the persisted
   sizes should still apply.
6. **Regression** — at normal height, confirm the PlayerBar, titlebar, sidebar and the existing
   width tiers (`max-width: 480px` / `320px`) are unchanged.
