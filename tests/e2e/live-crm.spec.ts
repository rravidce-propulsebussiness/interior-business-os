import { expect, test, type Page } from '@playwright/test';

// Bearer URLs must never enter Playwright traces, screenshots or videos.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.describe.configure({ mode: 'serial' });

async function login(page: Page) {
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(process.env.E2E_SALES_EMAIL!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_SALES_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function share(page: Page) {
  await page
    .getByRole('button', { name: 'Create secure link', exact: true })
    .click();
  const field = page.getByLabel('New secure link (shown only now)');
  await expect(field).toBeVisible();
  return field.inputValue();
}

test('live salesperson converts an enquiry, shares a quotation and handles revision approval', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_CRM !== 'true' ||
      !process.env.E2E_SALES_EMAIL ||
      !process.env.E2E_SALES_PASSWORD,
    'Requires disposable hosted Supabase, CRM/catalog seeds, signing key and an organization-scoped Sales account.',
  );
  test.setTimeout(180000);
  await login(page);
  const name = 'CRM acceptance ' + Date.now();
  await page.goto('/dashboard/crm/leads/new');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page
    .getByLabel('Phone (include country code when known)')
    .fill('+1202' + String(Date.now()).slice(-7));
  await page
    .getByLabel('Source', { exact: true })
    .selectOption({ label: 'Referral' });
  const assignee = page.getByLabel('Assigned salesperson');
  const person = await assignee.locator('option').nth(1).getAttribute('value');
  expect(person).toBeTruthy();
  await assignee.selectOption(person!);
  await page.getByRole('button', { name: 'Create lead', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  const leadUrl = page.url();
  await page
    .getByLabel('Activity note')
    .fill('Customer confirmed the initial scope.');
  await page.getByRole('button', { name: 'Add activity' }).click();
  await expect(
    page.getByText('Customer confirmed the initial scope.', { exact: true }),
  ).toBeVisible();
  await page.getByText('Schedule follow-up', { exact: true }).first().click();
  await page.getByLabel('Due at (your local time)').fill('2026-01-01T11:00');
  await page.getByLabel('Follow-up note').fill('Prepare scope');
  await page
    .getByRole('button', { name: 'Schedule follow-up', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Update follow-up' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Update follow-up' }).click();
  await expect(page.getByText('No pending follow-ups.')).toBeVisible();
  await page.getByText('Schedule site visit', { exact: true }).first().click();
  await page
    .getByLabel('Scheduled at (your local time)')
    .fill('2026-10-01T11:00');
  await page
    .getByRole('button', { name: 'Schedule site visit', exact: true })
    .click();
  await page
    .getByLabel('Observations, approximate dimensions, access and preferences')
    .fill('Lift access; approximately 100 square metres.');
  await page.getByLabel('Visit outcome').fill('Ready to quote');
  await page.getByRole('button', { name: 'Record visit' }).click();
  await page.getByText('Change stage', { exact: true }).first().click();
  await page
    .getByLabel('Stage', { exact: true })
    .selectOption({ label: 'Qualified' });
  await page.getByRole('button', { name: 'Change stage', exact: true }).click();
  await expect(
    page.getByText('Stage changed to Qualified', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Convert lead', exact: true }).click();
  await page.getByRole('button', { name: 'Convert lead', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\//);
  const projectUrl = page.url();
  await page
    .getByRole('link', { name: 'Create quotation', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Create quotation', exact: true })
    .click();
  await page.getByRole('link', { name: 'Wardrobe', exact: true }).click();
  await page.getByLabel('width', { exact: true }).fill('8');
  await page.getByLabel('height', { exact: true }).fill('7');
  await page.getByLabel(/Plywood grade/i).selectOption('bwp');
  await page.getByLabel(/External finish/i).selectOption('pu');
  await page.getByLabel(/^Hardware/i).selectOption('hettich');
  await page.getByLabel(/Shutter type/i).selectOption('hinged');
  await page.getByLabel(/PU finish/i).selectOption('matte');
  await page.getByRole('button', { name: 'Save line', exact: true }).click();
  await page.getByRole('button', { name: 'Issue and freeze revision' }).click();
  const firstUrl = await share(page);
  const customer = await browser.newContext();
  try {
    const publicPage = await customer.newPage();
    await publicPage.goto(firstUrl);
    await expect(
      publicPage.getByRole('button', { name: 'Approve quotation' }),
    ).toBeVisible();
    expect(await publicPage.locator('body').innerText()).not.toMatch(
      /estimatedCost|internal_notes|minimum_rate|organization_id/,
    );
    const pdf = await customer.request.get(firstUrl + '/pdf');
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await publicPage.getByLabel('Your name').fill('Customer');
    await publicPage
      .getByLabel('Comment (required when requesting changes)')
      .fill('Please revise the height.');
    await publicPage.getByRole('checkbox').check();
    await publicPage.getByRole('button', { name: 'Request changes' }).click();
    await expect(
      publicPage.getByRole('heading', {
        name: 'Response recorded: changes requested',
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText('Please revise the height.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Create draft revision from these snapshots',
      })
      .click();
    await page.getByRole('link', { name: 'Edit / refresh price' }).click();
    await page.getByLabel('height', { exact: true }).fill('8');
    await page
      .getByRole('button', { name: 'Recalculate and save line', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Issue and freeze revision' })
      .click();
    const secondUrl = await share(page);
    await publicPage.goto(firstUrl);
    await expect(
      publicPage.getByRole('heading', { name: /Superseded/ }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole('button', { name: 'Approve quotation' }),
    ).toHaveCount(0);
    await publicPage.goto(secondUrl);
    await publicPage.getByLabel('Your name').fill('Customer');
    await publicPage.getByRole('checkbox').check();
    await publicPage.getByRole('button', { name: 'Approve quotation' }).click();
    await expect(
      publicPage.getByRole('heading', { name: 'Response recorded: approved' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Commercially accepted' }),
    ).toBeVisible();
    await page.goto(projectUrl);
    await expect(page.getByText(/Commercially accepted/).first()).toBeVisible();
    await page.goto(leadUrl);
    await expect(
      page.getByText('Customer approved', { exact: true }),
    ).toBeVisible();
  } finally {
    await customer.close();
  }
});
