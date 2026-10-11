import { expect, test } from '@playwright/test';
test('public Business App home shows guest navigation only to anonymous visitors', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Session-aware public home belongs to the Business App.',
  );
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in to your workspace' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('protected dashboards require authentication', async ({ page }, info) => {
  test.skip(
    info.project.name === 'websites',
    'Public website shell has no admin dashboard.',
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
test('login provides accessible form fields and validation', async ({
  page,
}, info) => {
  test.skip(
    info.project.name === 'websites',
    'Public website shell has no login.',
  );
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Complete all fields',
  );
});
test('direct module API denies anonymous callers', async ({
  request,
}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Module authorization endpoint belongs to business-app.',
  );
  const response = await request.get('/api/modules/website');
  expect(response.status()).toBe(401);
  expect(await response.json()).not.toHaveProperty('enabled');
});
