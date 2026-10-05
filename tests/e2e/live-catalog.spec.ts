import { expect, test } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
test.use({ trace: 'off' });
const form = (page: Page, title: string) =>
  page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function save(editor: Locator, title: string) {
  await editor.getByRole('button', { name: title, exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('Saved.');
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business dashboard' }),
  ).toBeVisible();
  await page
    .getByLabel('Active organization')
    .selectOption(
      process.env.E2E_ORG_ID ?? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
  await page.getByRole('button', { name: 'Switch organization' }).click();
}
test('live Owner configures catalog, dependencies, modifiers, price book and preview', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_SUPABASE !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD,
    'Requires confirmed Owner and migrated disposable Supabase project. Creates test configuration.',
  );
  test.setTimeout(180000);
  await signIn(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  const suffix = String(Date.now()),
    itemName = 'E2E Wardrobe ' + suffix,
    categoryName = 'E2E Carpentry ' + suffix;
  await page.goto('/dashboard/catalog');
  await page.getByText('Add category', { exact: true }).click();
  let editor = form(page, 'Create category');
  await editor.getByLabel('Name', { exact: true }).fill(categoryName);
  await editor
    .getByLabel('Stable key', { exact: true })
    .fill('e2e_category_' + suffix);
  await save(editor, 'Create category');
  await page.getByText('Add item', { exact: true }).click();
  editor = form(page, 'Create item');
  await editor.getByLabel('Name', { exact: true }).fill(itemName);
  await editor
    .getByLabel('Stable key', { exact: true })
    .fill('e2e_item_' + suffix);
  await editor
    .getByLabel('Category', { exact: true })
    .selectOption({ label: categoryName });
  await editor.getByLabel('Pricing unit').selectOption('sq_ft');
  await editor.getByLabel('Measurement method').selectOption('width_height');
  await editor
    .getByRole('button', { name: 'Create item', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: itemName, exact: true }),
  ).toBeVisible();
  const itemUrl = page.url();
  async function addQuestion(
    label: string,
    key: string,
    optionLabel: string,
    optionKey: string,
    dependency = false,
  ) {
    await page.getByText('Add question', { exact: true }).click();
    const q = form(page, 'Create question');
    await q.getByLabel('Question label').fill(label);
    await q.getByLabel('Stable key', { exact: true }).fill(key);
    await q.getByLabel('required', { exact: true }).check();
    await q.getByLabel('affects pricing', { exact: true }).check();
    if (dependency) {
      await q
        .getByRole('button', { name: 'Add condition', exact: true })
        .click();
      await q.getByLabel('Show when question').selectOption('finish');
      await q.getByLabel('Condition options').selectOption('pu');
    }
    await save(q, 'Create question');
    await page.reload();
    const summary = page
      .locator('summary')
      .filter({ hasText: new RegExp('^' + label + ' · select') });
    await summary.click();
    const details = summary.locator('..');
    await details.getByText('Add option', { exact: true }).click();
    const o = details.locator('form').filter({
      has: page.getByRole('heading', { name: 'Create option', exact: true }),
    });
    await o.getByLabel('Option label').fill(optionLabel);
    await o.getByLabel('Stable key', { exact: true }).fill(optionKey);
    await save(o, 'Create option');
    await page.reload();
  }
  await addQuestion('Plywood Grade', 'grade', 'BWP', 'bwp');
  await addQuestion('External Finish', 'finish', 'PU', 'pu');
  await addQuestion('Hardware', 'hardware', 'Hettich', 'hettich');
  await addQuestion('PU Finish Type', 'pu_finish', 'Matte', 'matte', true);
  for (const [label, option, value] of [
    ['BWP adjustment', 'Plywood Grade / BWP', '180'],
    ['PU adjustment', 'External Finish / PU', '500'],
    ['Hardware adjustment', 'Hardware / Hettich', '150'],
  ]) {
    await page.getByText('Add modifier', { exact: true }).click();
    editor = form(page, 'Create modifier');
    await editor.getByLabel('Modifier label').fill(label!);
    await editor
      .getByLabel('Applies to option (none = item)')
      .selectOption({ label: option! });
    await editor.getByLabel('Modifier value').fill(value!);
    await save(editor, 'Create modifier');
    await page.reload();
  }
  await page.goto('/dashboard/pricing');
  await page.getByText('Add price book', { exact: true }).click();
  editor = form(page, 'Create price book');
  await editor.getByLabel('Name', { exact: true }).fill('E2E Book ' + suffix);
  await editor
    .getByLabel('Stable key', { exact: true })
    .fill('e2e_book_' + suffix);
  await editor.getByLabel('Currency (ISO code)').fill('INR');
  await editor
    .getByLabel('Effective from (ISO timestamp)', { exact: true })
    .fill('2026-01-01T00:00:00Z');
  await save(editor, 'Create price book');
  await page.goto(itemUrl);
  await page.getByText('Add rate', { exact: true }).click();
  editor = form(page, 'Create rate');
  await editor.getByLabel('Currency (ISO code)').fill('INR');
  await editor.getByLabel('Base selling rate').fill('1550');
  await editor.getByLabel('Minimum selling rate').fill('1350');
  await editor
    .getByLabel('Effective from (ISO timestamp)', { exact: true })
    .fill('2026-01-01T00:00:00Z');
  await save(editor, 'Create rate');
  await page.reload();
  const preview = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Price preview', exact: true }),
  });
  await preview.getByLabel('width', { exact: true }).fill('8');
  await preview.getByLabel('height', { exact: true }).fill('7');
  await preview
    .getByLabel('Price book', { exact: true })
    .selectOption({ label: 'E2E Book ' + suffix + ' (INR)' });
  await preview.getByLabel('Plywood Grade').selectOption('bwp');
  await preview
    .getByLabel('Hardware', { exact: false })
    .selectOption('hettich');
  await expect(preview.getByLabel('PU Finish Type')).toHaveCount(0);
  await preview.getByLabel('External Finish').selectOption('pu');
  await expect(preview.getByLabel('PU Finish Type')).toBeVisible();
  await preview.getByLabel('PU Finish Type').selectOption('matte');
  await preview
    .getByRole('button', { name: 'Calculate price', exact: true })
    .click();
  await expect(preview.getByText('133280 INR', { exact: true })).toBeVisible();
  const response = await page.request.post('/api/pricing/preview', {
    data: {
      organization_id: '00000000-0000-4000-8000-000000000001',
      item_id: itemUrl.split('/').at(-1),
      price_book_id: null,
      branch_id: null,
      currency: 'INR',
      at: '2026-09-29T00:00:00Z',
      measurements: { width: '8', height: '7' },
      answers: {
        grade: 'bwp',
        finish: 'pu',
        hardware: 'hettich',
        pu_finish: 'matte',
      },
    },
  });
  expect(response.status()).toBe(403);
});
test('live read-only Designer cannot open pricing or edit catalog', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_SUPABASE !== 'true' ||
      !process.env.E2E_DESIGNER_EMAIL ||
      !process.env.E2E_DESIGNER_PASSWORD,
    'Requires confirmed seeded Designer credentials.',
  );
  await signIn(
    page,
    process.env.E2E_DESIGNER_EMAIL!,
    process.env.E2E_DESIGNER_PASSWORD!,
  );
  await page.goto('/dashboard/catalog');
  await expect(
    page.getByRole('heading', { name: 'Catalog', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Add item', { exact: true })).toHaveCount(0);
  await page.goto('/dashboard/pricing');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
