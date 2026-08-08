import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'


/** This file lives in config/playwright/, two levels below the repo root. */
const projectRoot = path.resolve(__dirname, '..', '..')

export default defineConfig({
  testDir: path.join(projectRoot, 'tests'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  outputDir: path.join(projectRoot, 'test-results'),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  testMatch: /.*\.test\.ts/,
})
