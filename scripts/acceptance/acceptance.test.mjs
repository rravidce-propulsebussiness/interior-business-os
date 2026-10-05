import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  preflight,
  readTarget,
  identityNames,
  bareOrigin,
  providerUrl,
} from './config.mjs';
import {
  validateScenarios,
  resolveValue,
  pointer,
  resolvePath,
} from './scenarios.mjs';
import { percentile, validatePerformance, measure } from './performance.mjs';
import { Report } from './report.mjs';
import { missingCoverage } from './coverage.mjs';
import { registeredRowsMatch } from './fixtures.mjs';
import { expiryBudget } from './recovery.mjs';
import { assertLocalTestDatabase } from '../local-test-target.ts';
import {
  assertReleaseIdentity,
  releaseCandidate,
  verifyRelease,
} from './release.mjs';

function configured() {
  const project = 'abcdefghijklmnopqrst';
  const db = new URL(
    `postgresql://postgres@db.${project}.supabase.co/postgres?sslmode=verify-full`,
  );
  db.password = randomUUID();
  const env = {
    ACCEPTANCE_ENVIRONMENT: 'staging',
    ACCEPTANCE_PROJECT_REF: project,
    ACCEPTANCE_TARGET_FILE: 'inventory.json',
    ACCEPTANCE_TESTER_ID: 'qa-test',
    ACCEPTANCE_RELEASE_OWNER_ID: 'release-test',
    HOSTED_DATABASE_URL: db.href,
    HOSTED_SUPABASE_URL: `https://${project}.supabase.co`,
    HOSTED_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    PLATFORM_ADMIN_ORIGIN: 'https://platform.acme.com',
    BUSINESS_APP_ORIGIN: 'https://business.acme.com',
    WEBSITES_ORIGIN: 'https://public.acme.com',
    ACCEPTANCE_ORG_A_ID: randomUUID(),
    ACCEPTANCE_ORG_B_ID: randomUUID(),
  };
  for (const name of identityNames) {
    env[`ACCEPTANCE_${name}_EMAIL`] = `${name.toLowerCase()}@example.test`;
    env[`ACCEPTANCE_${name}_PASSWORD`] = randomUUID();
  }
  return env;
}

test('local database fixtures reject hosted targets and connection-query overrides', () => {
  assert.equal(
    assertLocalTestDatabase('postgresql://postgres@127.0.0.1:55432/local_test'),
    'postgresql://postgres@127.0.0.1:55432/local_test',
  );
  for (const value of [
    'postgresql://postgres@db.acme.supabase.co/test',
    'postgresql://postgres@127.0.0.1/test?host=production.acme.com',
    'postgresql://postgres@localhost/test?service=production',
    'https://localhost/test',
    'postgresql:///test',
  ])
    assert.throws(
      () => assertLocalTestDatabase(value),
      /LOCAL_TEST_DATABASE_REQUIRED/,
    );
});

test('hosted acceptance refuses a different commit, candidate, dirty source or unassigned owner', () => {
  const commit = 'a'.repeat(40);
  const target = { releaseCandidate, releaseSha: commit };
  const env = configured();
  assert.equal(
    assertReleaseIdentity({ commit, dirty: false, target, env }).releaseSha,
    commit,
  );
  assert.throws(
    () =>
      assertReleaseIdentity({
        commit: 'b'.repeat(40),
        dirty: false,
        target,
        env,
      }),
    /RELEASE_COMMIT_MISMATCH/,
  );
  assert.throws(
    () =>
      assertReleaseIdentity({
        commit,
        dirty: false,
        target: { ...target, releaseCandidate: 'latest' },
        env,
      }),
    /RELEASE_CANDIDATE_MISMATCH/,
  );
  assert.throws(
    () => assertReleaseIdentity({ commit, dirty: true, target, env }),
    /RELEASE_SOURCE_DIRTY/,
  );
  assert.throws(
    () =>
      assertReleaseIdentity({
        commit,
        dirty: false,
        target,
        env: { ...env, ACCEPTANCE_RELEASE_OWNER_ID: '' },
      }),
    /RELEASE_OWNERSHIP_REQUIRED/,
  );
});

test('release guard checks actual Git source and rejects tracked and untracked changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-guard-'));
  const git = (...args) => {
    const r = spawnSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(r.status, 0, 'Local Git fixture operation failed');
    return r.stdout.trim();
  };
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Local guard fixture');
    git('config', 'user.email', 'fixture@example.test');
    writeFileSync(join(directory, 'pnpm-lock.yaml'), 'fixture-version: 1\n');
    git('add', 'pnpm-lock.yaml');
    git('commit', '--quiet', '-m', 'Local release guard fixture');
    const target = { releaseCandidate, releaseSha: git('rev-parse', 'HEAD') };
    assert.equal(
      verifyRelease(configured(), target, directory).releaseSha,
      target.releaseSha,
    );
    writeFileSync(join(directory, 'pnpm-lock.yaml'), 'changed\n');
    assert.throws(
      () => verifyRelease(configured(), target, directory),
      /RELEASE_SOURCE_DIRTY/,
    );
    writeFileSync(join(directory, 'pnpm-lock.yaml'), 'fixture-version: 1\n');
    writeFileSync(
      join(directory, 'untracked-runtime.mjs'),
      'export const drift=true;\n',
    );
    assert.throws(
      () => verifyRelease(configured(), target, directory),
      /RELEASE_SOURCE_DIRTY/,
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test('production marker fails before hosted activity even with every credential present', () => {
  const env = configured();
  env.ACCEPTANCE_ENVIRONMENT = 'production';
  assert.equal(
    preflight(env).find((c) => c.name === 'ACCEPTANCE_ENVIRONMENT').status,
    'INVALID',
  );
});
test('missing configuration reports names and classifications without values', () => {
  const env = configured();
  delete env.HOSTED_DATABASE_URL;
  const result = preflight(env);
  assert.equal(
    result.find((c) => c.name === 'HOSTED_DATABASE_URL').status,
    'MISSING',
  );
  assert.ok(!JSON.stringify(result).includes(env.ACCEPTANCE_OWNER_A_PASSWORD));
});
test('Supabase URL cannot refer to a different project', () => {
  const env = configured();
  env.HOSTED_SUPABASE_URL = 'https://zyxwvutsrqponmlkjihg.supabase.co';
  assert.equal(
    preflight(env).find((c) => c.name === 'HOSTED_SUPABASE_URL').status,
    'INVALID',
  );
});
test('loopback, URL capabilities, insecure origins and DB TLS downgrade are rejected', () => {
  for (const u of [
    'http://host.example.test',
    'https://localhost',
    'https://host.example.test?token=redacted',
    'https://name@host.example.test',
  ])
    assert.equal(bareOrigin(u), false);
  const env = configured();
  env.HOSTED_DATABASE_URL = env.HOSTED_DATABASE_URL.replace(
    'verify-full',
    'require',
  );
  assert.equal(
    preflight(env).find((c) => c.name === 'HOSTED_DATABASE_URL').status,
    'INVALID',
  );
});
test('same organization for A/B cannot yield an isolation PASS', () => {
  const env = configured();
  env.ACCEPTANCE_ORG_B_ID = env.ACCEPTANCE_ORG_A_ID;
  assert.equal(
    preflight(env).find((c) => c.name === 'ACCEPTANCE_ORG_B_ID').status,
    'INVALID',
  );
});
test('known production project cannot be mislabeled by inventory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acceptance-'));
  try {
    const env = configured();
    env.ACCEPTANCE_TARGET_FILE = join(directory, 'target.json');
    writeFileSync(
      env.ACCEPTANCE_TARGET_FILE,
      JSON.stringify({
        environment: 'staging',
        projectRef: env.ACCEPTANCE_PROJECT_REF,
        productionProjectRefs: [env.ACCEPTANCE_PROJECT_REF],
      }),
    );
    assert.throws(() => readTarget(env), /TARGET_INVENTORY_MISMATCH/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test('empty scenarios and assertionless requests cannot pass', () => {
  assert.throws(() =>
    validateScenarios([{ id: 'email.inbox-delivered', steps: [] }]),
  );
  assert.throws(() =>
    validateScenarios([
      {
        id: 'email.inbox-delivered',
        steps: [
          {
            kind: 'provider',
            method: 'GET',
            path: '/messages',
            origin: 'ACCEPTANCE_INBOX_URL',
            status: 200,
            assert: [],
          },
        ],
      },
    ]),
  );
});
test('denial must check an authorization code rather than generic HTTP failure', () => {
  assert.throws(
    () =>
      validateScenarios([
        {
          id: 'security.idor',
          steps: [
            {
              kind: 'rpc',
              method: 'POST',
              path: 'organization_context',
              status: 403,
              assert: [{ op: 'nonempty', pointer: '/message' }],
            },
          ],
        },
      ]),
    /DENIAL_CODE_REQUIRED/,
  );
});
test('capture cannot persist reset links or tokens', () => {
  assert.throws(
    () =>
      validateScenarios([
        {
          id: 'email.links',
          steps: [
            {
              kind: 'provider',
              method: 'GET',
              path: '/messages',
              origin: 'ACCEPTANCE_INBOX_URL',
              status: 200,
              assert: [{ op: 'nonempty', pointer: '/id' }],
              capture: { resetUrl: '/reset_url' },
            },
          ],
        },
      ]),
    /SECRET_CAPTURE_FORBIDDEN/,
  );
});
test('scenario traversal, prototype lookup and unknown credentials are rejected', () => {
  assert.throws(() => pointer({}, '/__proto__/x'));
  assert.throws(() => resolveValue('${HOSTED_SUPABASE_SECRET_KEY}', {}, {}));
  assert.throws(() =>
    validateScenarios([
      {
        id: 'security.idor',
        steps: [
          {
            kind: 'application',
            method: 'GET',
            path: '//other.example.test',
            origin: 'BUSINESS_APP_ORIGIN',
            status: 200,
            assert: [{ op: 'nonempty', pointer: '' }],
          },
        ],
      },
    ]),
  );
});
test('valid cross-tenant denial can execute without substituting expected responses', () => {
  assert.equal(
    validateScenarios([
      {
        id: 'rls.foreign-write',
        steps: [
          {
            kind: 'rpc',
            actor: 'OWNER_A',
            method: 'POST',
            path: 'save_branch',
            status: 403,
            body: {
              p_organization_id: '${orgB}',
              p_input: { name: 'Denied', code: 'denied' },
            },
            assert: [{ op: 'equals', pointer: '/code', value: '42501' }],
          },
        ],
      },
    ]).length,
    1,
  );
});
test('percentiles use measured samples and do not invent a threshold', () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
});
test('reports drop provider payloads and credential-bearing evidence', () => {
  const report = new Report('production');
  report.add('security.report', 'PASS', 'NONE', 'EXPECTED_RESULT_OBSERVED', {
    password: randomUUID(),
    rawError: 'provider body',
    httpStatus: 200,
  });
  assert.equal(report.environment, 'unverified');
  assert.deepEqual(report.checks[0].evidence, { httpStatus: 200 });
});
test('valid staging configuration does not create a hosted PASS', () => {
  const checks = preflight(configured());
  assert.ok(
    checks.filter((c) => c.critical).every((c) => c.status === 'AVAILABLE'),
  );
  assert.ok(
    checks.every(
      (c) => !Object.hasOwn(c, 'value') && !Object.hasOwn(c, 'result'),
    ),
  );
});
test('production smoke rejects capability-bearing configuration without logging it', () => {
  const secret = randomUUID();
  const u = new URL('https://business.acme.com');
  u.searchParams.set('token', secret);
  const run = spawnSync(process.execPath, ['scripts/production-smoke.mjs'], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      BUSINESS_APP_ORIGIN: u.href,
    },
    encoding: 'utf8',
  });
  assert.equal(run.status, 2);
  assert.equal(run.stderr, '');
  assert.ok(!run.stdout.includes(secret));
});
test('unexecuted required cases remain blocked, supported-feature exclusions explicit', () => {
  const report = new Report('staging');
  report.add(
    'application.homepage',
    'PASS',
    'NONE',
    'EXPECTED_RESULT_OBSERVED',
  );
  missingCoverage(report);
  assert.equal(
    report.checks.find((c) => c.test === 'security.tenant-isolation').result,
    'BLOCKED',
  );
  assert.equal(
    report.checks.find((c) => c.test === 'email.invitation').result,
    'NOT APPLICABLE',
  );
});
test('cleanup scope rejects foreign markers, missing tenants and swapped names', () => {
  const env = configured(),
    target = { markerId: randomUUID() };
  const rows = ['A', 'B'].map((side) => ({
    id: env[`ACCEPTANCE_ORG_${side}_ID`],
    marker: target.markerId,
    name: `ACCEPTANCE-${side}-run`,
    slug: `acceptance-${side.toLowerCase()}-run`,
  }));
  assert.equal(registeredRowsMatch(rows, env, target), true);
  assert.equal(registeredRowsMatch(rows.slice(0, 1), env, target), false);
  assert.equal(
    registeredRowsMatch(
      rows.map((r) => ({ ...r, marker: randomUUID() })),
      env,
      target,
    ),
    false,
  );
  assert.equal(
    registeredRowsMatch(
      rows.map((r) => ({ ...r, name: 'Customer data' })),
      env,
      target,
    ),
    false,
  );
  assert.equal(
    registeredRowsMatch(
      rows,
      {
        ...env,
        ACCEPTANCE_ORG_A_ID: env.ACCEPTANCE_ORG_B_ID,
        ACCEPTANCE_ORG_B_ID: env.ACCEPTANCE_ORG_A_ID,
      },
      target,
    ),
    false,
  );
});
test('expiry drills require actual bounded provider configuration rather than invented expiry', () => {
  assert.equal(expiryBudget({ mailer_otp_exp: 60 }), 60);
  assert.equal(expiryBudget({ mailer_otp_exp: 3600 }), null);
  assert.equal(expiryBudget({ mailer_otp_exp: 0 }), null);
  assert.equal(expiryBudget({ mailer_otp_exp: '60' }), null);
});
test('known secrets cannot escape through a syntactically valid evidence checksum', () => {
  const secret =
    randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const report = new Report('staging', { AUTH_RECOVERY_SIGNING_KEY: secret });
  report.add('security.canary', 'PASS', 'NONE', 'EXPECTED_RESULT_OBSERVED', {
    checksum: secret,
    httpStatus: 200,
  });
  assert.deepEqual(report.checks[0].evidence, { httpStatus: 200 });
});
test('performance cannot measure a homepage as a dashboard or accept a redirect', () => {
  for (const p of [
    {
      id: 'dashboard',
      origin: 'BUSINESS_APP_ORIGIN',
      path: '/',
      samples: 20,
      expectedStatus: 200,
    },
    {
      id: 'dashboard',
      origin: 'BUSINESS_APP_ORIGIN',
      path: '/dashboard',
      samples: 20,
      expectedStatus: 302,
    },
  ])
    assert.throws(() => validatePerformance([p]));
});
test('performance refuses production before launching a browser or request', async () => {
  await assert.rejects(
    () =>
      measure(
        { ACCEPTANCE_ENVIRONMENT: 'production' },
        new Report('unverified'),
        { performance: [] },
      ),
    /STAGING_PERFORMANCE_PLAN_REQUIRED/,
  );
});
test('provider URL preflight rejects embedded credentials and private IPs without printing them', () => {
  const env = configured();
  env.ACCEPTANCE_INBOX_URL = 'https://127.0.0.1';
  assert.equal(providerUrl(env.ACCEPTANCE_INBOX_URL), false);
  assert.equal(
    preflight(env).find((c) => c.name === 'ACCEPTANCE_INBOX_URL').status,
    'INVALID',
  );
  const u = new URL('https://mailosaur.com');
  u.username = randomUUID();
  assert.equal(providerUrl(u.href), false);
});
test('wait-only cases cannot fabricate hosted acceptance', () => {
  assert.throws(
    () =>
      validateScenarios([
        { id: 'email.inbox-delivered', steps: [{ kind: 'wait', ms: 1 }] },
      ]),
    /INVALID_SCENARIO/,
  );
});
test('declared RPC methods must match the actual POST transport', () => {
  assert.throws(
    () =>
      validateScenarios([
        {
          id: 'rls.foreign-write',
          steps: [
            {
              kind: 'rpc',
              actor: 'OWNER_A',
              method: 'DELETE',
              path: 'save_branch',
              status: 403,
              assert: [{ op: 'equals', pointer: '/code', value: '42501' }],
            },
          ],
        },
      ]),
    /INVALID_RPC_METHOD/,
  );
});
test('captured path IDs are encoded and cannot inject another origin or query', () => {
  assert.equal(
    resolvePath(
      '/objects/${id}?value=${ACCEPTANCE_VALUE}',
      { id: 'https://other.test/x' },
      { ACCEPTANCE_VALUE: 'a&token=b' },
    ),
    '/objects/https%3A%2F%2Fother.test%2Fx?value=a%26token%3Db',
  );
  assert.throws(
    () => resolvePath('/${id}', { id: {} }, {}),
    /SCENARIO_PATH_SCALAR_REQUIRED/,
  );
});
test('database URL passwords cannot escape as otherwise-valid evidence identifiers', () => {
  const password = randomUUID(),
    u = new URL('postgresql://test@localhost/db');
  u.password = password;
  const report = new Report('unverified', { HOSTED_DATABASE_URL: u.href });
  report.add(
    'security.database-canary',
    'PASS',
    'NONE',
    'EXPECTED_RESULT_OBSERVED',
    { userId: password, httpStatus: 200 },
  );
  assert.deepEqual(report.checks[0].evidence, { httpStatus: 200 });
});
test('CLI fails fast with sanitized artifacts and zero network or data prerequisites', () => {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ACCEPTANCE_OWNER_A_PASSWORD: randomUUID(),
  };
  const run = spawnSync(process.execPath, ['scripts/acceptance/hosted.mjs'], {
    env,
    encoding: 'utf8',
  });
  assert.equal(run.status, 2);
  assert.ok(!run.stdout.includes(env.ACCEPTANCE_OWNER_A_PASSWORD));
  assert.equal(run.stderr, '');
  const match = run.stdout.match(
    /Artifacts: \.tools\/acceptance\/([0-9a-f-]+)\//,
  );
  assert.ok(match);
  const report = JSON.parse(
    readFileSync(`.tools/acceptance/${match[1]}/results.json`),
  );
  assert.equal(report.productionStatus, 'NO-GO');
  assert.ok(report.checks.every((c) => c.result !== 'PASS'));
  assert.ok(report.checks.some((c) => c.category === 'MISSING_CREDENTIAL'));
});
