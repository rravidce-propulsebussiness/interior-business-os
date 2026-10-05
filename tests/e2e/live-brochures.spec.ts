import { expect, test } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test('live brochure authoring publishes immutable editions and revokes public access', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_BROCHURE !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      !process.env.E2E_BROCHURE_PUBLIC_ORIGIN,
    'Requires a disposable hosted organization, Brochure and CRM enabled, Website disabled, signing key, public origin and owner credentials.',
  );
  test.setTimeout(180000);
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/brochures');
  const slug = `acceptance-${Date.now()}`;
  await page.getByLabel('Name', { exact: true }).fill('Brochure acceptance');
  await page.getByLabel('Public slug', { exact: true }).fill(slug);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/brochures\/[^/]+\/editor$/);
  const detail = page.url().replace(/\/editor$/, '');
  await page
    .getByRole('button', { name: 'heading', exact: true })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Text', exact: true })
    .fill('Edition one');
  await page.getByRole('button', { name: 'settings', exact: true }).click();
  await page.getByLabel('sharing', { exact: true }).check();
  await page
    .getByLabel('Enable CRM consultation form', { exact: true })
    .check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Publish saved draft', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Publish saved draft', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(/published/i);
  await page.goto(detail);
  const href = await page
    .getByRole('link', { name: 'Open viewer', exact: true })
    .getAttribute('href');
  expect(href).toBeTruthy();
  const publicUrl = new URL(
    new URL(href!, page.url()).pathname,
    process.env.E2E_BROCHURE_PUBLIC_ORIGIN!,
  ).toString();
  const visitor = await browser.newContext();
  try {
    const publicPage = await visitor.newPage();
    await publicPage.goto(publicUrl);
    await expect(
      publicPage.getByRole('heading', { name: 'Edition one', exact: true }),
    ).toBeVisible();
    const firstPdf = await visitor.request.get(`${publicUrl}/pdf`);
    expect(firstPdf.status()).toBe(200);
    const bytes = await firstPdf.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await page.goto(`${detail}/editor`);
    await page
      .getByRole('button', { name: 'heading', exact: true })
      .last()
      .click();
    await page
      .getByRole('textbox', { name: 'Text', exact: true })
      .fill('Edition two');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Publish saved draft', exact: true }),
    ).toBeEnabled();
    await publicPage.reload();
    await expect(
      publicPage.getByRole('heading', { name: 'Edition one', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Publish saved draft', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(/published/i);
    await publicPage.reload();
    await expect(
      publicPage.getByRole('heading', { name: 'Edition two', exact: true }),
    ).toBeVisible();
    await page.goto(detail);
    await page
      .getByRole('button', { name: 'Restore as new version', exact: true })
      .last()
      .click();
    await expect(page.getByRole('row')).toHaveCount(4);
    expect(
      await (await visitor.request.get(`${publicUrl}/pdf`)).body(),
    ).toEqual(bytes);
    await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Unpublish', exact: true }),
    ).toHaveCount(0);
    expect((await visitor.request.get(publicUrl)).status()).toBe(404);
    expect((await visitor.request.get(`${publicUrl}/pdf`)).status()).toBe(404);
  } finally {
    await visitor.close();
  }
});
