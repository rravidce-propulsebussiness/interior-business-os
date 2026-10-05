import { defineConfig } from '@playwright/test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const offset = Number(process.env.E2E_RECOVERY_PORT_OFFSET ?? 0);
const port = 3135 + offset;
const token = process.env.RECOVERY_FIXTURE_TOKEN;
if (!token)
  throw new Error('Run pnpm test:recovery through its isolated test runner');
const apps = [
  { name: 'platform-admin', port: 3130 + offset },
  { name: 'business-app', port: 3131 + offset },
];
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: apps.map((app) => ({
    name: app.name,
    use: { baseURL: `http://127.0.0.1:${app.port}` },
  })),
  webServer: [
    {
      command: 'node tests/recovery/provider.mjs',
      cwd,
      url: `http://127.0.0.1:${port}/health`,
      env: {
        APP_ENV: 'development',
        RECOVERY_FIXTURE_TOKEN: token,
        RECOVERY_FIXTURE_PORT: String(port),
      },
      reuseExistingServer: false,
    },
    ...apps.map((app) => ({
      command: `node scripts/start-service.mjs ${app.name} --hostname 127.0.0.1 --port ${app.port}`,
      cwd,
      url: `http://127.0.0.1:${app.port}/api/health`,
      env: {
        APP_ENV: 'development',
        E2E_RECOVERY_BUILD: 'true',
        APP_ORIGIN: `http://127.0.0.1:${app.port}`,
        AUTH_RECOVERY_SIGNING_KEY: createHash('sha256')
          .update(`${token}:${app.name}`)
          .digest('hex'),
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          'sb_publishable_local_recovery_fixture',
      },
      reuseExistingServer: false,
      timeout: 120000,
    })),
  ],
});
