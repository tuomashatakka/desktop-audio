# Plan: Fix remaining `bun test` failures

## Context

`bun run test` (vitest) passes 48/48. The user also wants `bun test` (bun's native runner) to
pass. A two-file preload was added (`bun-dom-setup.ts` + `bun-preload.ts`) that brought passes
from 0 → 37/48. Two failure classes remain:

1. **AudioContext (3 tests)** — `Audio is not defined`
   jsdom provides `HTMLAudioElement` but does NOT expose the `window.Audio` shorthand constructor.
   A fix was started: `bun-dom-setup.ts` now assigns `g.Audio = dom.window.HTMLAudioElement`.
   Needs verification.

2. **SettingsContext (8 tests)** — `vi.stubGlobal is not a function`
   The test imports `vi` directly from `'vitest'`. `mock.module('vitest', ...)` (bun preload #2)
   is supposed to redirect these imports to bun's `vi`, but bun's static-import hoisting means
   the mock hasn't taken effect when the module graph is resolved. Solution: import vitest's `vi`
   in the preload and **mutate it in-place** — since ES modules are cached singletons, any test
   that imports `vi from 'vitest'` will see the patched object.

## Critical files

- `tests/bun-dom-setup.ts` — preload #1: jsdom DOM globals (Audio fix already applied)
- `tests/bun-preload.ts` — preload #2: mocks, matchers, vitest compat

## Implementation

### Fix 1 — Audio already applied
`bun-dom-setup.ts` last line of Object.assign:
```ts
Audio: dom.window.HTMLAudioElement ?? function Audio () {},
```
Already committed to the file.

### Fix 2 — Patch vitest's vi in-place (`tests/bun-preload.ts`)

Add after the existing imports:
```ts
import { vi as vitestVi } from 'vitest'
```

Then after the jest-dom matchers block, add:
```ts
// Polyfill vi.stubGlobal / vi.unstubAllGlobals on vitest's vi object.
// When bun is the runner, vitest's vi lacks these (runner not initialised).
// Mutating the cached module singleton means all test imports see the patch.
if (typeof (vitestVi as Record<string, unknown>).stubGlobal !== 'function') {
  const stubs = new Map<string, unknown>()
  Object.assign(vitestVi, {
    stubGlobal (name: string, val: unknown) {
      const g = globalThis as Record<string, unknown>
      if (!stubs.has(name)) stubs.set(name, g[name])
      g[name] = val
    },
    unstubAllGlobals () {
      const g = globalThis as Record<string, unknown>
      for (const [name, orig] of stubs) g[name] = orig
      stubs.clear()
    },
  })
}
```

Also remove the now-unnecessary `mock.module('vitest', ...)` block (it doesn't fire in time anyway).

## Verification

```bash
bun test          # should show 48 pass, 0 fail
bun run test      # must still show 48 pass, 0 fail (no regression)
```
