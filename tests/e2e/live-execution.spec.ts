import { test, expect, type Page } from '@playwright/test';
test.use({ trace: 'off' });
const id = (page: Page) => page.url().split('/').at(-1)!;
async function save(page: Page, entity: string) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/execution/${entity}/[0-9a-f-]{36}$`),
  );
  return id(page);
}
async function selectFirst(page: Page, label: string) {
  const field = page.getByLabel(label, { exact: true });
  const value = await field
    .locator('option')
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value).find(Boolean),
    );
  expect(value).toBeTruthy();
  await field.selectOption(value!);
}
test('live Owner completes material recipe, estimate, two-vendor comparison, split orders and receiving', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_EXECUTION !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      !process.env.E2E_EXECUTION_CONTRACT_ID,
    'Requires hosted Owner credentials, Projects/Vendors/Purchasing and a fresh accepted contract with one physical scope item',
  );
  test.setTimeout(300000);
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Business dashboard' }),
  ).toBeVisible();
  await page
    .getByLabel('Active organization')
    .selectOption(
      process.env.E2E_EXECUTION_ORG_ID ??
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
  await page.getByRole('button', { name: 'Switch organization' }).click();
  const name = 'Execution ' + Date.now(),
    code = 'EXEC-' + Date.now();
  await page.goto('/dashboard/execution/material_categories/new');
  await page.getByLabel('Category name', { exact: true }).fill(name);
  await page.getByLabel('Category code', { exact: true }).fill(code);
  const category = await save(page, 'material_categories');
  await page.goto('/dashboard/execution/materials/new');
  await page.getByLabel('Category', { exact: true }).selectOption(category);
  await page
    .getByLabel('Material name', { exact: true })
    .fill(name + ' Plywood');
  await page.getByLabel('Material code', { exact: true }).fill(code + '-PLY');
  const material = await save(page, 'materials');
  await page.goto('/dashboard/execution/material_variants/new');
  await page.getByLabel('Material', { exact: true }).selectOption(material);
  await page.getByLabel('Variant name', { exact: true }).fill('18 mm ' + name);
  await page.getByLabel('Variant code', { exact: true }).fill(code + '-18');
  const variant = await save(page, 'material_variants');
  await page.goto('/dashboard/execution/material_unit_conversions/new');
  await page
    .getByLabel('Material variant', { exact: true })
    .selectOption(variant);
  await page.getByLabel('Purchase unit (for example sheet)').fill('sheet');
  await page.getByLabel('Consumption unit (for example sqft)').fill('sqft');
  await page.getByLabel('Consumption units per purchase unit').fill('32');
  await page.getByLabel('Conversion source / reason').fill('8 by 4 sheet');
  await save(page, 'material_unit_conversions');
  await page.goto('/dashboard/execution/material_cost_revisions/new');
  await page
    .getByLabel('Material variant', { exact: true })
    .selectOption(variant);
  await page.getByLabel('Unit cost', { exact: true }).fill('100');
  await page.getByLabel('Source / reference').fill('Hosted planning rate');
  await save(page, 'material_cost_revisions');
  await page.goto('/dashboard/execution/estimation_recipes/new');
  await page.getByLabel('Recipe name', { exact: true }).fill(name + ' recipe');
  const recipe = await save(page, 'estimation_recipes');
  await page.goto('/dashboard/execution/estimation_recipe_items/new');
  await page.getByLabel('Recipe', { exact: true }).selectOption(recipe);
  await page
    .getByLabel('Material variant (materials only)')
    .selectOption(variant);
  await page.getByLabel('Component description').fill(name + ' boards');
  await page.getByLabel('Quantity factor').fill('96');
  await save(page, 'estimation_recipe_items');
  await page.goto(
    `/dashboard/execution?contract=${process.env.E2E_EXECUTION_CONTRACT_ID}`,
  );
  await page.getByRole('button', { name: 'Create or open estimate' }).click();
  await expect(page).toHaveURL(/execution_estimate_revisions\/[0-9a-f-]{36}$/);
  const revision = id(page);
  await page
    .locator('a[href*="/execution_estimate_scope_items/"]')
    .first()
    .click();
  await page.getByText('Apply a recipe', { exact: true }).click();
  await page.getByLabel('Recipe', { exact: true }).selectOption(recipe);
  await page
    .getByLabel('Selection reason (required when different from suggestion)')
    .fill('Hosted acceptance recipe');
  await page.getByRole('button', { name: 'Apply recipe', exact: true }).click();
  await expect(page.getByText(name + ' boards', { exact: true })).toBeVisible();
  await page.goto(
    `/dashboard/execution/execution_estimate_revisions/${revision}`,
  );
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(
    page.getByRole('button', { name: 'Approve estimate' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Approve estimate' }).click();
  await expect(
    page.getByRole('button', { name: 'Create revision' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Create requisition from requirements' })
    .click();
  await selectFirst(page, 'Estimated requirement');
  await page.getByLabel('Quantity to requisition').fill('3');
  await page
    .getByLabel('Delivery location', { exact: true })
    .fill('Hosted project site');
  const pr = await save(page, 'purchase_requisitions');
  await page.getByRole('button', { name: 'Submit requisition' }).click();
  await expect(
    page.getByRole('button', { name: 'Approve requisition' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Approve requisition' }).click();
  await expect(page.getByRole('link', { name: 'Create RFQ' })).toBeVisible();
  const vendors: string[] = [];
  for (const suffix of ['A', 'B']) {
    await page.goto('/dashboard/execution/vendors/new');
    await page
      .getByLabel('Vendor name', { exact: true })
      .fill(name + ' supplier ' + suffix);
    await page
      .getByLabel('Vendor code', { exact: true })
      .fill(code + '-' + suffix);
    vendors.push(await save(page, 'vendors'));
  }
  await page.goto(`/dashboard/execution/rfqs/new?requisition=${pr}`);
  await page
    .getByLabel('Invited vendors', { exact: true })
    .selectOption(vendors);
  await selectFirst(page, 'Requisition item');
  await page.getByLabel('Requested quantity', { exact: true }).fill('3');
  const rfq = await save(page, 'rfqs');
  await page.getByRole('button', { name: 'Issue RFQ' }).click();
  await expect(
    page.getByRole('link', { name: 'Enter vendor quote' }),
  ).toBeVisible();
  const quotes: string[] = [];
  for (const [index, vendor] of vendors.entries()) {
    await page.goto(`/dashboard/execution/vendor_quotes/new?rfq=${rfq}`);
    await page.getByLabel('Vendor', { exact: true }).selectOption(vendor);
    await page.getByLabel('Vendor quote reference').fill(code + '-Q' + index);
    await page.getByLabel('Valid until', { exact: true }).fill('2099-01-01');
    await selectFirst(page, 'Requested item');
    await page.getByLabel('Quoted quantity').fill('3');
    await page.getByLabel('Rate per unit').fill(index ? '110' : '100');
    const quote = await save(page, 'vendor_quotes');
    quotes.push(quote);
    await page.getByRole('button', { name: 'Record vendor quote' }).click();
    await expect(
      page.getByRole('link', { name: 'Create purchase order / split award' }),
    ).toBeVisible();
  }
  await page.goto(`/dashboard/execution/rfqs/${rfq}`);
  await expect(
    page.getByRole('heading', { name: 'Vendor comparison' }),
  ).toBeVisible();
  await expect(
    page.getByText('No ranking or automatic award.', { exact: false }),
  ).toBeVisible();
  const orders: string[] = [];
  for (const [index, quote] of quotes.entries()) {
    await page.goto(`/dashboard/execution/purchase_orders/new?quote=${quote}`);
    await selectFirst(page, 'Quoted item to award');
    await page.getByLabel('Award quantity').fill(index ? '2' : '1');
    orders.push(await save(page, 'purchase_orders'));
    await page.getByRole('button', { name: 'Issue purchase order' }).click();
    await expect(
      page.getByRole('link', { name: 'Receive goods / services' }),
    ).toBeVisible();
  }
  for (const [index, po] of orders.entries()) {
    await page.goto(`/dashboard/execution/goods_receipts/new?po=${po}`);
    await selectFirst(page, 'Ordered item');
    await page
      .getByLabel('Receiving now', { exact: true })
      .fill(index ? '2' : '1');
    await page.getByLabel('Accepted', { exact: true }).fill(index ? '2' : '1');
    await save(page, 'goods_receipts');
    await expect(
      page.getByRole('link', { name: 'Download PDF' }),
    ).toBeVisible();
  }
  await page.goto(`/dashboard/execution/purchase_orders/${orders[0]}`);
  const scopeLink = await page
    .getByRole('link', { name: 'Contract scope' })
    .getAttribute('href');
  const project = new URL(scopeLink!, 'http://localhost').searchParams.get(
    'project',
  );
  await page.goto(`/dashboard/execution/costs?project=${project}`);
  await expect(
    page.getByRole('heading', { name: 'Project Cost Summary' }),
  ).toBeVisible();
  await expect(
    page.getByText('Committed — issued PO value', { exact: true }),
  ).toBeVisible();
});
