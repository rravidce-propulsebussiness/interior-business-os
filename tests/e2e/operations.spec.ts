import { expect, test } from '@playwright/test';

test('physical execution routes require an authenticated session', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'business-app', 'Business app only');
  for (const path of [
    '',
    '/project_tasks',
    '/inventory_transactions',
    '/stock',
    '/project_inspections',
    '/project_snags',
    '/handover_records',
    '/inventory_lot_costs',
  ]) {
    await page.goto('/dashboard/operations' + path);
    await expect(page).toHaveURL(/\/login$/);
  }
});
