/**
 * Deriving the table's folder rows from the sidebar's folder tree.
 *
 * The tree is already built by the scanner, so browsing "into" a folder is a
 * lookup here rather than a second walk of the library: the rows the table
 * shows above its tracks are exactly the tree node's children.
 */
import type { FolderNode, Track } from '../contexts'


/** One immediate subfolder of the browsed location. */
export interface FolderRow {
  readonly path:       string
  readonly name:       string
  readonly trackCount: number
}

/** Depth-first search for the node at `path`; `null` when it is not in the tree. */
export function findFolder (
  folders: readonly FolderNode[],
  path: string
): FolderNode | null {
  for (const folder of folders) {
    if (folder.path === path)
      return folder

    const found = findFolder(folder.children, path)
    if (found)
      return found
  }

  return null
}

/**
 * How many of `tracks` live at or under each of `paths`, subfolders included.
 *
 * One pass over the library, not one per folder. This used to be a `countUnder`
 * helper called from inside a `.map` over the children, which is
 * O(children × tracks): forty subfolders over a fifty-thousand-track library is
 * two million `startsWith` calls, synchronously, every time the memo in
 * `LibraryView` is invalidated — and selecting a folder invalidates it. That is
 * the freeze.
 *
 * The children are siblings under one parent, so a track belongs to at most one
 * of them: walking the tracks once and bucketing each into the child whose
 * prefix it carries gives the same answer in O(tracks). The map is keyed by the
 * prefix rather than the path so the comparison is the same string operation
 * the old code did, minus the repetition.
 */
function countsUnder (
  tracks: readonly Track[],
  paths: readonly string[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>(paths.map(path =>
    [ path, 0 ]))

  // The separator is part of the prefix, so `/music/rock/` cannot claim a track
  // under `/music/rock-live/` — which is why one `break` per track is safe and
  // no ordering is needed. These are siblings; none of them nests in another.
  const prefixes = paths.map(path =>
    ({ path, prefix: `${path}/` }))

  for (const track of tracks)
    for (const { path, prefix } of prefixes)
      if (track.path.startsWith(prefix)) {
        counts.set(path, (counts.get(path) ?? 0) + 1)
        break
      }

  return counts
}

/**
 * The rows to list above the tracks for the current location.
 *
 * With no folder selected that is the library roots, which is what makes a
 * multi-root library browsable from the top rather than only from the tree.
 * The count is of everything *under* each child, so a folder holding nothing
 * but subfolders still reports what it contains.
 */
export function subfolderRows (
  folders: readonly FolderNode[],
  selectedPath: string | null,
  tracks: readonly Track[]
): readonly FolderRow[] {
  const children = selectedPath === null
    ? folders
    : findFolder(folders, selectedPath)?.children ?? []

  const counts = countsUnder(tracks, children.map(child =>
    child.path))

  return children.map(child =>
    ({
      path:       child.path,
      name:       child.name,
      trackCount: counts.get(child.path) ?? 0,
    }))
}
