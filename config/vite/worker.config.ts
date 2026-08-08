import { defineConfig } from 'vite'


/**
 * Shared config for every Node.js worker entry (scanner, db reader, db writer).
 *
 * `fileName` is derived from the entry rather than hardcoded, so one config
 * serves all of them — `main.ts` spawns each by `<name>.js` next to itself.
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
    lib: {
      entry:    'src/scanner-worker.ts',
      formats:  [ 'cjs' ],
      fileName: (_format, entryName) =>
        `${entryName}.js`,
    },
    rollupOptions: {
      // music-metadata is NOT external — Vite bundles it into the CJS worker
      // to avoid ESM-in-CJS runtime issues
      external: WORKER_EXTERNALS,
    },
  },
})
