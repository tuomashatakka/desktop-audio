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

/** How many of `tracks` live at or under `path`, subfolders included. */
function countUnder (tracks: readonly Track[], path: string): number {
  const prefix = `${path}/`
  let count = 0
  for (const track of tracks)
    if (track.path.startsWith(prefix))
      count++
  return count
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

  return children.map(child =>
    ({
      path:       child.path,
      name:       child.name,
      trackCount: countUnder(tracks, child.path),
    }))
}
