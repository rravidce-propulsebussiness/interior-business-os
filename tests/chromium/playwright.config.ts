import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /local\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/chromium-local', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @business-os/business-app exec next start --hostname 127.0.0.1 --port 3001',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      // A fresh unsigned anonymous session; never point CI at production Supabase.
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      BUSINESS_OS_TENANT_ROUTES_ENABLED: 'false',
    },
  },
});
