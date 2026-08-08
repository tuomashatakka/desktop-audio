import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'


/** This file lives in config/playwright/, two levels below the repo root. */
const projectRoot = path.resolve(__dirname, '..', '..')

export default defineConfig({
  testDir: path.join(projectRoot, 'tests'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  outputDir: path.join(projectRoot, 'test-results'),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  testMatch: /screenshots\.spec\.ts/,
})
