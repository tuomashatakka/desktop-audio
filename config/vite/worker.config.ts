import { defineConfig } from 'vite'


/**
 * Shared config for every Node.js worker entry (scanner, db reader, db writer).
 *
 * **Do not declare `build.lib` here.** Forge's Vite plugin only injects the
 * `entry` from `config/forge.config.ts` when the user config leaves `build.lib`
 * undefined:
 *
 * ```js
 * if (userConfig.build?.lib == null)
 *   config.build.lib = { entry: forgeConfigSelf.entry, fileName: () => '[name].js', formats: ['cjs'] }
 * ```
 *
 * Declaring it opts out of that injection wholesale, and since all three
 * workers share this one file, every one of them compiled whichever entry was
 * pinned here — `db-reader.js` and `db-writer.js` were never emitted at all,
 * which is how hydration and every tag write failed silently. Forge's default
 * is already exactly what a worker wants, so this file only pins externals.
 */
const WORKER_EXTERNALS = [
  'better-sqlite3',
  'node:worker_threads',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:os',
  'node:url',
  'electron',
]

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // music-metadata is NOT external — Vite bundles it into the CJS worker
      // to avoid ESM-in-CJS runtime issues
      external: WORKER_EXTERNALS,
    },
  },
})
