import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { deliverEmail } from './automation-email.mjs';
import { validateDeploymentEnvironment } from '../packages/shared/src/runtime.ts';

validateDeploymentEnvironment(process.env, 'worker');

const url = process.env.AUTOMATION_DATABASE_URL;
if (!url)
  throw new Error(
    'AUTOMATION_DATABASE_URL is required for the restricted worker login',
  );
const connection = new URL(url);
if (!['postgres:', 'postgresql:'].includes(connection.protocol))
  throw new Error('Invalid worker database configuration');
const worker = process.env.AUTOMATION_WORKER_NAME ?? 'automation-worker';
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(worker))
  throw new Error('Invalid worker name');
const executable =
  process.env.PSQL_PATH ??
  (process.platform === 'win32'
    ? 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
    : 'psql');
const env = {
  ...process.env,
  PGHOST: connection.hostname,
  PGPORT: connection.port || '5432',
  PGUSER: decodeURIComponent(connection.username),
  PGPASSWORD: decodeURIComponent(connection.password),
  PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
  PGSSLMODE:
    connection.searchParams.get('sslmode') ??
    (['127.0.0.1', 'localhost'].includes(connection.hostname)
      ? 'disable'
      : 'verify-full'),
  PGCONNECT_TIMEOUT: '10',
  PGOPTIONS:
    '-c statement_timeout=45000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=60000',
};
delete env.AUTOMATION_DATABASE_URL;
delete env.AUTOMATION_EMAIL_API_KEY;
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
async function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      ['-X', '-qAt', '-w', '-v', 'ON_ERROR_STOP=1'],
      { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let output = '';
    let invalid = false;
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        invalid = true;
        child.kill();
      }
    }, 55000);
    timer.unref();
    child.stdout.on('data', (data) => {
      output += data.toString();
      if (output.length > 1000000) {
        invalid = true;
        child.kill();
      }
    });
    child.stderr.resume(); // Never log provider contacts, database URLs or raw SQL diagnostics.
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Worker database process unavailable'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || invalid)
        reject(new Error('Worker database operation failed'));
      else {
        try {
          resolve(JSON.parse(output.trim()));
        } catch {
          reject(new Error('Invalid worker database response'));
        }
      }
    });
    child.stdin.end(sql);
  });
}
const allowed = await query(
  "select to_jsonb(not rolsuper and not rolbypassrls and pg_has_role(current_user,'business_os_worker','MEMBER')) from pg_roles where rolname=current_user;",
);
if (!allowed)
  throw new Error(
    'Worker requires a restricted non-superuser login without BYPASSRLS',
  );
let stopping = false;
const sleepController = new AbortController();
process.on('SIGINT', () => {
  stopping = true;
  sleepController.abort();
});
process.on('SIGTERM', () => {
  stopping = true;
  sleepController.abort();
});
do {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const counts = await query(
      `select private.automation_tick(${quote(worker)},100);`,
    );
    let emailAttempts = 0;
    // Claim immediately before sending so a slow provider cannot expire a batch's later leases.
    for (let attempt = 0; attempt < 10 && !stopping; attempt++) {
      const deliveries = await query(
        'select private.automation_email_claim(1);',
      );
      const delivery = deliveries[0];
      if (!delivery) break;
      emailAttempts++;
      if (
        !/^[a-f0-9-]{36}$/.test(delivery.id) ||
        !/^[a-f0-9-]{36}$/.test(delivery.lease)
      )
        throw new Error('Invalid delivery lease');
      const result = await deliverEmail(delivery, {
        apiKey: process.env.AUTOMATION_EMAIL_API_KEY,
        from: process.env.AUTOMATION_EMAIL_FROM,
      });
      await query(
        `select to_jsonb(private.automation_email_ack(${quote(delivery.id)},${quote(delivery.lease)},${quote(result.result)},${result.providerId ? quote(result.providerId) : 'null'}));`,
      );
    }
    let invitationEmailAttempts = 0;
    // Employee invites are not automation rules: use a separate, permission-
    // checked lease and the same restricted worker mail transport.
    for (let attempt = 0; attempt < 5 && !stopping; attempt++) {
      const invite = await query('select private.employee_invitation_email_claim();');
      if (!invite) break;
      if (
        !/^[a-f0-9-]{36}$/.test(invite.id) ||
        !/^[a-f0-9-]{36}$/.test(invite.lease)
      )
        throw new Error('Invalid employee invitation lease');
      invitationEmailAttempts++;
      const configuredOrigin = process.env.BUSINESS_APP_ORIGIN;
      let appUrl = null;
      if (configuredOrigin) {
        try {
          const parsed = new URL(configuredOrigin);
          if (parsed.protocol === 'https:' && parsed.pathname === '/' &&
              !parsed.search && !parsed.hash && !parsed.username && !parsed.password) {
            appUrl = new URL('/dashboard/company/invitations', parsed).toString();
          }
        } catch {
          // Fail closed when no approved HTTPS business origin is configured.
        }
      }
      const delivery = {
        recipient: invite.recipient,
        idempotencyKey: invite.idempotencyKey,
        subject: 'Invitation to join your business workspace',
        text: [
          'You have been invited to join ' + invite.organizationName + ' on Business OS.',
          'Sign up or sign in with this email address, verify it, and accept your invitation.',
          appUrl ?? '',
          'Invitations expire after seven days. If you were not expecting this, ignore this email.',
        ].filter(Boolean).join('\n\n'),
      };
      const result = appUrl
        ? await deliverEmail(delivery, {
            apiKey: process.env.AUTOMATION_EMAIL_API_KEY,
            from: process.env.AUTOMATION_EMAIL_FROM,
          })
        : { result: 'unconfigured' };
      await query(
        `select private.employee_invitation_email_ack(${quote(invite.id)},${quote(invite.lease)},${quote(result.result)},${result.providerId ? quote(result.providerId) : 'null'});`
      );
    }
    await query('select to_jsonb(private.automation_retention());');
    console.log(
      JSON.stringify({
        event: 'automation.tick',
        environment: process.env.APP_ENV,
        timestamp: new Date().toISOString(),
        severity: 'info',
        service: 'worker',
        requestId,
        durationMs: Date.now() - started,
        worker,
        ...counts,
        emailAttempts,
        invitationEmailAttempts,
      }),
    );
  } catch {
    console.error(
      JSON.stringify({
        event: 'automation.tick.failed',
        environment: process.env.APP_ENV,
        timestamp: new Date().toISOString(),
        severity: 'error',
        service: 'worker',
        requestId,
        durationMs: Date.now() - started,
        worker,
        message:
          'Check worker permissions, database health and operational logs.',
      }),
    );
    if (process.argv.includes('--once')) process.exitCode = 1;
  }
  if (process.argv.includes('--once') || stopping) break;
  await delay(30000, undefined, { signal: sleepController.signal }).catch(
    () => undefined,
  );
} while (!stopping);
