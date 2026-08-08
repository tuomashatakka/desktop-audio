/** Base-36 alphabet of `Number#toString(36)` — digits plus lowercase letters. */
const ID_RADIX = 36

/** `0.` is dropped from the front, then this many characters are kept. */
const ID_PREFIX_LENGTH = 2
const ID_LENGTH        = 9

/**
 * A short, collision-tolerant id for things that only exist in the renderer —
 * folder nodes and playlists. Persisted rows get their id from the scanner
 * instead, which derives it from the file path.
 */
export function generateId (): string {
  return Math.random().toString(ID_RADIX)
    .slice(ID_PREFIX_LENGTH, ID_PREFIX_LENGTH + ID_LENGTH)
}
