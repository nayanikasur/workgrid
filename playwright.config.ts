import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real API and a seeded database:
 *   pnpm seed && pnpm e2e
 * Set PW_CHANNEL=msedge (or chrome) to use an installed browser instead of
 * downloading Playwright's Chromium.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } }],
  webServer: [
    { command: 'pnpm dev:api', url: 'http://localhost:4000/api/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'pnpm dev:web', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
