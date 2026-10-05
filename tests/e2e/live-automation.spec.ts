import { expect, test } from '@playwright/test';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test('hosted owner can save a paused rule and export an authorized report', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_AUTOMATION !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD,
    'Requires explicit opt-in and disposable hosted owner credentials.',
  );
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/automations/new');
  await page
    .getByLabel('Name', { exact: true })
    .fill(`Hosted acceptance ${Date.now()}`);
  await page
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('paused');
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Rule saved. Revision 1.' }),
  ).toBeVisible();
  await page.goto('/dashboard/reports/crm');
  await page
    .getByRole('button', { name: 'Save export snapshot', exact: true })
    .click();
  await expect(page).toHaveURL(/\/reports\/snapshots\//);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^crm-.*\.csv$/);
});
