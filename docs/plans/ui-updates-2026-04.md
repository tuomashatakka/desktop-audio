# UI Updates — April 2026

## Context

Four interrelated UI/UX improvements targeting the player, waveform, library, and input-handling
layers. All changes are additive CSS/React refactors; no data model changes required.

---

## 1  Player View — Simplify, Responsive Art, Merge Mini Player

### Current state
- `PlayerView.tsx` renders a fixed 340×340 `<figure className="album-art-card">` inside
  `.player-content` (flex column), surrounded by a tab bar, progress section, and controls.
- `MiniPlayer.tsx` is a completely separate component conditionally rendered in `App.tsx` when
  `windowWidth < 400`. It duplicates the track-info and controls DOM.

### Goal
- Remove redundant nested wrapper elements.
- Album art shrinks fluidly when vertical space compresses; at very narrow widths (< ~300 px)
  it jumps left and info appears beside it (row layout).
- Single unified component handles every size tier — no separate MiniPlayer.

### Implementation

**`src/app/views/PlayerView.tsx`**
- Remove the `.player-tab-bar` (Player / Visualizer tab switcher) and the associated `activeTab`
  state. Visualizer can become a separate settings toggle or an overlay — the tabs added a
  wrapper layer that conflicts with the responsive layout.
- Flatten `.player-content` → content sits directly inside `.player-view`.
- Change `<figure className="album-art-card">` to use fluid sizing:
  ```css
  .album-art-card {
    width:     clamp(80px, 40cqh, 320px); /* shrinks with container height */
    aspect-ratio: 1;
    flex-shrink: 1;
  }
  ```
- Add `container-type: size` to `.player-view` to enable container queries.
- Layout rule — when narrow, flip to row:
  ```css
  @container (max-width: 300px) {
    .player-view { flex-direction: row; align-items: center; }
    .album-art-card { width: clamp(40px, 20cqw, 100px); }
  }
  ```
- Nano tier (≤ 80 px either axis): hide everything except the play/pause button — already
  handled by the container query.

**`src/app/App.tsx`**
- Remove the `windowWidth < 400` branch and `<MiniPlayer>` import.
- `<PlayerView>` is always rendered for the player view; CSS handles all size tiers.

**`src/app/components/composite/MiniPlayer.tsx`**
- Delete file (logic fully absorbed into PlayerView).

**`src/app/styles/player.css`**
- Remove `.album-art-card { width: 340px; height: 340px }` fixed sizing.
- Add container-query rules above.
- Remove any mini-player cross-references.

**`src/app/styles/mini-player.css`**
- Delete file (or keep empty stub if imported elsewhere, then remove import).

---

## 2  WaveformProgress — Fixed-Pixel Columns

### Current state
`WaveformProgress.tsx` renders `barCount=70` bars with `flex: 1; min-width: 2px` — bars stretch
to fill width, so column count is fixed regardless of element width.

### Goal
5 px wide columns, 1 px gaps; column count = `⌊containerWidth / 6⌋`.

### Implementation

**`src/app/components/atomic/WaveformProgress.tsx`**
- Add a `containerRef = useRef<HTMLDivElement>(null)` on the root element.
- Add a `useEffect` that creates a `ResizeObserver`:
  ```ts
  const ro = new ResizeObserver(([entry]) => {
    const w = entry.contentRect.width
    setDerivedBarCount(Math.max(1, Math.floor(w / 6)))
  })
  ro.observe(containerRef.current!)
  return () => ro.disconnect()
  ```
- Replace the `barCount` prop default / hard-coded 70 with `derivedBarCount` state (initial `70`
  avoids layout flash on mount).
- Keep the external `barCount` prop as an optional override (if provided, skip ResizeObserver).
- The existing `resampleBars()` helper already handles changing bar counts — no changes needed.

**`src/app/styles/waveform-progress.css` (or wherever `.wf-bar` lives)**
- Change bar sizing from `flex: 1; min-width: 2px` to:
  ```css
  .wf-bar { width: 5px; flex: none; }
  ```
- Change gap from `2px` to `1px`:
  ```css
  .wf-bars { gap: 1px; }
  ```

---

## 3  Library View — Sidebar + Header Improvements

### 3a  Sidebar collapsed by default

**`src/app/contexts/UIContext.tsx`**
- Change initial state from `sidebarOpen: true` to `sidebarOpen: false`.

### 3b  Hide/show `.view-header` on scroll direction

The tracks container scroll is managed by a `scrollRef` inside `TrackTable.tsx`
(`@tanstack/react-virtual` virtualized list). The approach:

**`src/app/components/composite/TrackTable.tsx`**
- Accept an optional `onScroll?: (e: Event) => void` prop.
- Forward it to the virtualized scroll container: `scrollRef.current.addEventListener('scroll', onScroll)` inside an effect (cleanup on unmount / prop change). Alternatively, expose `scrollRef` via `useImperativeHandle`.

**`src/app/views/LibraryView.tsx`**
- Add local state: `const [headerVisible, setHeaderVisible] = useState(true)`.
- Add a `lastScrollY = useRef(0)` to track previous scroll position.
- Implement the scroll callback:
  ```ts
  const handleScroll = useCallback((e: Event) => {
    const el = e.target as HTMLElement
    const dir = el.scrollTop > lastScrollY.current ? 'down' : 'up'
    lastScrollY.current = el.scrollTop
    if (dir === 'down' && el.scrollTop > 40) setHeaderVisible(false)
    else setHeaderVisible(true)
  }, [])
  ```
- Pass `onScroll={handleScroll}` to `<TrackTable>`.
- Apply class to header: `<header className={`view-header ${headerVisible ? '' : 'header-hidden'}`}>`.

**`src/app/styles/app.css` (`.view-header` block)**
- Make it sticky and add hide/show transition:
  ```css
  .view-header {
    position: sticky;
    top: 0;
    z-index: 10;
    transition: transform var(--duration) var(--ease),
                opacity var(--duration) var(--ease);
    background: var(--bg);   /* prevent content bleed-through */
  }
  .view-header.header-hidden {
    transform: translateY(-100%);
    opacity: 0;
    pointer-events: none;
  }
  ```

### 3c  Smaller heading + show selected context

**`src/app/views/LibraryView.tsx`**
- Compute display title:
  ```ts
  const headerTitle = selectedPlaylistId
    ? (playlists.find(p => p.id === selectedPlaylistId)?.name ?? 'Library')
    : selectedFolderPath
      ? selectedFolderPath.split('/').filter(Boolean).at(-1) ?? 'Library'
      : 'Library'
  ```
- Replace the existing `<h2>` content with `{headerTitle}`.

**`src/app/styles/app.css` (`.view-header h2`)**
```css
.view-header h2 {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
  margin: 0;
}
```

---

## 4  Media Keys + Navigation Hotkeys

### 4a  OS media playback controls (globalShortcut)

**`src/main.ts`**
- Store `mainWindow` reference at module scope (`let mainWindow: BrowserWindow | null = null`).
- After `createWindow()`, register global shortcuts:
  ```ts
  import { globalShortcut } from 'electron'
  // inside app.on('ready'):
  globalShortcut.register('MediaPlayPause',    () => mainWindow?.webContents.send('media:play-pause'))
  globalShortcut.register('MediaNextTrack',    () => mainWindow?.webContents.send('media:next'))
  globalShortcut.register('MediaPreviousTrack',() => mainWindow?.webContents.send('media:prev'))
  ```
- Unregister on quit: `app.on('will-quit', () => globalShortcut.unregisterAll())`.

**`src/preload.ts`**
- Add three subscription methods following the existing `onLibraryBatch` pattern:
  ```ts
  onMediaPlayPause: (cb: () => void) => {
    const h = () => cb()
    ipcRenderer.on('media:play-pause', h)
    return () => ipcRenderer.removeListener('media:play-pause', h)
  },
  onMediaNext: (cb: () => void) => { … },
  onMediaPrev: (cb: () => void) => { … },
  ```

**`global.d.ts` (`ElectronAPI` interface)**
- Add:
  ```ts
  readonly onMediaPlayPause: (cb: () => void) => () => void
  readonly onMediaNext:      (cb: () => void) => () => void
  readonly onMediaPrev:      (cb: () => void) => () => void
  ```

**`src/app/hooks/useKeyboardShortcuts.ts`**
- In a new `useEffect`, subscribe to media IPC events:
  ```ts
  const unsub1 = bridge.onMediaPlayPause(() => { if (currentTrack) isPlaying ? pause() : resume() })
  const unsub2 = bridge.onMediaNext(() => playNext(tracks))
  const unsub3 = bridge.onMediaPrev(() => playPrevious(tracks))
  return () => { unsub1(); unsub2(); unsub3() }
  ```
- Requires access to `tracks` from `LibraryContext` and audio actions from `AudioContext`.

### 4b  Navigation hotkeys

**`src/app/hooks/useKeyboardShortcuts.ts`**
- Add `Escape` case in the existing `keydown` handler:
  ```ts
  case 'Escape':
    if (playerExpanded) togglePlayerExpanded()
    else if (currentView === 'player') setView('library')
    e.preventDefault()
    break
  ```
- Add `Alt` key case (fires on `keydown`, `e.key === 'Alt'`):
  ```ts
  case 'Alt':
    // Focus the first interactive element in the title bar
    document.querySelector<HTMLElement>('.title-bar button')?.focus()
    break
  ```
  Note: do NOT `preventDefault()` on Alt — it interferes with OS-level Alt combos.
- The hook needs `currentView`, `setView`, `playerExpanded`, `togglePlayerExpanded` from UIContext —
  add these if not already destructured.

---

## Files modified / deleted

| Action   | Path |
|----------|------|
| Modify   | `src/app/views/PlayerView.tsx` |
| Modify   | `src/app/App.tsx` |
| Delete   | `src/app/components/composite/MiniPlayer.tsx` |
| Modify   | `src/app/styles/player.css` |
| Delete   | `src/app/styles/mini-player.css` |
| Modify   | `src/app/components/atomic/WaveformProgress.tsx` |
| Modify   | `src/app/styles/waveform-progress.css` |
| Modify   | `src/app/contexts/UIContext.tsx` |
| Modify   | `src/app/views/LibraryView.tsx` |
| Modify   | `src/app/components/composite/TrackTable.tsx` |
| Modify   | `src/app/styles/app.css` |
| Modify   | `src/main.ts` |
| Modify   | `src/preload.ts` |
| Modify   | `global.d.ts` |
| Modify   | `src/app/hooks/useKeyboardShortcuts.ts` |

---

## Verification

```bash
bun run start           # smoke test all four features visually
bun run typecheck       # no TS errors
bun run lint            # no lint errors
bun run test            # 48/48 pass (no regressions)
```

Manual checks:
- Resize player window from 800 → 200 px wide: art shrinks, layout flips to row, eventually
  only play button visible — no MiniPlayer import needed.
- WaveformProgress: resize window; column count updates in real time, each bar exactly 5 px.
- Library: loads with sidebar collapsed; scroll track list down → header hides; scroll up → header
  reappears; header shows selected folder/playlist name in small caps.
- Media keys (⏯ ⏭ ⏮) trigger playback actions from outside the app window.
- Escape closes now-playing; Alt focuses first title-bar button.
