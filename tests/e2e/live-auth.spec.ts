import { expect, test } from '@playwright/test';
test.use({ trace: 'off' });
test('live confirmed Owner can sign in and inspect tenant membership', async ({
  page,
}, info) => {
  test.skip(
    process.env.E2E_LIVE_SUPABASE !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      info.project.name === 'websites',
    'Requires an explicitly configured disposable Supabase project and confirmed seed account.',
  );
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (info.project.name === 'platform-admin') {
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    return;
  }
  await expect(
    page.getByRole('heading', { name: 'Business dashboard' }),
  ).toBeVisible();
  await page
    .getByLabel('Active organization')
    .selectOption('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  await page.getByRole('button', { name: 'Switch organization' }).click();
  await expect(
    page.getByRole('heading', { name: 'Demo Interiors', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Enabled modules' })
      .getByRole('link', { name: 'Website', exact: true }),
  ).toHaveCount(0);
  const denied = await page.request.get('/api/modules/website');
  expect(denied.status()).toBe(403);
  await page.goto('/dashboard/modules/website');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
