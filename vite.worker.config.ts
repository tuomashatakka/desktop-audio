import { defineConfig } from 'vite'

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry:    'src/scanner-worker.ts',
      formats:  ['cjs'],
      fileName: () => 'scanner-worker.js',
    },
    rollupOptions: {
      external: [
        'better-sqlite3',
        'node:worker_threads',
        'node:fs',
        'node:fs/promises',
        'node:path',
        'node:os',
        'node:url',
        'electron',
      ],
      // music-metadata is NOT external — Vite bundles it into the CJS worker
      // to avoid ESM-in-CJS runtime issues
    },
  },
})
