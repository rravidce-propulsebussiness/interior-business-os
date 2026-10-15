import { test, expect } from '@playwright/test';

test('Next.js starts and responds to health requests', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'alive' });
});

test('login form renders in Chromium without hydration errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Complete all fields');
  expect(errors).toEqual([]);
});

test('anonymous user cannot open lead history or protected quotation preview', async ({ page, request }) => {
  await page.goto('/dashboard/crm/leads/00000000-0000-4000-8000-000000000001');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  const preview = await request.get(
    '/dashboard/quotations/00000000-0000-4000-8000-000000000001/preview',
  );
  expect([401, 403]).toContain(preview.status());
  expect(await preview.text()).not.toMatch(/internal_cost|organization_id/);
});
