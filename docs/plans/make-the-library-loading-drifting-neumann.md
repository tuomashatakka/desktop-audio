# Async library loading, lint upgrade, motion, and keyboard browsing

## Context

Four related pieces of work, delivered as three pushed commits.

1. **Library loading blocks the main process.** `ipcMain.handle('library:load')`
   (`src/main.ts:189`) opens better-sqlite3 *synchronously on the Electron main
   thread* and runs `SELECT * FROM tracks` to completion before returning one
   array. The renderer awaits that whole array before it paints a single row.
   On a large library the window is unresponsive for the duration. The scanner
   already solved this shape — worker thread, batched `library:batch` events —
   and hydration should work the same way.

   While tracing this: **`src/db-writer.ts` is never built.** It is absent from
   the `VitePlugin` build entries in `forge.config.ts:165-190`, so
   `path.join(__dirname, 'db-writer.js')` (`src/main.ts:388`) points at a file
   that does not exist and every renderer-side tag save spawns a worker that
   cannot start. Fixed here because the same build-entry change is needed for
   the reader worker.

2. **The lint config is a stale hand-copy.** `eslint.config.mjs` is 400 lines
   vendored from an older `@tuomashatakka/eslint-config`, plus
   `eslint-plugin-functional` and `eslint-plugin-unicorn` on the side. The
   package is at `4.0.1`; `package.json` pins `^3.1.0` and never imports it.

3. **All interaction motion is switched off.** `--duration-fast` and
   `--duration` are `0ms` in `tokens.css:147-148`, a deliberate choice
   documented in `CLAUDE.md`. That decision is being reversed: every UI
   mutation should animate in *and* out, and promoting the player to
   now-playing should slide up and back down.

4. **Keyboard browsing is half-built.** `TrackTable` has roving-tabindex
   Up/Down, but it navigates by *global sorted index* while grouped mode
   *renders* in group order — so arrows jump to the wrong row whenever
   grouping is on. The sidebar `FolderTree` has no arrow handling at all; its
   docstring says so explicitly ("a real tree widget owes the user arrow-key
   roaming and a single tab stop, which this doesn't implement").

**Outcome:** rows stream in progressively from a worker, the codebase lints
against the current shared config, every state change animates both
directions, and arrow keys browse both panes properly.

---

## Decisions taken

| Question | Choice |
| --- | --- |
| Lint depth | Adopt v4 verbatim. `--fix`, then hand-fix everything mechanical. `react-strict/prefer-no-use-effect` warnings stay (rewriting those effects is a separate refactor) and get a note in `CLAUDE.md`. |
| Async load | Stream from a worker in batches, reusing the scanner's event shape. |
| Motion | Expressive — `--duration-fast: 180ms`, `--duration: 260ms`, visible translate/scale on enter and exit. |
| Constants | No magic numbers left in either language: named `SCREAMING_SNAKE_CASE` constants in TS, design tokens in CSS. |
| CSS structure | Native CSS nesting (no PostCSS in this project), one nested block per component, per `docs/DESIGN_GUIDE.md`. |

---

## Cross-cutting: parametrize constants, nest CSS

Applies to every commit; the work lands in whichever commit already touches the
file.

### TypeScript / TSX

- [ ] Every literal that carries meaning becomes a module-level
      `SCREAMING_SNAKE_CASE` constant near the top of its file, following the
      pattern already used by `STREAM_BATCH_SIZE` (`scanner-worker.ts`),
      `ROW_HEIGHT_BY_DENSITY` / `SKELETON_ROW_COUNT` (`TrackTable.tsx`) and
      `MIN_WIDTH` / `MAX_WIDTH` / `RESIZE_STEP` (`LibrarySidebar.tsx`).
- [ ] Known offenders: the `36` / `2, 11` id-radix slice repeated in
      `useLibraryScanner.ts`, `LibraryContext.tsx` and `UIContext.tsx` (extract
      one shared `generateId` into `src/app/utils/`), the `48` minimum column
      width and drag thresholds in `TrackTable.tsx`, `1024 * 1024` in
      `formatSize`, the `24`-pixel sample canvas and bucket counts in
      `useAmbientPalette.ts`, `DB_WRITE_DEBOUNCE_MS`-style timings, window
      dimensions in `main.ts` (`1200`/`800`/`60`, popover `240`/`160`), and the
      tier thresholds in `useHeightTier.ts` / `useWindowScale.ts`.
- [ ] Literals that are genuinely arbitrary (array index `0`, `+ 1`) stay.

### CSS

- [ ] Every raw length, duration, colour and z-index in
      `src/app/styles/*.css` resolves to a token. Add the missing ones to
      `tokens.css`: `--player-bar-h` (72px), `--head-h` (34px, currently
      component-local), `--sidebar-w-min/-max/-default`, `--art-lg` (96px),
      `--settings-nav-w` (200px), `--titlebar-btn-w` (46px),
      `--art-blur` (60px), `--z-*` for the four hardcoded z-indexes
      (`1`, `2`, `10`, `150`, `1000000`), and the waveform/marquee timings.
- [ ] Media-query breakpoints cannot read custom properties. Collect them into
      a single documented block per file with a comment naming each breakpoint,
      rather than scattering bare pixel values.
- [ ] Convert each stylesheet to native CSS nesting — one top-level block per
      component with `&`-nested variants, states and descendants, as
      `docs/DESIGN_GUIDE.md` specifies. No BEM, no new class names; the
      selectors that `layout.css` and `views.css` share with the tier system
      keep their exact names.
- [ ] Native nesting only — this project has no PostCSS config, and Electron 41
      (Chromium) supports it natively.

---

## Commit 1 — Async library loading + eslint v4 + dead code

### 1.1 Worker-side streaming read

- [ ] Add `src/db-reader.ts`: opens the library DB `{ readonly: true, fileMustExist: true }`,
      and on `{ type: 'load' }` walks
      `db.prepare('SELECT * FROM tracks ORDER BY title ASC').iterate()`, posting
      `{ type: 'batch', tracks }` every 200 rows and `{ type: 'done', totalCount }`
      at the end. Maps rows with `rowToDto` from `src/track-schema.ts` — same
      helper `main.ts` uses today, so the DTO shape is unchanged.
- [ ] A missing DB (first run) posts `{ type: 'done', totalCount: 0 }`, not an
      error — matches the current `catch` in `library:load`.
- [ ] `workerData.dbPath` is handed over by the spawner, exactly as
      `scanner-worker.ts` and `db-writer.ts` already expect. Do **not** re-derive
      the path inside the worker (see the docstring on `getDB` in `db-writer.ts:31`).

### 1.2 Build the worker files

- [ ] `vite.worker.config.ts`: replace the hardcoded
      `entry: 'src/scanner-worker.ts'` / `fileName: () => 'scanner-worker.js'`
      with a generic `fileName: (_format, entryName) => \`${entryName}.js\`` so
      one config serves all three workers.
- [ ] `forge.config.ts`: add build entries for `src/db-reader.ts` **and
      `src/db-writer.ts`** (target `main`, config `vite.worker.config.ts`)
      alongside the existing `src/scanner-worker.ts` entry.
- [ ] Add `node:worker_threads` externals as needed — the existing external
      list in `vite.worker.config.ts` already covers what these two import.

### 1.3 Main process

- [ ] `src/main.ts`: delete the synchronous `ipcMain.handle('library:load')`
      body and its inline `require('better-sqlite3')`.
- [ ] Add a `getDbReader()` supervisor mirroring `getScanWorker()` /
      `getDbWriter()` (lazy spawn, `error`/`exit` handlers, cleared on exit,
      terminated in the existing `before-quit` handler).
- [ ] `ipcMain.on('library:load', event => …)` forwards worker messages to
      `event.sender` as `library:hydrate-batch` / `library:hydrate-done`,
      detaching its `message` handler on done — the same `handle`/`worker.off`
      pattern `library:scan` already uses (`src/main.ts:243-268`).
- [ ] Channel names stay `namespace:action` per `CLAUDE.md`.

### 1.4 Preload + bridge types

- [ ] `src/preload.ts`: `loadLibrary` becomes `ipcRenderer.send('library:load')`;
      add `onLibraryHydrateBatch(cb)` and `onLibraryHydrateDone(cb)`, both
      returning unsubscribe functions like the existing `onLibraryBatch` /
      `onLibraryDone`.
- [ ] `src/global.d.ts`: update the `ElectronAPI` interface to match.

### 1.5 Renderer data layer

- [ ] `src/app/data/DataSource.ts`: `load` changes from
      `() => Promise<readonly TrackDTO[]>` to `() => void` (fire-and-forget,
      like `scan`), and `DataEvent` gains
      `{ type: 'hydrate-batch'; tracks: readonly TrackDTO[] }` and
      `{ type: 'hydrate-done'; totalCount: number }`.
- [ ] `src/app/data/IpcDataSource.ts`: `load()` sends; `subscribe()` also wires
      the two hydrate channels. **`indexPaths` must still run on hydrate
      batches** — the docstring at `IpcDataSource.ts:33` explains why (tracks
      restored from SQLite were previously unplayable until a rescan).
- [ ] `src/app/data/WebFsDataSource.ts`: its `load()` (line 289) currently
      resolves an IndexedDB array; convert it to emit one or more
      `hydrate-batch` events followed by `hydrate-done` through the same
      listener set its `subscribe()` (line 297) already manages.

### 1.6 `useLibraryScanner`

- [ ] Handle `hydrate-batch`: merge into `trackCache`, `publish()`, and resolve
      `isInitialLoading` on the **first** batch rather than after the full set.
- [ ] Handle `hydrate-done`: `publishFolders()`, `markInitialResolved()`.
- [ ] Hydrate batches must **not** touch `seenThisScan` — that set is the scan's
      prune bookkeeping, and polluting it would make a concurrent scan's `done`
      keep rows the scan never saw.
- [ ] The module-level `hydrated` guard stays (it is what stops a tab switch
      re-fetching, per `CLAUDE.md`); `data.load()` no longer returns a promise,
      so the `.then` / `.catch` chain goes away and failures arrive as the
      existing `error` event.
- [ ] Clean up while here: the stray `// Track is already imported` comment and
      the second `FolderEntry` import (lines 21-24), and `addAndScan`'s
      `useCallback` with `[]` deps closing over `data`.

### 1.7 ESLint v4

- [ ] `package.json`: `@tuomashatakka/eslint-config` → `^4.0.1`, moved into
      `devDependencies`. Drop the now-bundled/obsolete direct deps:
      `@stylistic/eslint-plugin`, `eslint-plugin-import`,
      `eslint-plugin-functional`, `eslint-plugin-unicorn`, `typescript-eslint`,
      and the ESLint-5-era `@typescript-eslint/eslint-plugin` +
      `@typescript-eslint/parser`.
- [ ] Replace all ~400 lines of `eslint.config.mjs` with the shared config plus
      the project's own ignores and the type-aware parser options:

      ```js
      import config from '@tuomashatakka/eslint-config'

      export default [
        { ignores: [ '.vite/**', 'src/app/index.js' ]},
        ...config,
        {
          files:           [ 'src/**/*.{ts,tsx}' ],
          languageOptions: { parserOptions: { project: true, tsconfigRootDir: import.meta.dirname }},
        },
      ]
      ```

- [ ] Remove every `// eslint-disable-next-line functional/no-let` and other
      `functional/*` / `unicorn/*` disable comment across `src` — those plugins
      are gone and a stale disable for an unknown rule is an ESLint *error*.
      Present in `main.ts`, `db-writer.ts`, `scanner-worker.ts`,
      `useLibraryScanner.ts`.
- [ ] `bun install`, then `bun run lint --fix` (`eslint ./src --fix`).
- [ ] Hand-fix the non-autofixable but mechanical rules:
      - `no-inline-types/no-inline-multiline-types` — extract inline multiline
        prop-type literals to named interfaces (`Player.tsx` `PlayerTransport`
        /`PlayerArtwork`, `TrackTable.tsx` `ColumnMenu`/`GroupToggle`,
        `main.ts`'s `contextmenu:show` payload, `DataContext.tsx`).
      - `react-strict/no-nested-divs` — replace nested `<div>`s with semantic
        elements (`AppLayout`'s `.app-content`, `App.tsx`'s three `.app-view`
        wrappers, `TrackTable`'s `.track-scroll` / `.track-body`). Keep the
        existing class names: `layout.css` and `views.css` select on them.
      - `react-strict/jsx-prop-layout`, `@stylistic/jsx-*`, `omit/*` — mostly
        autofixed; sweep the remainder.
- [ ] Leave `react-strict/prefer-no-use-effect` warnings as-is; note the
      decision in `CLAUDE.md`.
- [ ] `bun run typecheck` and `bun test` must pass unchanged.

### 1.8 Dead code sweep

- [ ] `src/app/data/index.ts`: delete the four back-compat aliases
      (`ElectronBridge`, `BrowserBridge`, `BridgeProvider`, `useBridge`) and
      migrate the one consumer — `src/app/layout/Titlebar.tsx:24` — to `useHost`.
- [ ] `IpcDataSource.removeRoot` / `listRoots` are stubs that log and return
      empty. Confirm nothing calls them (grep both names), then drop them from
      the class and from the `DataSource` interface.
- [ ] Audit every exported symbol in `src/app/models/` (`Album`, `Artist`,
      `WaveformCache`, `observable`) and `src/app/hooks/index.ts` with a
      whole-repo grep; delete what has no consumer outside its own barrel.

### 1.9 Ship

- [ ] Commit on `claude/library-async-linting-animations-focus-6ctapi`,
      `git push -u origin claude/library-async-linting-animations-focus-6ctapi`,
      open a PR (no template in `.github/`, so a normal body).

---

## Commit 2 — Motion on every UI mutation

### 2.1 Tokens

- [ ] `tokens.css`: `--duration-fast: 180ms`, `--duration: 260ms`,
      `--duration-slow: 420ms`.
- [ ] Add `--ease-emphasis: cubic-bezier(0.16, 1, 0.3, 1)` for enters and
      `--ease-exit: cubic-bezier(0.4, 0, 1, 1)` for exits; keep `--ease` for
      symmetric hover/colour changes.
- [ ] `@property --player-h { syntax: '<length-percentage>'; inherits: false; initial-value: 72px }`
      — unregistered custom properties cannot be transitioned (same reason the
      ambient colours are registered, `CLAUDE.md`).
- [ ] Extend the existing `prefers-reduced-motion` block in `components.css` to
      also flatten the duration tokens themselves.

### 2.2 Now playing slides up and down

The player is already mounted permanently in the footer; only CSS decides
whether it reads as a 72px bar or the whole window (`layout.css:631+`). Today
that flip is `display: none` on `.app-main`, which cannot animate.

- [ ] Drive the player's height off the new registered `--player-h`:
      `72px` in the normal/bar state, `100%` under
      `.app-shell[data-view='player']`, with
      `transition: --player-h var(--duration) var(--ease-emphasis)`. The bar's
      top edge slides up to the top of the window and back down — both
      directions, no JS.
- [ ] Stop `display: none`-ing `.app-main` in player view
      (`layout.css:38`); let it be squeezed to zero by the growing player, and
      fade it with `opacity` + a small `translateY` over the same duration.
      `.app-content` is already `overflow: hidden`, so nothing spills.
- [ ] Careful: `.player-view` is the `@container`, so container queries can
      never style `.player-view` itself (`CLAUDE.md`). All tier padding/gap
      still hangs off the tier attribute — the height transition must not
      introduce a rule that violates this.
- [ ] Verify the height-tier rules (`snug`/`compact`/`mini`) still resolve
      correctly, since they also hide chrome.

### 2.3 Sidebar

- [ ] `.app-sidebar` open/close is `width: auto` → `width: 0`
      (`layout.css:26`), which does not interpolate. Convert `.app-sidebar` to
      the collapsible-grid idiom — `display: grid; grid-template-columns: 1fr`
      open, `0fr` closed, inner child `min-width: 0; overflow: hidden` — and
      transition `grid-template-columns` plus `opacity`.
- [ ] Keep the inline `style={{ width }}` on `.library-sidebar` (it is the
      resize handle's output) — the grid track collapses around it.

### 2.4 View switching

- [ ] `.app-view` is `display: none` → `display: flex` (`layout.css:29-35`).
      Add `transition-behavior: allow-discrete` on `display`, an
      `opacity`/`translateY` transition, and `@starting-style` for the enter —
      that is what buys the *exit* animation as well as the entrance.

### 2.5 Everything else

- [ ] Dialogs and popovers already run `surface-in`; add the matching exit via
      `allow-discrete` + `@starting-style` on `dialog[open]` and `[popover]`
      so closing animates too.
- [ ] Enter animation on `.track-body`, `.track-group`, `.library-empty`,
      `.library-empty-card`, `.status-message`.
- [ ] **Do not** put an enter animation on individual virtualized `.track-row`s
      — they re-key constantly while scrolling and would flash on every wheel
      tick. Rows animate their `background-color` on hover/active only.
- [ ] Group collapse: rows are unmounted when collapsed (a documented perf
      decision in `CLAUDE.md`), so only expansion is animatable. Animate the
      `.group-toggle` chevron and the header, and accept the asymmetry rather
      than keeping thousands of nodes mounted. Note it in `CLAUDE.md`.
- [ ] Add the missing `background-color`/`color` transitions on `.folder-row`,
      `.playlist-list button`, `.track-row`, `.settings-nav a`,
      `.density-toggle label`, `.config-menu label`.
- [ ] Rewrite the **"Instant interaction and waveform rendering"** section of
      `CLAUDE.md` — it currently states the opposite of this commit.

---

## Commit 3 — Keyboard browsing + dead styles

### 3.1 Sidebar becomes a real tree

- [ ] New `src/app/hooks/useTreeNavigation.ts`: takes the folder list, returns
      the flattened *visible* node order plus a `handleKeyDown`. Semantics:
      - `ArrowDown` / `ArrowUp` — next / previous visible node.
      - `ArrowRight` — expand the focused node; if already expanded, move to
        its first child.
      - `ArrowLeft` — collapse the focused node; if already collapsed or a
        leaf, move to its **parent** ("close the current parent").
      - `Home` / `End` — first / last visible node.
      - `Enter` / `Space` — select.
- [ ] `FolderTree.tsx` becomes the WAI-ARIA tree pattern: `role="tree"` on the
      outer `<ul>`, `role="group"` on nested ones, `role="treeitem"` +
      `aria-expanded` + `aria-selected` on each `<li>`, and roving `tabIndex`
      (`0` on the focused node, `-1` elsewhere) so the tree is one tab stop.
- [ ] The disclosure chevron stops being a nested `<button>` — a button inside
      a treeitem breaks the pattern and duplicates `aria-expanded`. It becomes
      an `aria-hidden` span whose pointer handler still toggles.
- [ ] Rewrite the `FolderTree` docstring: it currently explains why this is
      *deliberately not* a tree.
- [ ] Reuse the existing `toggleFolder(path)` from `LibraryContext` for
      expand/collapse — no new state.

### 3.2 Track list arrow navigation

- [ ] Fix the grouped-mode bug: `renderRow` is called with `indexOf(t, i)`, the
      **global sorted index**, while rows render in group order — so Up/Down
      currently jumps to whatever row happens to hold the adjacent global
      index. Build a `visibleOrder: readonly string[]` (track ids in actual
      render order, skipping collapsed groups) and have `moveRowFocus` step
      through *that*, keeping the global index only for the displayed row
      number.
- [ ] `ArrowRight` expands the focused row's containing group; `ArrowLeft`
      collapses it and moves focus to that group's header — the same
      "close the current parent" gesture as the tree. Both are no-ops in flat
      mode.
- [ ] Keep the existing `Home` / `End` / `Enter` / `Space` handling.
- [ ] No global arrow-key router: each pane handles its own arrows, so whether
      the sidebar or the list responds follows naturally from what holds focus
      — which is exactly the requested behaviour.
- [ ] Confirm no clash with `useKeyboardShortcuts`: the defaults bind
      `mod+arrow*` only (`src/keybindings/defaults.ts`), never bare arrows.

### 3.3 Dead style sweep

- [ ] Remove `.nav-label` and its `@media (max-width: 900px)` rule — `Titlebar`
      renders icon-only nav items and no element has that class.
- [ ] Re-run the selector audit after commits 1 and 2 land (compare every class
      selector in `src/app/styles/*.css` against the `.tsx` sources, allowing
      for the template-generated `col-${key}` and `placement-${placement}`
      families) and delete whatever the DOM changes in 1.7 orphaned.
- [ ] Remove any rule left pointing at an element that the semantic-HTML
      rewrites in 1.7 replaced.

### 3.4 Docs

- [ ] `CLAUDE.md`: new "Keyboard browsing" section covering the tree pattern and
      the track-list visible-order navigation; update "Track table layout" for
      grouped-mode arrow behaviour; note the `prefer-no-use-effect` warnings.

---

## Verification

Run after each commit:

- [ ] `bun install` — required first, `node_modules/` is absent in this checkout.
- [ ] `bun run typecheck` — clean.
- [ ] `bun run lint` — no errors; only `prefer-no-use-effect` warnings remain.
- [ ] `bun test` — the existing suites under `tests/` pass, notably
      `tests/hooks/`, `tests/data/`, `tests/components/composite/TrackTable.test.tsx`
      and `tests/contexts/LibraryContext.test.tsx`.
- [ ] Add coverage for the new behaviour: a `db-reader` batching test alongside
      `tests/track-schema.test.ts`, a `useLibraryScanner` hydrate-stream test,
      and `FolderTree` arrow-key tests. Coverage thresholds in
      `vitest.config.ts` are 35/30/35/35 — do not regress them.

Manual, via `bun run start`:

- [ ] **Async load** — with a populated library, rows appear progressively at
      startup instead of after one long pause; the window stays responsive
      throughout. Switching tabs does not re-fetch (the cache-first rule).
- [ ] **db-writer fix** — edit a tag, restart, and confirm the edit survived.
      This has been silently failing.
- [ ] **Motion** — promote to now-playing and back: the player slides up and
      down. Toggle the sidebar, switch views, open a dialog and a popover —
      all animate both directions. Re-check at each height tier
      (`normal` / `snug` / `compact` / `mini`) by resizing the window past
      480px and 300px tall.
- [ ] **`prefers-reduced-motion`** — enable it at the OS level and confirm
      everything still works, instantly.
- [ ] **Keyboard** — Tab into the sidebar: one tab stop, Up/Down walks visible
      folders, Right expands then descends, Left collapses then climbs to the
      parent, Home/End jump. Tab into the track list: Up/Down walks rows in
      **render** order with grouping set to album *and* to path (this is the
      bug being fixed), Left/Right collapse/expand the group.
