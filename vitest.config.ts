import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',

    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', ['lcov', { file: 'lcov.info' }], ['clover', { file: 'clover.xml' }]],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'tests/**', 'node_modules/**'],
    },
  },
})
