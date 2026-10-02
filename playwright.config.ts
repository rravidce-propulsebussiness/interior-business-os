import { defineConfig, devices } from '@playwright/test';
const apps = [
  { name: 'platform-admin', port: 3000 },
  { name: 'business-app', port: 3001 },
  { name: 'websites', port: 3002 },
];
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: apps.map((app) => ({
    name: app.name,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: 'http://127.0.0.1:' + app.port,
    },
  })),
  webServer: apps.map((app) => ({
    command: 'pnpm --filter @business-os/' + app.name + ' start',
    url: 'http://127.0.0.1:' + app.port,
    reuseExistingServer: false,
    timeout: 120000,
  })),
});
