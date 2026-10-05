import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHostedOrigin } from '../packages/shared/src/runtime.ts';
// Shared by deployed smoke and acceptance. Never return bodies or raw errors.
export const smokeServices = [
  'PLATFORM_ADMIN_ORIGIN',
  'BUSINESS_APP_ORIGIN',
  'WEBSITES_ORIGIN',
];
export async function probeService(origin) {
  if (!isHostedOrigin(origin)) throw new Error('INVALID_SMOKE_ORIGIN');
  const base = new URL(origin),
    rows = [];
  for (const path of ['/', '/api/health', '/api/ready']) {
    const start = Date.now();
    try {
      const response = await fetch(new URL(path, base), {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const headers = [
        'content-security-policy',
        'strict-transport-security',
        'x-content-type-options',
        'referrer-policy',
        'permissions-policy',
      ];
      let ok =
        response.status === 200 &&
        headers.every((header) => Boolean(response.headers.get(header)));
      if (path.startsWith('/api/')) {
        const body = await response.json();
        ok &&= body.status === (path === '/api/health' ? 'alive' : 'ready');
        ok &&= response.headers.get('cache-control')?.includes('no-store');
      }
      rows.push({
        path,
        status: response.status,
        ok,
        durationMs: Date.now() - start,
      });
    } catch {
      rows.push({
        path,
        ok: false,
        errorCode: 'PROBE_FAILED',
        durationMs: Date.now() - start,
      });
    }
  }
  return rows;
}
async function authenticatedSmoke(env) {
  const { chromium, expect } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const origin =
      env[
        env.SMOKE_ACCOUNT_APP === 'platform-admin'
          ? 'PLATFORM_ADMIN_ORIGIN'
          : 'BUSINESS_APP_ORIGIN'
      ];
    await page.goto(`${origin}/login`);
    await page
      .getByLabel('Email', { exact: true })
      .fill(env.SMOKE_ACCOUNT_EMAIL);
    await page
      .getByLabel('Password', { exact: true })
      .fill(env.SMOKE_ACCOUNT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name:
          env.SMOKE_ACCOUNT_APP === 'platform-admin'
            ? 'Platform dashboard'
            : 'Business dashboard',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.goto(`${origin}/dashboard`);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  } finally {
    await browser.close();
  }
}
async function main() {
  const auth = process.argv.includes('--authenticated');
  const missing = smokeServices.filter(
    (name) => !isHostedOrigin(process.env[name]),
  );
  if (
    auth &&
    (!['platform-admin', 'business-app'].includes(
      process.env.SMOKE_ACCOUNT_APP,
    ) ||
      !process.env.SMOKE_ACCOUNT_EMAIL ||
      !process.env.SMOKE_ACCOUNT_PASSWORD)
  )
    missing.push('SMOKE_ACCOUNT_CONFIGURATION');
  if (missing.length) {
    for (const name of missing) console.log(`${name}: BLOCKED`);
    process.exitCode = 2;
    return;
  }
  let failed = false;
  for (const service of smokeServices)
    for (const row of await probeService(process.env[service])) {
      failed ||= !row.ok;
      console.log(JSON.stringify({ service, ...row }));
    }
  if (auth && !failed) {
    try {
      await authenticatedSmoke(process.env);
      console.log('AUTHENTICATED_READ_ONLY_SMOKE: PASS');
    } catch {
      failed = true;
      console.log('AUTHENTICATED_READ_ONLY_SMOKE: FAIL');
    }
  }
  process.exitCode = failed ? 1 : 0;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    console.log('SMOKE_INTERNAL_FAILURE');
    process.exitCode = 1;
  });
