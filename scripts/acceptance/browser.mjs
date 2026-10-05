import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export async function browserChecks(env, report) {
  if (env.ACCEPTANCE_BROWSER !== 'true') {
    report.add(
      'browser.runner',
      'BLOCKED',
      'CONFIGURATION_FAILURE',
      'HOSTED_BROWSER_OPT_IN_MISSING',
    );
    return;
  }
  const output = resolve('.tools/acceptance', report.runId, 'browser.json');
  const directory = resolve('.tools/acceptance', report.runId),
    gate = resolve(directory, 'browser-gate.json'),
    token = randomUUID();
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    gate,
    JSON.stringify({
      token,
      projectRef: env.ACCEPTANCE_PROJECT_REF,
      origins: [env.PLATFORM_ADMIN_ORIGIN, env.BUSINESS_APP_ORIGIN],
      createdAt: Date.now(),
    }),
    { mode: 0o600 },
  );
  const browserEnv = {
    ...env,
    ACCEPTANCE_BROWSER_RESULT: output,
    ACCEPTANCE_BROWSER_RUN_ID: report.runId,
    ACCEPTANCE_BROWSER_GUARD_TOKEN: token,
    E2E_OWNER_EMAIL: env.ACCEPTANCE_OWNER_A_EMAIL,
    E2E_OWNER_PASSWORD: env.ACCEPTANCE_OWNER_A_PASSWORD,
    E2E_ORG_ID: env.ACCEPTANCE_ORG_A_ID,
    E2E_ORG_NAME: env.ACCEPTANCE_ORG_A_NAME,
    E2E_DESIGNER_EMAIL: env.ACCEPTANCE_DESIGNER_EMAIL,
    E2E_DESIGNER_PASSWORD: env.ACCEPTANCE_DESIGNER_PASSWORD,
    E2E_SALES_EMAIL: env.ACCEPTANCE_SALES_EMAIL,
    E2E_SALES_PASSWORD: env.ACCEPTANCE_SALES_PASSWORD,
    E2E_FINANCE_ORG_ID: env.ACCEPTANCE_ORG_A_ID,
    E2E_EXECUTION_ORG_ID: env.ACCEPTANCE_ORG_A_ID,
    E2E_OPERATIONS_ORG_ID: env.ACCEPTANCE_ORG_A_ID,
  };
  // Launch with Node directly: no shell, no credentials in arguments/output.
  const status = await new Promise((resolveStatus) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'tests/hosted/playwright.config.ts',
      ],
      { env: browserEnv, stdio: 'ignore' },
    );
    const timeout = setTimeout(() => child.kill(), 20 * 60 * 1000);
    child.on('error', () => {
      clearTimeout(timeout);
      resolveStatus(-1);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolveStatus(code);
    });
  });
  unlinkSync(gate);
  let results;
  try {
    results = JSON.parse(readFileSync(output, 'utf8'));
  } catch {
    report.add(
      'browser.runner',
      'FAIL',
      'CODE_FAILURE',
      'HOSTED_BROWSER_RESULT_MISSING',
    );
    return;
  }
  for (const row of results)
    report.add(
      `browser.case.${row.index}`,
      row.result,
      row.result === 'PASS'
        ? 'NONE'
        : row.result === 'NOT APPLICABLE'
          ? 'NOT_APPLICABLE'
          : row.result === 'BLOCKED'
            ? 'CONFIGURATION_FAILURE'
            : 'CODE_FAILURE',
      row.reason,
      { durationMs: row.durationMs },
    );
  for (const group of [
    'live-auth',
    'live-catalog',
    'live-crm',
    'live-quotation',
    'live-finance',
    'live-execution',
    'live-operations',
    'live-automation',
    'live-brochure',
  ]) {
    const rows = results.filter((r) => r.group === group && r.applicable);
    const result =
      rows.length && rows.every((r) => r.result === 'PASS')
        ? 'PASS'
        : rows.some((r) => r.result === 'FAIL')
          ? 'FAIL'
          : 'BLOCKED';
    report.add(
      `browser.${group}`,
      result,
      result === 'PASS'
        ? 'NONE'
        : result === 'FAIL'
          ? 'CODE_FAILURE'
          : 'CONFIGURATION_FAILURE',
      result === 'PASS'
        ? 'APPLICABLE_HOSTED_BROWSER_CASES_PASSED'
        : result === 'FAIL'
          ? 'HOSTED_BROWSER_ASSERTION_FAILED'
          : 'LIVE_FIXTURE_PREREQUISITE_MISSING',
      { executed: rows.filter((r) => r.result === 'PASS').length },
    );
  }
  report.add(
    'browser.runner',
    status === 0 ? 'PASS' : 'FAIL',
    status === 0 ? 'NONE' : 'CODE_FAILURE',
    status === 0 ? 'BROWSER_EXECUTED' : 'BROWSER_RUN_FAILED',
    {
      executed: results.filter((r) => r.result === 'PASS').length,
      blocked: results.filter((r) => r.result === 'BLOCKED').length,
    },
  );
}
