# Fix: invisible startup window, worker listener storm, stale library roots

## Context

Three defects, all in the main process and the data layer, all observable in one
startup session:

1. **Every second launch shows no window at all.** The main window is
   `frame: false`, `transparent: true` and painted `#00000000`, so a window that
   never shows is indistinguishable from a process that never started. This
   failure mode is invisible by construction, which is why it keeps coming back
   in new disguises — `CLAUDE.md` already documents one predecessor (the
   IPv4/IPv6 dev-server mismatch, fixed by `server: { host: '::' }`).
2. **`MaxListenersExceededWarning` on startup** — eleven `message` and eleven
   `error` listeners on a `Worker`, repeatedly. Cosmetic today, but it is
   precisely the warning that would announce a real leak later, and it currently
   fires so often that a genuine one would be lost in it.
3. **Removing a library folder in Settings does not remove its tracks.** The
   rows stay in SQLite forever and re-hydrate on every launch, so the library
   keeps showing files from folders the user explicitly de-registered.

**Decisions taken with the user:** removing a root **deletes** its rows
permanently (the DB stops growing; re-adding costs a rescan), and a second
launch **surfaces the window of the instance that already owns the profile**
rather than killing it.

---

## 1 · The window that does not appear

### Root cause

`src/main.ts:31-39` requests the single-instance lock and, on failure, calls
`app.quit()` — with **no `return`, no `else`, and no `app.exit()`**:

```ts
const gotInstanceLock = app.requestSingleInstanceLock()

if (!gotInstanceLock) {
  console.error('◬ [main] another desktop-audio instance already owns this profile — exiting. …')
  app.quit()
}
```

Execution falls straight through. The losing instance still registers
`app.on('ready')` (`main.ts:208`) and every `ipcMain` handler, and `app.quit()`
is asynchronous *and* issued before the app has ever reached `ready` — so
whether that instance briefly creates a window, or is torn down first, is a
race. Either way the user gets no usable window.

The collision itself is fed by orphans: Forge's SIGINT handler exits without
killing its Electron child and `main.ts` installs no signal handler of its own,
so a `Ctrl-C`'d dev session can leave a live process holding the profile lock.

On top of that, the window is shown from exactly one event —
`win.once('ready-to-show', …)` at `main.ts:128` — with no fallback. A
transparent frameless window whose `ready-to-show` does not arrive stays
invisible forever, with the process alive and healthy behind it.

### Changes — all in `src/main.ts`

Because the exact mechanism is timing-dependent, the fix closes every path that
can end in "no window", rather than betting on one:

- **Guard the bootstrap on the lock.** Keep `gotInstanceLock`, switch the
  failure branch to `app.exit(0)` (immediate, unlike `app.quit()`), and wrap the
  `app.on('ready', …)` registration in `if (gotInstanceLock)`. A two-line guard,
  no restructuring — the losing instance can no longer half-start.
- **Make showing the window idempotent and multi-sourced.** Add
  `showMainWindow(win)` that no-ops on an already-visible or destroyed window,
  and call it from `ready-to-show`, from `webContents.once('did-finish-load')`,
  and from a `SHOW_FALLBACK_MS` timer (~4 s, cleared once shown). Log which path
  won, so the next occurrence is diagnosable instead of silent. This is what
  makes an unreliable `ready-to-show` survivable.
- **Make `second-instance` actually surface something** (`main.ts:218-225`
  currently only `restore()` + `focus()`, and no-ops entirely when `mainWindow`
  is `null`):

  ```ts
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed())
      createWindow()
    else {
      if (mainWindow.isMinimized())
        mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
    app.focus({ steal: true })
  })
  ```

- **Stop producing orphans at the source.** Register
  `process.on('SIGINT' | 'SIGTERM' | 'SIGHUP')` → `app.quit()`, so `Ctrl-C` on
  `bun run start` tears the Electron child down instead of detaching it. This
  removes the precondition for the whole collision.

---

## 2 · The listener storm

### Root cause

`getWorker(name)` (`main.ts:339-380`) caches **one** `Worker` per name for the
process lifetime. All three request helpers then attach a fresh listener pair to
that shared instance per request and detach it when *that* request settles:

- `streamFromWorker` — `main.ts:474-475`
- `requestArtwork` — `main.ts:557-558`
- `requestWrite` — `main.ts:700-701`

The `off()` calls are correct; the problem is concurrency. When the hydrated
list first paints, ~40 rows mount an `AlbumArt` → `useArtwork` → one
`library:artwork` invoke each. `useArtwork` already dedupes by `size:trackId`
(`src/app/hooks/useArtwork.ts:56-67`), so these are 40 *distinct* tracks: 80
listeners land on the one `db-reader` worker before the first reply detaches
any. Node's default cap is 10.

### Change — `src/main.ts`

Replace per-request subscription with **one router per worker**, registered once
at spawn. Store `{ worker, pending }` in the `workers` map, where `pending` is a
`Map<number, { onMessage, onError }>` keyed by the request `id` the workers
already echo:

```ts
worker.on('message', (msg: WorkerMessage) =>
  pending.get(msg.id)?.onMessage(msg))
```

The `error` and `exit` listeners fail every entry in `pending` and clear it.
Request helpers change from `worker.on(...)` / `worker.off(...)` to
`pending.set(id, …)` / `pending.delete(id)` — the surrounding logic is
untouched, so `streamFromWorker` keeps its many-`batch`-then-terminal shape and
the two promise helpers keep their single-terminal shape.

Listener count per worker becomes a constant 3, whatever the traffic.

**Bonus this buys:** a worker that dies mid-flight currently strands every
pending promise and every renderer spinner. Failing `pending` from `exit` closes
that hole — the same class of bug the `done`-on-spawn-failure guard already
addresses.

*Not doing:* `setMaxListeners` — it silences the symptom and keeps the leak
shape. Also noting but **not** changing `db-reader.ts:139` opening and closing
SQLite per artwork request (~40 opens during hydrate): the per-request open is
deliberate (its docstring explains the stale-WAL-snapshot reasoning), and the
listener fix is what was actually reported.

---

## 3 · Removing a library root

### Root cause

Four independent gaps, all needed for the bug:

- `removeLibraryPath` (`src/app/contexts/SettingsContext.tsx:247-254`) only
  filters the array. Nothing observes the removal.
- The scanner's prune (`src/scanner-worker.ts:350-358`) deletes stale rows
  **only within the `dirPaths` it was handed**. A removed root is no longer in
  that list, so its rows are never touched again.
- The hydrate query (`src/db-reader.ts:30-31`) is unfiltered, so those orphans
  come back on every launch.
- The auto-rescan (`src/app/hooks/useLibraryScanner.ts:272-280`) is keyed on the
  joined path list and guarded by `if (!key || key === lastScannedKey) return` —
  so removing the **last** root fires no scan, and therefore not even the
  in-memory prune runs.

### The hazard this design has to avoid

`SettingsContext` hydrates asynchronously (`SettingsContext.tsx:220-237`, awaits
`loadSettings()` and possibly `host.getMusicDir()`). Before it resolves,
`libraryPaths` is `defaultSettings.libraryPaths` (`[DEFAULT_MUSIC_DIR]`), and
`loadSettings()` returns `libraryPaths: []` on a fresh install
(`SettingsContext.tsx:382`). **A "delete everything outside the current roots"
operation that races hydration would wipe the entire library.**

The design therefore never expresses the delete that way. `forgetRoots` takes
the roots being **removed** and deletes only inside them. An empty or
not-yet-hydrated path list produces an empty removal set, which deletes nothing.
Safety is structural, not a flag someone can forget to check.

### Changes

**`src/track-schema.ts`** — export the scope predicate the scanner already
open-codes at line 355, so one place owns it:

```ts
/** `(path = ? OR path LIKE ? || '/%')` per root, OR-ed. Params are interleaved. */
export function rootScopeClause (roots: readonly string[]): { sql: string; params: string[] }
```

Refactor `scanner-worker.ts:350-358` onto it.

**`src/db-writer.ts`** — new message `{ type: 'forget-roots'; roots: string[]; id }`
running `DELETE FROM tracks WHERE ${rootScopeClause(roots).sql}`, a no-op on an
empty `roots`. Reuses the existing `idx_tracks_path` index.

**`src/main.ts`** — `ipcMain.handle('library:forget-roots', …)` → `requestWrite`.

**`src/preload.ts`** — `forgetRoots: (roots: string[]) => ipcRenderer.invoke('library:forget-roots', roots)`.

**`src/app/data/DataSource.ts`** — add to the interface:

```ts
/** Discard every persisted track under `roots`. Called when a root is removed. */
readonly forgetRoots: (roots: readonly string[]) => Promise<void>
```

Implement in `IpcDataSource.ts` (delegate to the bridge) and in
`WebFsDataSource.ts` (delete the matching IndexedDB records) so the browser
build keeps parity.

**`src/app/hooks/useLibraryScanner.ts`** — the whole reaction lives in the
existing roots effect, which already re-runs on any `libraryPaths` change.
Replace the module-level `lastScannedKey: string | null` (line 81) with
`lastRoots: readonly string[] | null` and diff instead of comparing:

- `removed = lastRoots.filter(r => !roots.includes(r))` — `null` on first run,
  so **hydration can never trigger a delete**.
- When `removed` is non-empty: drop every `trackCache` entry whose `path` is
  under one of them, `publishNow()`, `publishFolders()`, and
  `void data.forgetRoots(removed)`.
- Then scan if any roots remain; if none do, skip the scan but still publish, so
  the list and the tree empty out.

**`publishFolders` needs a small correction** (`useLibraryScanner.ts:157-163`):
it early-returns when there are no paths, which would leave a stale sidebar tree
after the last root is removed. It should `setFolders([])` in that case instead.

`SettingsContext.removeLibraryPath` stays exactly as it is — settings has no
business knowing about the library, and the effect diff is what couples them.

### Rows orphaned by removals in *past* sessions

The diff above only sees in-session removals, so rows left behind before this
fix would persist. Handle them as a one-time reconciliation, **explicitly gated
so it cannot race hydration**: expose a `ready: boolean` from `SettingsContext`
(set in `hydrate`), gate `data.load()` on it, and once `hydrate-done` arrives
with `ready === true`, drop cached tracks that fall outside the known-good roots
and `forgetRoots` their prefixes. Gating `data.load()` on `ready` is correct
regardless — today the hydrate can fire before the roots are known, and
`publishFolders` builds the tree from `libraryPathsRef.current`, which may still
hold the pre-hydration default.

---

## Order of work

1. `src/main.ts` — window lifecycle (§1). Independent, verifiable on its own.
2. `src/main.ts` — worker router (§2). Same file, unrelated region.
3. `track-schema.ts` → `db-writer.ts` → `main.ts` → `preload.ts` →
   `DataSource.ts` → `IpcDataSource.ts` / `WebFsDataSource.ts` →
   `useLibraryScanner.ts` → `SettingsContext.ts` (§3), bottom-up so the types
   land before the callers.

Prefer a scripted edit pass over hand-editing each file, per the repo's
token-efficiency rule.

## Verification

```bash
bun run typecheck && bun run lint && bun run test    # lint must stay at zero
```

Then, in the running app (`bun run start`):

- **§1** — start, quit, start again, at least six times; the window must appear
  every time. Then `Ctrl-C` mid-session and start again — the previous failure
  mode. Launch a second copy while one runs: the existing window must come to
  the front and the new process must exit with the lock message. Confirm the log
  names which path showed the window.
- **§2** — start with the ~10k-track library and watch the console through
  hydrate: **no `MaxListenersExceededWarning`**, and
  `✓ db-reader done — … tracks in … batches` still reports the same counts.
  Artwork must still populate in the list, the player and the tag editor.
- **§3** — with two roots configured, remove one: its tracks and its sidebar
  branch disappear immediately, without a rescan. Restart — they must not come
  back. Then remove the *last* root: the library empties and shows the
  empty-state card. Re-add a folder and confirm it rescans and repopulates.
  Optionally confirm the row count actually dropped:
  `sqlite3 "$HOME/Library/Application Support/desktop-audio/library.db" 'select count(*) from tracks'`

Add unit coverage under `tests/` for the two pure pieces — `rootScopeClause`
(scoping, escaping, empty input) and the roots-diff that decides what gets
forgotten — since both are pure functions and both are where a mistake is
expensive.
