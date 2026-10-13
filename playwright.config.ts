import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173/Graphic_app/'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /layout/,
    },
    {
      name: 'webkit-sizes',
      use: { browserName: 'webkit', viewport: { width: 1024, height: 1366 } },
      testMatch: /layout.spec/,
    },
  ],
})
