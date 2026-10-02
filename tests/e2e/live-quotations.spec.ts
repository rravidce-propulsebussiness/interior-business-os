import { expect, test } from '@playwright/test';
test.use({ trace: 'off' });
test('live Owner creates, prices, issues and revises a Wardrobe quotation', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_QUOTATIONS !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD,
    'Requires explicitly enabled disposable live Supabase, commercial/catalog seeds and quotation signing key.',
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
  await page.goto('/dashboard/customers?q=Ravi');
  await page.getByRole('link', { name: 'Ravi Residence', exact: true }).click();
  await page.getByRole('link', { name: 'Projects for this customer' }).click();
  await page
    .getByRole('link', { name: '3BHK Interior - Demo', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Create quotation', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Create quotation', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Revision 1',
  );
  await page.getByRole('link', { name: 'Wardrobe', exact: true }).click();
  await page.getByLabel('width', { exact: true }).fill('8');
  await page.getByLabel('height', { exact: true }).fill('7');
  await page
    .getByLabel('Area', { exact: true })
    .selectOption({ label: 'Master Bedroom' });
  await page.getByLabel(/Plywood grade/i).selectOption('bwp');
  await page.getByLabel(/External finish/i).selectOption('pu');
  await page.getByLabel(/^Hardware/i).selectOption('hettich');
  await page.getByLabel(/Shutter type/i).selectOption('hinged');
  await page.getByLabel(/PU finish/i).selectOption('matte');
  await page.getByRole('button', { name: 'Preview current price' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Current preview' }),
  ).toContainText('133280');
  await page.getByRole('button', { name: 'Save line', exact: true }).click();
  await expect(
    page.getByRole('article').filter({ hasText: 'Wardrobe' }),
  ).toContainText('133280');
  await page.getByRole('button', { name: 'Issue and freeze revision' }).click();
  await expect(
    page.getByRole('button', {
      name: 'Create draft revision from these snapshots',
    }),
  ).toBeVisible();
  const original = page.url(),
    pdfHref = await page
      .getByRole('link', { name: 'Download PDF' })
      .getAttribute('href');
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  await page
    .getByRole('button', { name: 'Create draft revision from these snapshots' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Revision 2',
  );
  await expect(
    page.getByRole('article').filter({ hasText: 'Wardrobe' }),
  ).toContainText('133280');
  await page.getByRole('button', { name: 'Issue and freeze revision' }).click();
  await page.goto(original);
  await expect(
    page.getByRole('link', { name: 'R1 (superseded)' }),
  ).toBeVisible();
});
