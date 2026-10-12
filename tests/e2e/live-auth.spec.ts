import { expect, test } from '@playwright/test';
test.use({ trace: 'off' });
test('verified session auto-redirects home to owner workspace and sign-out restores public home', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_SUPABASE !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD,
    'Requires a disposable confirmed Business App account and live Supabase test setup.',
  );
  const clientErrors: string[] = [];
  page.on('pageerror', (error) => clientErrors.push(error.message));
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(?:[^/?#]+\/)?(?:dashboard|admin)(?:\/|$)/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/(?:[^/?#]+\/)?dashboard(?:\/|$)/);
  await expect(
    page.getByRole('heading', { name: /Welcome back,/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toHaveCount(0);
  expect(
    clientErrors.filter((message) =>
      /Connection closed|error #412/.test(message),
    ),
  ).toEqual([]);
  await page.locator('.owner-profile summary').click();
  await page
    .locator('.owner-profile-menu')
    .getByRole('button', { name: 'Sign out' })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Run your business/i }),
  ).toBeVisible();
});

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
    page.getByRole('heading', { name: /Welcome back,/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: "Your company's modules" }),
  ).toBeVisible();
  await expect(page.locator('.owner-company-card')).toHaveCount(1);
  // Owner workspace is for one company; never show Super Admin organization directory.
  await expect(
    page.getByRole('heading', { name: 'Organizations' }),
  ).toHaveCount(0);
  const denied = await page.request.get('/api/modules/website');
  expect(denied.status()).toBe(403);
  await page.goto('/dashboard/modules/website');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
