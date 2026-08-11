/**
 * Library-root scoping, renderer side.
 *
 * The mirror of `rootScopeClause` in `track-schema.ts`: the SQL decides which
 * *rows* a root owns, this decides which cached tracks it owns. They have to
 * agree, or a removal empties the database without emptying the screen.
 */

/** A root owns itself and everything beneath it — never a sibling with a shared prefix. */
export function isUnderRoot (path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

/** True when `path` falls under any of `roots`. Vacuously false for none. */
export function isUnderRoots (path: string, roots: readonly string[]): boolean {
  return roots.some(root =>
    isUnderRoot(path, root))
}

/**
 * The roots that were configured before and are not any more.
 *
 * `null` means "nothing known yet" — the first run, before settings have
 * hydrated — and yields no removals. That is what keeps an async settings load
 * from ever being mistaken for the user deleting every folder they had.
 */
export function removedRoots (
  previous: readonly string[] | null,
  current: readonly string[]
): string[] {
  if (!previous)
    return []
  return previous.filter(root =>
    !current.includes(root))
}
