import { test, expect } from '@playwright/test';

test.use({ trace: 'off' });
test('live Owner creates a plan and updates a task from a mobile viewport', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'business-app' ||
      process.env.E2E_LIVE_OPERATIONS !== 'true' ||
      !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      !process.env.E2E_OPERATIONS_PROJECT_ID ||
      !process.env.E2E_OPERATIONS_CONTRACT_ID,
    'Requires a disposable hosted project with an accepted contract and current approved estimate, plus Owner credentials',
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
  await expect(
    page.getByRole('heading', { name: 'Business dashboard' }),
  ).toBeVisible();
  await page
    .getByLabel('Active organization')
    .selectOption(
      process.env.E2E_OPERATIONS_ORG_ID ??
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    );
  await page.getByRole('button', { name: 'Switch organization' }).click();
  const project = process.env.E2E_OPERATIONS_PROJECT_ID!;
  await page.goto(
    `/dashboard/operations/command/plan_create?project=${project}`,
  );
  const contracts = page.getByLabel('Accepted contract', { exact: true });
  await expect(
    contracts.locator(
      `option[value="${process.env.E2E_OPERATIONS_CONTRACT_ID}"]`,
    ),
  ).toBeAttached();
  await contracts.selectOption(process.env.E2E_OPERATIONS_CONTRACT_ID!);
  await page
    .getByRole('button', { name: 'Create execution plan', exact: true })
    .click();
  await expect(page).toHaveURL(/operations\/execution_plans\/[0-9a-f-]{36}$/);
  const plan = page.url().split('/').at(-1)!;
  await page.goto(
    `/dashboard/operations/command/save_project_tasks?project=${project}&plan=${plan}`,
  );
  const title = `Mobile installation ${Date.now()}`;
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page).toHaveURL(/operations\/project_tasks\/[0-9a-f-]{36}$/);
  const task = page.url().split('/').at(-1)!;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/operations/project_tasks/${task}`);
  await page.getByLabel('Status', { exact: true }).selectOption('in_progress');
  await page.getByLabel('Progress %', { exact: true }).fill('50');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/operations/project_tasks/${task}$`),
  );
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('in_progress', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
