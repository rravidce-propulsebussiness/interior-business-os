import { expect, test } from '@playwright/test';
test('catalog and pricing require authentication including direct preview API', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app',
    'Catalog belongs to business-app.',
  );
  for (const path of [
    '/dashboard/catalog',
    '/dashboard/pricing',
    '/dashboard/catalog/00000000-0000-4000-8000-000000000001',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  const response = await page.request.post('/api/pricing/preview', {
    data: {
      organization_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      item_id: '00000000-0000-4000-8000-000000000001',
      price_book_id: null,
      branch_id: null,
      currency: 'INR',
      at: '2026-09-29T00:00:00Z',
      measurements: { width: '8', height: '7' },
      answers: {},
    },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
});
