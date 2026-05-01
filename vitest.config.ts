import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',

    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**'],
  },
  coverage: {
    provider: 'v8',
    reporter: ['lcov', 'text', 'html'],
    reportsDirectory: './coverage',
  },
})
