/**
 * Arrow-key roaming for the sidebar folder tree (the WAI-ARIA tree pattern).
 *
 * The tree is one tab stop: exactly one node carries `tabIndex={0}` and the
 * arrows move that focus. Flattening the *visible* nodes — a collapsed node's
 * children are not visible and so are not reachable — turns Up/Down into
 * simple index arithmetic, and gives Left the parent it needs to climb to.
 */
import { useCallback, useMemo, useState } from 'react'
import type { FolderNode } from '../contexts'


/** One visible node, plus where it sits in the tree. */
export interface FlatNode {
  readonly node:       FolderNode
  readonly level:      number
  readonly parentPath: string | null
}

/** Depth-first walk of the nodes a user can currently see. */
export function flattenVisible (
  folders: readonly FolderNode[],
  level = 0,
  parentPath: string | null = null
): FlatNode[] {
  const out: FlatNode[] = []

  for (const node of folders) {
    out.push({ node, level, parentPath })
    if (node.expanded && node.children.length > 0)
      out.push(...flattenVisible(node.children, level + 1, node.path))
  }

  return out
}

interface TreeNavigation {
  readonly visible:     readonly FlatNode[]
  readonly focusedPath: string | null
  readonly setFocused:  (path: string) => void
  readonly onKeyDown:   (event: React.KeyboardEvent) => void
}

interface TreeNavigationOptions {
  readonly folders:  readonly FolderNode[]
  readonly onSelect: (path: string) => void
  readonly onToggle: (path: string) => void
}

/** A key handler; reports whether it consumed the event. */
type KeyHandler = (entry: FlatNode, index: number) => boolean

/** See module docstring. */
export function useTreeNavigation ({ folders, onSelect, onToggle }: TreeNavigationOptions): TreeNavigation {
  const visible = useMemo(() =>
    flattenVisible(folders), [ folders ])

  const [ focusedPath, setFocusedPath ] = useState<string | null>(null)

  const current = focusedPath ?? visible[0]?.node.path ?? null

  /** Moves focus to `path`; reports whether there was anywhere to go. */
  const moveTo = useCallback((path: string | undefined): boolean => {
    if (!path)
      return false

    setFocusedPath(path)

    // The row may not exist yet when a move follows an expand, so defer.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(path)}"]`)
        ?.focus()
    })
    return true
  }, [])

  // Right opens a closed node and descends into an open one. A leaf has
  // nothing to do, which is the pattern's behaviour and not an oversight.
  const openOrDescend = useCallback((entry: FlatNode, next: FlatNode | undefined): boolean => {
    if (entry.node.children.length === 0)
      return false

    if (!entry.node.expanded) {
      onToggle(entry.node.path)
      return true
    }

    return moveTo(next?.node.path)
  }, [ moveTo, onToggle ])

  // Left closes an open node; from a closed one or a leaf it climbs to the
  // parent — "close the current parent" from wherever you happen to be.
  const closeOrClimb = useCallback((entry: FlatNode): boolean => {
    if (entry.node.children.length > 0 && entry.node.expanded) {
      onToggle(entry.node.path)
      return true
    }

    return moveTo(entry.parentPath ?? undefined)
  }, [ moveTo, onToggle ])

  const select = useCallback((entry: FlatNode): boolean => {
    onSelect(entry.node.path)
    return true
  }, [ onSelect ])

  // One handler per key, so no single function carries the whole tree's
  // branching — the switch this replaced tripped the complexity limit.
  const handlers = useMemo<Record<string, KeyHandler>>(() => {
    const pathAt = (index: number) =>
      visible[index]?.node.path

    return {
      'ArrowDown': (_entry, index) =>
        moveTo(pathAt(index + 1)),
      'ArrowUp': (_entry, index) =>
        moveTo(pathAt(index - 1)),
      'ArrowRight': (entry, index) =>
        openOrDescend(entry, visible[index + 1]),
      'ArrowLeft': entry =>
        closeOrClimb(entry),
      'Home': () =>
        moveTo(pathAt(0)),
      'End': () =>
        moveTo(visible.at(-1)?.node.path),
      'Enter': select,
      ' ':     select,
    }
  }, [ visible, moveTo, openOrDescend, closeOrClimb, select ])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    const index = current === null
      ? -1
      : visible.findIndex(entry =>
        entry.node.path === current)

    const entry = index < 0 ? undefined : visible[index]
    if (!entry || !handlers[event.key]?.(entry, index))
      return

    event.preventDefault()
    event.stopPropagation()
  }, [ current, visible, handlers ])

  return { visible, focusedPath: current, setFocused: setFocusedPath, onKeyDown }
}
