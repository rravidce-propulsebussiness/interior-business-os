import { test, expect } from '@playwright/test';

const origin = 'https://sghomesinterior.in';

test('public site serves real Next.js pages rather than a 503', async ({ page }) => {
  const response = await page.goto(origin + '/__hostinger_diag/next', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  console.log('LIVE_DIAGNOSTIC_STATUS=' + (response?.status() ?? 'NO_RESPONSE'));
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Next.js renderer: OK' }))
    .toBeVisible();
});

test('production health endpoint responds', async ({ request }) => {
  const response = await request.get(origin + '/api/health', { timeout: 20000 });
  console.log('LIVE_HEALTH_STATUS=' + response.status());
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'alive' });
});
