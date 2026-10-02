import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
test.use({ trace: 'off' });
async function login(page: Page, email: string, password: string) {
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
      process.env.E2E_FINANCE_ORG_ID ?? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
  await page.getByRole('button', { name: 'Switch organization' }).click();
}
test('live Owner completes contract, schedule, invoice, partial/full payments, receipt and variation', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_FINANCE !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      !process.env.E2E_ACCEPTED_REVISION_ID,
    'Requires hosted finance acceptance credentials and a fresh accepted revision worth at least 100',
  );
  test.setTimeout(180000);
  await login(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  await page.goto(
    `/dashboard/finance/contracts/new?revision_id=${process.env.E2E_ACCEPTED_REVISION_ID}`,
  );
  await page
    .getByRole('button', { name: 'Save draft / configuration' })
    .click();
  await expect(page).toHaveURL(/finance\/contracts\/[0-9a-f-]{36}$/);
  const contract = page.url().split('/').at(-1)!;
  await page.goto(
    `/dashboard/finance/payment_schedules/new?contract_id=${contract}`,
  );
  await page
    .getByRole('button', { name: 'Save draft / configuration' })
    .click();
  await expect(page).toHaveURL(/payment_schedules\/[0-9a-f-]{36}$/);
  await page
    .getByRole('button', { name: 'Activate and freeze schedule' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Issue payment request' }).first(),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Issue payment request' })
    .first()
    .click();
  await expect(page).toHaveURL(/payment_requests\/[0-9a-f-]{36}$/);
  await page.goto(`/dashboard/finance/invoices/new?contract_id=${contract}`);
  await page.getByLabel('Source', { exact: true }).selectOption('manual');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Hosted finance acceptance invoice');
  await page
    .getByLabel('Unit rate (custom lines)', { exact: false })
    .fill('100');
  await page
    .getByRole('button', { name: 'Save draft / configuration' })
    .click();
  await expect(page).toHaveURL(/invoices\/[0-9a-f-]{36}$/);
  const invoice = page.url().split('/').at(-1)!;
  await page.getByRole('button', { name: 'Issue and freeze invoice' }).click();
  await expect(
    page.getByText('Outstanding invoice balance: 100', { exact: true }),
  ).toBeVisible();
  for (const [amount, balance] of [
    ['40', '60'],
    ['60', '0'],
  ]) {
    await page.goto(`/dashboard/finance/payments/new?contract_id=${contract}`);
    await page.getByLabel('Amount received', { exact: true }).fill(amount!);
    await page.getByRole('button', { name: 'Add allocation' }).click();
    await page.getByLabel('Allocate to invoice').selectOption(invoice);
    await page.getByLabel('Allocated amount', { exact: true }).fill(amount!);
    await page
      .getByRole('button', { name: 'Record payment and receipt' })
      .click();
    await expect(page).toHaveURL(/payments\/[0-9a-f-]{36}$/);
    await expect(
      page.getByText('Unallocated advance: 0', { exact: true }),
    ).toBeVisible();
    await page.goto(`/dashboard/finance/invoices/${invoice}`);
    await expect(
      page.getByText(`Outstanding invoice balance: ${balance}`, {
        exact: true,
      }),
    ).toBeVisible();
  }
  const pdf = await page.request.get(
    `/dashboard/finance/invoices/${invoice}/pdf`,
  );
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.goto(
    `/dashboard/finance/change_orders/new?contract_id=${contract}`,
  );
  await page
    .getByLabel('Change reason', { exact: true })
    .fill('Customer approved extra shelf');
  await page.getByLabel('Scope description').fill('Extra shelf');
  await page.getByLabel('Line reason').fill('Customer request');
  await page.getByLabel('New unit rate', { exact: true }).fill('50');
  await page
    .getByRole('button', { name: 'Save draft / configuration' })
    .click();
  await expect(page).toHaveURL(/change_orders\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Issue change order' }).click();
  await page
    .getByLabel('Customer approval evidence / reference')
    .fill('Signed acceptance fixture');
  await page.getByRole('button', { name: 'Record customer approval' }).click();
  await expect(
    page.getByRole('button', { name: 'Record customer approval' }),
  ).toHaveCount(0);
});
test('live Sales cannot read finance lists or documents', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_FINANCE !== 'true' ||
      !process.env.E2E_SALES_EMAIL ||
      !process.env.E2E_SALES_PASSWORD,
    'Requires hosted Sales acceptance credentials',
  );
  await login(
    page,
    process.env.E2E_SALES_EMAIL!,
    process.env.E2E_SALES_PASSWORD!,
  );
  for (const entity of [
    'contracts',
    'invoices',
    'payments',
    'receipts',
    'change_orders',
  ]) {
    const r = await page.request.get('/api/finance/' + entity);
    expect(r.status()).toBe(403);
    expect(await r.text()).not.toMatch(
      /original_contract_value|payment_instructions/,
    );
  }
});
