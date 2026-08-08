import path from 'node:path'
import { defineConfig } from 'vitest/config'


/**
 * This file lives in config/, so `root` is pinned back to the repository root.
 * Every glob below then stays repo-relative and reads the same as it would if
 * the config still sat at the top level.
 */
const projectRoot = path.resolve(__dirname, '..')

export default defineConfig({
  root: projectRoot,

  test: {
    globals:     true,
    environment: 'jsdom',

    setupFiles: [ './tests/setup.ts' ],
    include:    [ 'tests/**/*.test.{ts,tsx}' ],
    exclude:    [ '**/node_modules/**' ],

    coverage: {
      provider:         'v8',
      reporter:         [ 'text', 'html', [ 'lcov', { file: 'lcov.info' }], [ 'clover', { file: 'clover.xml' }]],
      reportsDirectory: './coverage',
      reportOnFailure:  true,
      include:          [ 'src/**/*.{ts,tsx}' ],
      exclude:          [ 'src/**/*.d.ts', 'tests/**', 'node_modules/**' ],
      thresholds:       {
        statements: 35,
        branches:   30,
        functions:  35,
        lines:      35,
      },
    },
  },
})
