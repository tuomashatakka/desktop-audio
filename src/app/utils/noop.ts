/**
 * Explicit do-nothing callback.
 *
 * Used where an API demands a function but there is genuinely nothing to do —
 * most often an unsubscribe handle for a subscription that was never made
 * (see the no-op host implementations in `data/`).
 *
 * Named rather than written inline as `() => {}` so the intent reads as
 * deliberate instead of looking like an unfinished body.
 */
export function noop (): void {
  // Intentionally empty.
}
