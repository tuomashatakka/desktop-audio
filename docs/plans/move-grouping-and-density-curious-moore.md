# Library toolbar relocation, grid browsing, overlay views & a real queue

## Context

The titlebar has become the app's junk drawer: it carries the breadcrumb, the
search field, the density switch and a popover holding the grouping switch —
controls that act on the track list but sit two containers away from it, and
that vanish wholesale (`layout.css:184`) whenever another view is active.

At the same time, Now Playing, Settings and the Tag Editor are *routes*. Opening
any of them tears the library down (`.app-view` display switching, `layout.css:115-143`)
and takes the sidebar with it (`layout.css:104`). For a music player that is the
wrong model — you glance at the player, you don't navigate to it.

Two gaps make the rest awkward: there is **no grid/card browsing at all**, and
the "queue" is a single `useRef<Track[]>` set once, globally, to
`filteredTracks` (`App.tsx:26-28`) — so folder scoping never reaches playback
and next/prev walk a list the user isn't looking at.

**Outcome:** library filters live with the library; player/settings/tag-editor
become dialogs over a library that stays put; density grows two grid sizes that
turn the list into a card browser driven by the grouping selector; playback runs
off a real queue.

---

## Decisions already taken

| Question | Decision |
|---|---|
| Grid card content | Follows the **grouping** selector — `none`→track cards (click plays), `album`/`artist`/`path`→group cards (click drills in as a list) |
| Opening Now Playing | Click the footer player bar (`.player-promote` already exists, `Player.tsx:195`) |
| Overlay mechanism | Native `<dialog>` modal, Esc + backdrop dismiss, `closedby='any'` |
| Queue | Full queue + index in `AudioContext`; no UI yet |
| Album cover click | **Album group heading** cover queues the album from track 1; row clicks stay per-track |
| Tag editor | Also an overlay — `ViewType` collapses entirely |
| Titlebar nav | Gone; settings gear moves to the **sidebar footer** |
| Extra | Ship a `Rating` input component and show it in the tag editor |

---

## Phase 1 — `UIContext`: overlays, grid densities, group scope

`src/app/contexts/UIContext.tsx`

```ts
export type OverlayName = 'player' | 'settings' | 'tag-editor'
export type Density     = 'compact' | 'normal' | 'relaxed' | 'grid-sm' | 'grid-lg'
export type Grouping    = 'none' | 'album' | 'artist' | 'path'

/** A drilled-into bucket — set by clicking a card in grid view. */
export interface GroupScope {
  readonly grouping: Exclude<Grouping, 'none'>
  readonly key:      string   // the same bucketKey the table groups on
  readonly label:    string
}
```

- **Remove** `currentView`, `previousView`, `setView`. **Add** `overlay: OverlayName | null`,
  `openOverlay(name)`, `closeOverlay()`.
- **Add** `selectedGroup: GroupScope | null` + `selectGroup(scope | null)`. It joins
  the existing mutual-exclusion trio: `selectFolder` / `selectPlaylist` /
  `selectGroup` each clear the other two (same shape as `UIContext.tsx:139-147`).
- `setEditingTrack(id)` now calls `openOverlay('tag-editor')` instead of `setView`.
- `loadDensity()` must accept the two new values; export a helper
  `export const isGridDensity = (d: Density) => d.startsWith('grid')`.
- Persistence keys are unchanged. Keep the `readSetting` try/catch — the
  leveldb-lock reason in that docblock still applies.

## Phase 2 — Generalize the dialog into `Overlay`, add `OverlayHost`

`Dialog.tsx` already owns the whole native-dialog dance (portal, `showModal()`/
`close()` off a prop, `closedby='any'`, `onClose` guard). Lift that out rather
than writing it twice.

**New** `src/app/components/atomic/Overlay.tsx`

```tsx
interface OverlayProps {
  readonly open:      boolean
  readonly onClose:   () => void
  readonly label:     string                          // aria-label
  readonly variant?:  'panel' | 'sheet' | 'full'      // default 'panel'
  readonly className?: string
  readonly children:  ReactNode
}
```

Renders `createPortal(<dialog className='overlay-dialog …' data-variant={variant} …>)`.

**Refactor** `Dialog.tsx` to `<Overlay variant='panel'>` + its titled `<header>`.
`PromptDialog` is untouched.

**New** `src/app/layout/OverlayHost.tsx` — reads `overlay` from `useUI()` and renders:

| overlay | variant | body |
|---|---|---|
| `'player'` | `full` | `<Player variant='full' />` |
| `'settings'` | `sheet` | `<SettingsView />` |
| `'tag-editor'` | `sheet` | `<TagEditorView />` |

Only the active one mounts; `Overlay`'s exit transition is what keeps it painted
while it leaves.

## Phase 3 — Shell: delete the route machinery

- `src/app/layout/AppLayout.tsx` — drop `data-view`; add an `overlays` slot rendered
  after `.app-workspace`. `main` becomes a single node, not three `.app-view` divs.
- `src/app/App.tsx` — `main={<LibraryView />}`, `overlays={<OverlayHost />}`.
  Delete the `setCurrentQueue(filteredTracks)` effect (`App.tsx:26-28`).
- `src/app/layout/Titlebar.tsx` — delete `NAV_ITEMS`, `NAV_LABELS`, the `<nav>` block
  and the `currentView === 'player'` special case in `handleSidebar`. What remains:
  menu toggle, logo, `.titlebar-context` (search only), window controls.
- `src/app/layout/LibrarySidebar.tsx` — add `<footer className='sidebar-footer'>` with a
  settings `IconButton` → `openOverlay('settings')`.
- `src/app/hooks/useWindowScale.ts` — shrinking calls `closeOverlay()` (the height-tier
  CSS already makes the footer player fill the window); growing does nothing
  view-related. `src/app/hooks/useKeyboardShortcuts.ts:70` → `openOverlay('player')`;
  the Escape branch at `:104` can go, `<dialog closedby='any'>` handles it.

## Phase 4 — CSS: routes out, overlays in

`src/app/styles/layout.css`
- Delete `.app-view` (`:115-126`), `.app-view-settings/.app-view-tag-editor` (`:128-129`)
  and the `data-view` switch (`:131-143`).
- `.app-main` (`:39-59`) — drop the `[data-view='player']` fade block.
- `.app-player` (`:67-87`) — keep `--player-h` and the `data-empty` retract; the
  `100%` rule now keys **only** on the small height tiers. The `[data-view='player']`
  selector goes.
- `.app-sidebar` (`:103-107`) — collapse on `:not([data-sidebar-open])` only.
- `.titlebar-context` (`:184`) — drop the `:not([data-view='library'])` hide.
- Remove `.titlebar-nav` / `.nav-item` / `.nav-icon` (`:195-215`).

`src/app/styles/components.css`
- Promote the `.dialog-panel` motion recipe (`:143-191`) to
  `:where(.overlay-dialog, .dialog-panel)`; size per `[data-variant]`:
  `panel` = today's `min(100vw - var(--sp-8), 480px)`; `sheet` = `min(100vw - var(--sp-8), 860px)`
  with `max-height: min(100dvh - var(--sp-8), 720px)` and `overflow: auto`;
  `full` = `100vw / 100dvh`, `max-width: none`, `border-radius: 0`,
  `@starting-style { translate: 0 100% }` so it rises from where the bar was —
  the same read as the old `--player-h` growth.
- Add `.segmented`, `.rating`, `.media-card`.

`src/app/styles/views.css`
- `.search-input` (`:103-123`) — add `margin-inline: var(--sp-2)`; make it subtler
  (transparent background/border at rest, `--bg-input` + `--border-hover` on
  hover/`:focus-within`). Centre the glyph in the collapsed state:

  ```css
  &:not(:focus-within):has(> input:placeholder-shown) {
    width: var(--sp-8);
    > .icon { left: 50%; transform: translate(-50%, -50%); }
  }
  ```

- Replace `.density-toggle` (`:163-190`) and `.config-menu` (`:203+`) with one
  `.segmented` block; delete `.config-toggle` (`:191-202`).
- New `.library-toolbar` — `position: sticky; top: 0` inside `.library`, above
  `.track-scroll`. New `.library-grid` / `.media-card` / `.album-art-play`.
- Revisit the breakpoint block (`:441-456`): 720/620 targeted the titlebar's
  cramped row and no longer apply the same way; the search rule at 500 stays.

## Phase 5 — Extract the shared pieces

Three things are module-private in `TrackTable.tsx` today and are needed in two
places once the grid exists. Extract before building the grid, not after.

| New file | Moved from | Consumers |
|---|---|---|
| `components/atomic/AlbumArt.tsx` | `TrackTable.tsx:119-125` | rows, group headings, cards, player |
| `utils/grouping.ts` — `bucketKey`, `groupLabel`, `buildGroups`, `parentDir` | `TrackTable.tsx:98-101, 305-312, 350, 499-524` | `TrackTable`, `LibraryGrid`, `LibraryView` (scope filter) |
| `components/atomic/SegmentedControl.tsx` | generalized from `.density-toggle` markup (`LibraryToolbar.tsx:64-81`) | grouping + density |

`SegmentedControl` keeps the existing, already-correct pattern — `<fieldset>` +
`<legend class='sr-only'>` + labels wrapping visually-hidden radios. No ARIA
needed; a radio group *is* a radiogroup.

```tsx
interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly icon?: IconName
}

interface SegmentedControlProps<T extends string> {
  readonly name:      string
  readonly legend:    string
  readonly value:     T
  readonly options:   readonly SegmentedOption<T>[]
  readonly onChange:  (value: T) => void
  readonly iconOnly?: boolean
  readonly className?: string
}
```

## Phase 6 — The library toolbar strip

`src/app/views/LibraryToolbar.tsx` keeps its path but changes contents and moves
out of the titlebar into `LibraryView`, rendered directly above the list:

```html
<header class="library-toolbar">
  <!-- playlist → <h1>, otherwise the breadcrumb trail -->
  <nav class="breadcrumbs" aria-label="Library location">…</nav>

  <div class="toolbar-controls">
    <SegmentedControl name="grouping" legend="Group tracks by" … />
    <SegmentedControl name="density"  legend="List layout" iconOnly … />
  </div>

  <small role="status">Scanning…</small>
</header>
```

- Search stays in the titlebar (only the `Input` remains inside `.titlebar-context`).
- Density options become five: `compact` · `normal` · `relaxed` · `grid-sm` · `grid-lg`.
  Add two icons to `Icon.tsx` (`grid-sm`, `grid-lg`) alongside the existing
  `density-*` set.
- `Breadcrumbs` (`components/composite/Breadcrumbs.tsx`) gains an optional
  `trail?: readonly Crumb[]` appended after the folder crumbs, so a drilled-into
  album renders `Library / Music / Kid A` and clicking an earlier crumb calls
  `selectGroup(null)`. `buildCrumbs` is already exported and takes the root
  collapsing (`matchRoot`) — extend, don't fork.

## Phase 7 — Grid browsing

**New** `src/app/components/composite/MediaCard.tsx`

The stretched-link pattern, because a `<button>` may only hold *phrasing*
content — `<button><h3>…</h3></button>` is invalid and silently mangles the
accessibility tree:

```html
<article class="media-card">
  <AlbumArt … />
  <h3><button type="button" class="card-open">Kid A</button></h3>
  <p class="card-sub">Radiohead · 11 tracks</p>
  <button type="button" class="card-play" aria-label="Play Kid A">▶</button>
</article>
```

`.card-open::after { position: absolute; inset: 0 }` over a `position: relative`
card makes the whole tile clickable while the heading stays a heading;
`.card-play` needs a `z-index` above that pseudo-element. Track cards
(`grouping === 'none'`) omit `.card-play` — the open action already plays.

**New** `src/app/components/composite/LibraryGrid.tsx` — `<ul class="library-grid"
data-size='sm|lg'>` of `<li><MediaCard/></li>`, buckets from `utils/grouping.ts`.
Sizes hang off one custom property (`--card: 128px` / `200px`) feeding
`grid-template-columns: repeat(auto-fill, minmax(var(--card), 1fr))`.

**`src/app/views/LibraryView.tsx`** picks the layout:

```ts
const layout = isGridDensity(density) && !selectedGroup ? 'grid' : 'list'
```

A drill-in always renders the list, per the decision above; density is left
untouched so returning to the grid restores the chosen card size. `displayTracks`
(`LibraryView.tsx:91-98`) gains a `selectedGroup` branch filtering on
`bucketKey(track, selectedGroup.grouping) === selectedGroup.key`.

Card click by grouping: `none` → `playQueue([track], 0)`; `album`/`artist`/`path`
→ `selectGroup({ grouping, key, label })`.

## Phase 8 — Album heading cover plays the album

`TrackTable.tsx` `TrackGroup`, album branch (`:435-450`). The artwork sits outside
the `<header>` already, so it is *not* inside a row `<button>` — wrapping it is legal:

```jsx
<button
  className='album-art-play'
  type='button'
  aria-label={ `Play ${group.label}` }
  onClick={ () => onPlayGroup?.(group.tracks) }>
  <AlbumArt trackId={ group.tracks[0].id } color={ group.tracks[0].coverColor } />
  <Icon name='play' />
</button>
```

New optional `TrackTable` prop `onPlayGroup?: (tracks: readonly Track[]) => void`,
wired in `LibraryView` to `playQueue(tracks, 0)`. Row thumbnails are untouched —
clicking a row already plays that row.

## Phase 9 — A real queue in `AudioContext`

`src/app/contexts/AudioContext.tsx`

```ts
interface AudioState {
  … // unchanged
  readonly queue:      readonly Track[]
  readonly queueIndex: number
}

interface AudioContextValue extends AudioState {
  readonly play:         (track: Track) => void                              // single-track queue
  readonly playQueue:    (tracks: readonly Track[], startIndex?: number) => void
  readonly enqueue:      (tracks: readonly Track[]) => void
  readonly playNext:     () => void                                          // was (tracks) => void
  readonly playPrevious: () => void
  …
}
```

- `queueRef` / `queueIndexRef` are the source of truth (the `ended` listener is
  registered once, `:270-272`, and must not close over stale state); mirror both
  into React state so a queue panel later is pure UI.
- `pickTrack` (`:60-89`) becomes `pickIndex(length, current, step, shuffle, repeat)`.
  Its documented semantics survive verbatim: shuffle ignores direction, `repeat: 'all'`
  wraps, `repeat: 'none'` returns null, `repeat: 'one'` re-seeks in the caller.
- Delete `setCurrentQueue` and `currentQueueRef` (`:157-160`); MediaSession handlers
  (`:184-189`) call the no-arg transport.
- Callers: `Player.tsx` next/prev drop their `filteredTracks` argument;
  `LibraryView.handleTrackPlay(track, index)` becomes
  `selectTrack(index); playQueue(displayTracks, index)`.

## Phase 10 — `Rating` component + tag editor field

`rating` already exists end to end — `track-schema.ts:31` (`INTEGER`), the scanner
writes it (`scanner-worker.ts:174`), `models/Track.ts:13` has the accessor,
`useColumnConfig.ts:39` has a hidden column, `tests/track-schema.test.ts:19-44`
pins the write path. It is only missing from the editor.

**New** `src/app/components/atomic/Rating.tsx` — same native pattern as
`SegmentedControl`: `<fieldset class='rating'>` + `<legend class='sr-only'>` + six
visually-hidden radios (`0`–`5`, `0` labelled "No rating") with star `Icon`s.
Fill is CSS-only via sibling selectors; keyboard arrows come free with radios.
Accept `readOnly` so the list cell can reuse it later.

- `src/app/services/types.ts` — add `'rating'` to the `TagField` union and to
  `PRIMARY_TAG_FIELDS`.
- `src/app/views/TagEditorView.tsx` — `FIELD_META.rating = { label: 'Rating', type: 'rating' }`,
  a `'rating'` branch in `TagInput`, and `parseField` mapping `'' → undefined`
  else `Number(value)`.

## Phase 11 — Documentation

`CLAUDE.md` sections that this invalidates and must be rewritten: **Player tiers**
(no more `data-view='player'`), **Motion** (the `--player-h` growth is now the
overlay's slide-up; the sidebar and `allow-discrete` notes stay), **Track table
layout**, and the **Architecture** tree. Add short sections for the overlay host,
the queue, and the grid.

---

## Files touched

**New** — `components/atomic/{Overlay,SegmentedControl,Rating,AlbumArt}.tsx`,
`components/composite/{MediaCard,LibraryGrid}.tsx`, `layout/OverlayHost.tsx`,
`utils/grouping.ts`

**Rewritten** — `contexts/UIContext.tsx`, `layout/Titlebar.tsx`,
`views/LibraryToolbar.tsx`, `App.tsx`

**Edited** — `layout/AppLayout.tsx`, `layout/LibrarySidebar.tsx`,
`contexts/AudioContext.tsx`, `views/LibraryView.tsx`, `views/TagEditorView.tsx`,
`components/composite/{TrackTable,Player,Breadcrumbs}.tsx`,
`components/atomic/{Dialog,Icon}.tsx`, `hooks/{useWindowScale,useKeyboardShortcuts}.ts`,
`services/types.ts`, `styles/{layout,components,views}.css`, `CLAUDE.md`

---

## Verification

1. `bun run typecheck` — the `ViewType` removal is the compiler's job; every
   `setView` / `currentView` / `previousView` reference should surface as an error
   and get converted. Same for `playNext(tracks)`.
2. `bun run lint`
3. `bun run test` — update the tests that pin the old model:
   `tests/layout/{Titlebar,AppLayout}.test.tsx` (both mock `currentView`/`density`),
   `tests/contexts/UIContext.test.tsx`, `tests/components/composite/TrackTable.test.tsx`,
   `tests/views/LibraryView.test.tsx`. Add: `SegmentedControl`, `Rating`,
   `LibraryGrid`/`MediaCard`, `OverlayHost`, and an `AudioContext` queue suite
   (`playQueue` sets index; `playNext` walks it; shuffle/repeat honour it; `ended`
   advances through the internal queue, not a captured list).
4. `bun run start` — manual pass:
   - toolbar sits above the list, sticky on scroll; grouping + density both work there
   - search: has margin, subtle at rest, icon centred when collapsed, expands on focus
   - all five density options; `grid-sm`/`grid-lg` render cards; card click drills in
     under album/artist/path and plays under `none`
   - breadcrumb shows the drilled-in album and clicking back returns to the grid
   - album group heading cover plays the album; the next track is the album's #2,
     not whatever follows in `filteredTracks`
   - clicking the footer bar opens Now Playing as a dialog **with the library and
     sidebar still visible behind it**; Esc and backdrop click both close it
   - settings gear in the sidebar footer opens the settings overlay; the tag editor
     opens from the row context menu, shows the star rating, and a saved rating
     survives a rescan
   - resize the window below 480px tall: the player still takes the whole window
     via the height tier, with no overlay involved
