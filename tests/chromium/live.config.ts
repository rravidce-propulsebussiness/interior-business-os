import { defineConfig, devices } from '@playwright/test';

// This separate, unauthenticated diagnostic never uses company session cookies.
export default defineConfig({
  testDir: '.',
  testMatch: /live\.spec\.ts/,
  timeout: 30000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/chromium-live', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
});
