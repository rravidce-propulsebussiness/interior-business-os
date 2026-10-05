import { chromium, expect } from '@playwright/test';
import { request, assert, AcceptanceError } from './http.mjs';
import { runCheck } from './checks.mjs';

// Optional concrete inbox adapter. Mailosaur receives actual SMTP messages;
// this code never creates a message or substitutes delivery with a mock.
export async function inboxMessage(env, recipient, since) {
  if (
    env.ACCEPTANCE_INBOX_PROVIDER !== 'mailosaur' ||
    env.ACCEPTANCE_INBOX_URL !== 'https://mailosaur.com' ||
    !env.ACCEPTANCE_INBOX_TOKEN ||
    !env.ACCEPTANCE_INBOX_SERVER
  )
    throw new AcceptanceError(
      'REAL_INBOX_CONFIGURATION_MISSING',
      'CONFIGURATION_FAILURE',
    );
  const headers = {
    Authorization: `Basic ${Buffer.from(env.ACCEPTANCE_INBOX_TOKEN + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };
  const query = new URLSearchParams({
    server: env.ACCEPTANCE_INBOX_SERVER,
    receivedAfter: since,
    itemsPerPage: '10',
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const result = await request(
      `https://mailosaur.com/api/messages/search?${query}`,
      { method: 'POST', headers, body: JSON.stringify({ sentTo: recipient }) },
    );
    if (result.status !== 200)
      throw new AcceptanceError(
        'INBOX_PROVIDER_REJECTED',
        'EXTERNAL_DEPENDENCY',
        { httpStatus: result.status },
      );
    const match = result.body?.items?.find(
      (m) =>
        m.type === 'Email' &&
        m.to?.some((t) => t.email?.toLowerCase() === recipient.toLowerCase()) &&
        Date.parse(m.received) >= Date.parse(since),
    );
    if (match?.id) {
      const full = await request(
        `https://mailosaur.com/api/messages/${encodeURIComponent(match.id)}`,
        { headers },
      );
      assert(
        full.status === 200 && full.body?.id === match.id,
        'INBOX_MESSAGE_READ_FAILED',
      );
      return full.body;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new AcceptanceError('INBOX_DELIVERY_TIMEOUT', 'EXTERNAL_DEPENDENCY');
}
function linkFor(message, origin) {
  const links = [
    ...(message.html?.links ?? []),
    ...(message.text?.links ?? []),
  ];
  const link = links.find((l) => {
    try {
      const u = new URL(l.href);
      return (
        u.origin === origin &&
        u.pathname === '/auth/recovery' &&
        u.searchParams.get('type') === 'recovery' &&
        !!u.searchParams.get('token_hash')
      );
    } catch {
      return false;
    }
  })?.href;
  if (!link) throw new AcceptanceError('RECOVERY_TEMPLATE_OR_LINK_INVALID');
  return link;
}
export function expiryBudget(config) {
  return Number.isInteger(config?.mailer_otp_exp) &&
    config.mailer_otp_exp > 0 &&
    config.mailer_otp_exp <= 300
    ? config.mailer_otp_exp
    : null;
}
async function expiredRecovery(env, sb) {
  if (!env.ACCEPTANCE_SUPABASE_CONTROL_TOKEN)
    throw new AcceptanceError(
      'AUTH_EXPIRY_CONTROL_ACCESS_MISSING',
      'CONFIGURATION_FAILURE',
    );
  const config = await request(
    `https://api.supabase.com/v1/projects/${env.ACCEPTANCE_PROJECT_REF}/config/auth`,
    {
      headers: {
        Authorization: `Bearer ${env.ACCEPTANCE_SUPABASE_CONTROL_TOKEN}`,
      },
    },
  );
  if (config.status !== 200)
    throw new AcceptanceError(
      'AUTH_CONTROL_UNAVAILABLE',
      'EXTERNAL_DEPENDENCY',
      { httpStatus: config.status },
    );
  const ttl = expiryBudget(config.body);
  if (!ttl)
    throw new AcceptanceError(
      'REAL_OTP_EXPIRY_EXCEEDS_BOUNDED_DRILL',
      'ENVIRONMENT_LIMITATION',
    );
  const since = new Date().toISOString();
  const r = await sb.call(
    '/auth/v1/recover?redirect_to=' +
      encodeURIComponent(env.BUSINESS_APP_ORIGIN + '/auth/recovery'),
    { method: 'POST', body: { email: env.ACCEPTANCE_OWNER_A_EMAIL } },
  );
  if (r.status !== 200)
    throw new AcceptanceError(
      'RECOVERY_PROVIDER_REJECTED',
      'EXTERNAL_DEPENDENCY',
      { httpStatus: r.status },
    );
  const sentAt = Date.now(),
    message = await inboxMessage(env, env.ACCEPTANCE_OWNER_A_EMAIL, since),
    link = linkFor(message, env.BUSINESS_APP_ORIGIN);
  while (Date.now() < sentAt + (ttl + 10) * 1000) {
    console.log('auth-recovery.expiry-wait: ACTUAL_PROVIDER_TTL');
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(30000, sentAt + (ttl + 10) * 1000 - Date.now()),
      ),
    );
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(link);
    await expect(page).toHaveURL(env.BUSINESS_APP_ORIGIN + '/reset-password');
    await submit(page, env.ACCEPTANCE_OWNER_A_PASSWORD);
    await expect(page.getByRole('status')).toContainText('invalid or expired');
    await sb.login('OWNER_A');
    return { assertions: 2, messageId: message.id };
  } finally {
    await browser.close();
  }
}
async function submit(page, password) {
  await page.getByLabel('New password', { exact: true }).fill(password);
  await page.getByLabel('Confirm new password').fill(password);
  await page.getByRole('button', { name: 'Set new password' }).click();
}
export async function recoveryChecks(env, sb, report, target) {
  if (
    env.ACCEPTANCE_RECOVERY !== 'true' ||
    env.ACCEPTANCE_SMTP_CONFIGURED !== 'true' ||
    target.providerOrigins?.ACCEPTANCE_INBOX_URL !== env.ACCEPTANCE_INBOX_URL
  ) {
    report.add(
      'auth-recovery.runner',
      'BLOCKED',
      'CONFIGURATION_FAILURE',
      'REAL_SMTP_INBOX_AND_RECOVERY_OPT_IN_REQUIRED',
    );
    return;
  }
  const roles = [
    ['OWNER_A', 'BUSINESS_APP_ORIGIN', 'ACCEPTANCE_RESET_NEW_PASSWORD'],
    [
      'PLATFORM_ADMIN',
      'PLATFORM_ADMIN_ORIGIN',
      'ACCEPTANCE_PLATFORM_RESET_NEW_PASSWORD',
    ],
  ];
  if (
    roles.some(
      ([actor, , key]) =>
        !env[key] ||
        env[key].length < 12 ||
        env[key].length > 128 ||
        env[key] === env[`ACCEPTANCE_${actor}_PASSWORD`],
    )
  ) {
    report.add(
      'auth-recovery.runner',
      'BLOCKED',
      'CONFIGURATION_FAILURE',
      'DISTINCT_OPERATOR_SUPPLIED_NEW_PASSWORDS_REQUIRED',
    );
    return;
  }
  const browser = await chromium.launch();
  let completed = 0;
  try {
    for (const [actor, originKey, newKey] of roles) {
      const context = await browser.newContext(),
        page = await context.newPage();
      const origin = env[originKey],
        recipient = env[`ACCEPTANCE_${actor}_EMAIL`],
        oldPassword = env[`ACCEPTANCE_${actor}_PASSWORD`];
      try {
        const passed = await runCheck(
          report,
          `auth-recovery.${actor.toLowerCase()}`,
          async () => {
            const since = new Date().toISOString();
            await page.goto(`${origin}/forgot-password`);
            await page.getByLabel('Email').fill(recipient);
            await page.getByRole('button', { name: 'Send reset link' }).click();
            await expect(page.getByRole('status')).toContainText('If');
            const message = await inboxMessage(env, recipient, since),
              link = linkFor(message, origin);
            await page.goto(link);
            await expect(page).toHaveURL(`${origin}/reset-password`);
            const cookie = (await context.cookies()).find(
              (c) => c.name === 'business-os-recovery',
            );
            assert(
              cookie?.httpOnly && cookie?.secure && cookie?.sameSite === 'Lax',
              'RECOVERY_HTTPS_COOKIE_INVALID',
            );
            await submit(page, env[newKey]);
            await expect(page).toHaveURL(/\/login\?recovery=complete$/);
            // Retain only in-memory input for subsequent tests. Never persist passwords.
            env[`ACCEPTANCE_${actor}_PASSWORD`] = env[newKey];
            sb.env[`ACCEPTANCE_${actor}_PASSWORD`] = env[newKey];
            const old = await sb.call('/auth/v1/token?grant_type=password', {
              method: 'POST',
              body: { email: recipient, password: oldPassword },
            });
            assert(
              old.status === 400 &&
                old.body?.error_code === 'invalid_credentials',
              'OLD_PASSWORD_NOT_DENIED',
            );
            await sb.login(actor);
            await page.goto(`${origin}/login`);
            await page.getByLabel('Email').fill(recipient);
            await page
              .getByLabel('Password', { exact: true })
              .fill(env[newKey]);
            await page
              .getByRole('button', { name: 'Sign in', exact: true })
              .click();
            await expect(
              page.getByRole('heading', {
                name:
                  actor === 'OWNER_A'
                    ? 'Business dashboard'
                    : 'Platform dashboard',
                exact: true,
              }),
            ).toBeVisible();
            await page.goto(link);
            await expect(page).toHaveURL(`${origin}/reset-password`);
            await submit(page, env[newKey]);
            await expect(page.getByRole('status')).toContainText(
              'invalid or expired',
            );
            return { assertions: 7, messageId: message.id };
          },
        );
        if (passed) completed++;
        if (!passed) break;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (completed === 2) {
    for (const name of [
      'inbox-receipt',
      'reset-link',
      'new-password',
      'old-password-denied',
      'token-reuse-denied',
    ])
      report.add(
        `auth-recovery.${name}`,
        'PASS',
        'NONE',
        'BOTH_HOSTED_ADMIN_RECOVERY_FLOWS_OBSERVED',
        { assertions: 2 },
      );
    report.add(
      'email.password-reset',
      'PASS',
      'NONE',
      'REAL_SMTP_INBOX_RECEIPT_OBSERVED',
      { assertions: 2 },
    );
    await runCheck(report, 'auth-recovery.expired-token-denied', () =>
      expiredRecovery(env, sb),
    );
  }
  // Natural OTP expiry is not inferred from a syntactically invalid token.
  // An expired real-email fixture or an operator-configured expiry drill remains
  // separately required. Never advance a provider clock or forge a token.
}
