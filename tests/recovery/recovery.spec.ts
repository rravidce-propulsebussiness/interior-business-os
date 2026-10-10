import { expect, test } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
const provider = `http://127.0.0.1:${3135 + Number(process.env.E2E_RECOVERY_PORT_OFFSET ?? 0)}`;
async function control(
  request: APIRequestContext,
  path: string,
  data?: object,
) {
  const response = await request.post(`${provider}/control/${path}`, {
    headers: { Authorization: `Bearer ${process.env.RECOVERY_FIXTURE_TOKEN}` },
    data: data ?? {},
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function password(page: Page) {
  await page
    .getByLabel('New password', { exact: true })
    .fill('Changed-local-password-456');
  await page
    .getByLabel('Confirm new password')
    .fill('Changed-local-password-456');
  await page.getByRole('button', { name: 'Set new password' }).click();
}
async function login(page: Page, value: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
test.beforeEach(async ({ request }) => {
  await control(request, 'reset');
});
test('expired session, scanner-safe landing, reset, revocation and old/new login', async ({
  page,
  request,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.name));
  await login(page, 'Initial-local-password-123');
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole('heading', {
      name: /^(?:(?:Platform|Business) dashboard|Super Admin Dashboard|Business overview)$/,
    }),
  ).toBeVisible();
  await control(request, 'expire');
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('owner@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If');
  const mails = await control(request, 'mail');
  expect(mails).toHaveLength(1);
  await page.goto(mails[0].link);
  await expect(page).toHaveURL(`${baseURL}/reset-password`);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === 'business-os-recovery',
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.value).not.toContain(mails[0].token);
  expect((await control(request, 'state')).tokens[0].used).toBe(false);
  await page.locator('form').evaluate((form) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'userId';
    input.value = '00000000-0000-4000-8000-000000001102';
    form.appendChild(input);
  });
  await password(page);
  await expect(page).toHaveURL(/login\?recovery=complete/);
  expect(
    (await page.context().cookies()).some(
      (c) => c.name.startsWith('sb-') || c.name === 'business-os-recovery',
    ),
  ).toBe(false);
  const state = await control(request, 'state');
  expect(state.refreshSessions).toBe(0);
  expect(
    state.events.filter((e: { kind: string }) => e.kind === 'password'),
  ).toEqual([
    { kind: 'password', userId: '00000000-0000-4000-8000-000000001101' },
  ]);
  await login(page, 'Initial-local-password-123');
  await expect(page.getByRole('status')).toContainText('Sign-in failed');
  await login(page, 'Changed-local-password-456');
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole('heading', {
      name: /^(?:(?:Platform|Business) dashboard|Super Admin Dashboard|Business overview)$/,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('expired, wrong-purpose, invalid and replayed links cannot update a password', async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto('/reset-password');
  await expect(
    page.getByRole('button', { name: 'Set new password' }),
  ).toBeDisabled();
  for (const options of [{ expired: true }, { purpose: 'email' }]) {
    const link = await control(request, 'issue', {
      origin: baseURL,
      ...options,
    });
    await page.goto(link.link);
    await password(page);
    await expect(page.getByRole('status')).toContainText(
      /invalid|expired|used/i,
    );
  }
  await page.goto(
    `${baseURL}/auth/recovery?type=recovery&token_hash=${'a'.repeat(64)}`,
  );
  await password(page);
  await expect(page.getByRole('status')).toContainText(/invalid|expired|used/i);
  expect(
    (await control(request, 'state')).events.filter(
      (e: { kind: string }) => e.kind === 'password',
    ),
  ).toHaveLength(0);
  const valid = await control(request, 'issue', { origin: baseURL });
  await page.goto(valid.link);
  await password(page);
  await expect(page).toHaveURL(/recovery=complete/);
  await page.goto(valid.link);
  await password(page);
  await expect(page.getByRole('status')).toContainText(/invalid|expired|used/i);
  expect(
    (await control(request, 'state')).events.filter(
      (e: { kind: string }) => e.kind === 'password',
    ),
  ).toHaveLength(1);
});
test('unknown accounts, rate limiting and outage have the same public response', async ({
  page,
  request,
}) => {
  let message = '';
  for (const [email, mode] of [
    ['owner@example.test', 'healthy'],
    ['missing@example.test', 'healthy'],
    ['owner@example.test', 'healthy'],
    ['owner@example.test', 'unavailable'],
  ] as const) {
    await control(request, 'mode', { mode });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If');
    const current = await page.getByRole('status').innerText();
    if (message) expect(current).toBe(message);
    message = current;
  }
  expect(await control(request, 'mail')).toHaveLength(1);
});
test('revocation failure is surfaced without claiming successful completion', async ({
  page,
  request,
  baseURL,
}) => {
  await control(request, 'mode', { mode: 'logout_failure' });
  const link = await control(request, 'issue', { origin: baseURL });
  await page.goto(link.link);
  await password(page);
  await expect(page.getByRole('status')).toContainText(
    'Your password changed, but session revocation could not be confirmed',
  );
  const state = await control(request, 'state');
  expect(
    state.events.filter((e: { kind: string }) => e.kind === 'password'),
  ).toHaveLength(1);
  expect(
    state.events.filter((e: { kind: string }) => e.kind === 'logout'),
  ).toHaveLength(0);
  await expect(page).toHaveURL(/reset-password$/);
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === 'business-os-recovery',
    ),
  ).toBe(false);
});
