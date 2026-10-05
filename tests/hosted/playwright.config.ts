import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
if (process.env.ACCEPTANCE_ENVIRONMENT !== 'staging')
  throw new Error('Hosted browser requires staging');
try {
  const id = process.env.ACCEPTANCE_BROWSER_RUN_ID ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error();
  const gate = JSON.parse(
    readFileSync(resolve('.tools/acceptance', id, 'browser-gate.json'), 'utf8'),
  );
  if (
    gate.token !== process.env.ACCEPTANCE_BROWSER_GUARD_TOKEN ||
    gate.projectRef !== process.env.ACCEPTANCE_PROJECT_REF ||
    gate.origins?.[0] !== process.env.PLATFORM_ADMIN_ORIGIN ||
    gate.origins?.[1] !== process.env.BUSINESS_APP_ORIGIN ||
    Date.now() - gate.createdAt > 30 * 60 * 1000
  )
    throw new Error();
} catch {
  throw new Error('Use the verified hosted acceptance runner');
}
export default defineConfig({
  testDir: '../e2e',
  testMatch: 'live-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['./reporter.ts']],
  outputDir: resolve(
    '.tools/acceptance',
    process.env.ACCEPTANCE_BROWSER_RUN_ID!,
    'browser-private',
  ),
  preserveOutput: 'never',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  projects: ['platform-admin', 'business-app'].map((name) => ({
    name,
    use: {
      ...devices['Desktop Chrome'],
      baseURL:
        process.env[
          name === 'platform-admin'
            ? 'PLATFORM_ADMIN_ORIGIN'
            : 'BUSINESS_APP_ORIGIN'
        ],
    },
  })),
});
