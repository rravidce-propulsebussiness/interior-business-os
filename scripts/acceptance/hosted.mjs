import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preflight, readTarget } from './config.mjs';
import { Report } from './report.mjs';
import { verifyMarker, verifyMigrations, sha } from './database.mjs';
import { Supabase, AcceptanceError } from './http.mjs';
import { probes, authChecks, isolation, runCheck } from './checks.mjs';
import { scenarioChecks, validateScenarios } from './scenarios.mjs';
import { verifyFixtures, provision, archive } from './fixtures.mjs';
import { missingCoverage } from './coverage.mjs';
import { measure, validatePerformance } from './performance.mjs';
import { browserChecks } from './browser.mjs';
import { recoveryChecks } from './recovery.mjs';
import { verifyRelease } from './release.mjs';

async function main() {
  const envFile = process.argv.find((a) => a.startsWith('--env-file='));
  if (envFile) {
    try {
      process.loadEnvFile(envFile.slice(11));
    } catch {
      const report = new Report('unverified', process.env);
      report.add(
        'target.environment-file',
        'BLOCKED',
        'MISSING_CREDENTIAL',
        'ENVIRONMENT_FILE_UNAVAILABLE',
      );
      missingCoverage(report, 'ENVIRONMENT_FILE_UNAVAILABLE');
      process.exitCode = report.finish();
      return;
    }
  }
  const flags = process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--env-file='));
  if (
    flags.some(
      (a) =>
        !['--preflight', '--provision', '--cleanup', '--performance'].includes(
          a,
        ),
    ) ||
    flags.length > 1
  ) {
    console.log('INVALID_ACCEPTANCE_MODE');
    process.exitCode = 2;
    return;
  }
  const env = {
    ...process.env,
    ACCEPTANCE_MODE: flags.includes('--provision') ? 'provision' : 'run',
  };
  const report = new Report(env.ACCEPTANCE_ENVIRONMENT, env);
  const inventory = preflight(env);
  for (const c of inventory) console.log(`${c.name} = ${c.status}`);
  const missing = inventory.filter(
    (c) => c.critical && c.status !== 'AVAILABLE',
  );
  if (missing.length) {
    report.add(
      'target.preflight',
      'BLOCKED',
      missing.some((c) => c.status === 'MISSING')
        ? 'MISSING_CREDENTIAL'
        : 'CONFIGURATION_FAILURE',
      'CRITICAL_PREREQUISITES_UNAVAILABLE',
      { missing: missing.length },
    );
    missingCoverage(report, 'CRITICAL_PREREQUISITES_UNAVAILABLE');
    process.exitCode = report.finish(inventory);
    return;
  }
  let sb;
  try {
    const target = readTarget(env);
    Object.assign(report, verifyRelease(env, target));
    validatePerformance(target.performance ?? []);
    // Parse all optional plans before any hosted operation. No empty/weak tests.
    if (env.ACCEPTANCE_SCENARIOS_FILE) {
      const plan = validateScenarios(
        JSON.parse(readFileSync(env.ACCEPTANCE_SCENARIOS_FILE, 'utf8')),
      );
      for (const scenario of plan)
        for (const step of scenario.steps)
          if (
            step.kind === 'provider' &&
            env[step.origin] &&
            target.providerOrigins?.[step.origin] !== env[step.origin]
          )
            throw new Error('PROVIDER_ORIGIN_INVENTORY_MISMATCH');
    }
    if (flags.includes('--preflight')) {
      report.add('target.preflight', 'PASS', 'NONE', 'CONFIGURATION_PRESENT');
      process.exitCode = 0;
      report.finish(inventory);
      return;
    }
    verifyMarker(env, target);
    report.environment = 'staging';
    report.projectFingerprint = sha(env.ACCEPTANCE_PROJECT_REF);
    report.releaseSha = target.releaseSha;
    report.add(
      'target.marker',
      'PASS',
      'NONE',
      'REMOTE_STAGING_MARKER_VERIFIED',
    );
    const reference = JSON.parse(
      readFileSync('scripts/acceptance/schema-reference.json', 'utf8'),
    );
    const migration = verifyMigrations(env, reference);
    report.migrationState = {
      ...migration,
      latestVersion: reference.migrations.at(-1).version,
      referenceChecksum: sha(JSON.stringify(reference)),
    };
    report.add(
      'migration.read-only',
      'PASS',
      'NONE',
      'HISTORY_AND_CATALOG_MATCH',
      migration,
    );
    // Readiness must be real and all three applications must be healthy.
    if (!(await probes(env, report)))
      throw new AcceptanceError(
        'APPLICATION_PREREQUISITE_FAILED',
        'EXTERNAL_DEPENDENCY',
      );
    sb = new Supabase(env);
    if (flags.includes('--provision')) {
      const organizations = await provision(env, target, sb);
      const state = { ...target, organizations };
      const path = resolve(
        '.tools/acceptance',
        report.runId,
        'provisioned-target.json',
      );
      // Report directory is created below. Only UUIDs/public inventory are written.
      report.add(
        'target.provision',
        'PASS',
        'NONE',
        'REAL_IDENTITIES_AND_ORGANIZATIONS_PROVISIONED',
        { organizationA: organizations.A, organizationB: organizations.B },
      );
      report.finish(inventory);
      writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
      await sb.logoutAll();
      process.exitCode = 2;
      return;
    }
    const fixtureRows = verifyFixtures(env, target);
    env.ACCEPTANCE_ORG_A_NAME = fixtureRows.find(
      (r) => r.id === env.ACCEPTANCE_ORG_A_ID,
    ).name;
    report.add(
      'target.fixtures',
      'PASS',
      'NONE',
      'REGISTERED_ACCEPTANCE_TENANTS_VERIFIED',
    );
    if (flags.includes('--cleanup')) {
      await runCheck(report, 'cleanup.organizations-archived', () =>
        archive(env, target, sb),
      );
      report.add(
        'cleanup.resources',
        'BLOCKED',
        'ENVIRONMENT_LIMITATION',
        'IMMUTABLE_HISTORY_REQUIRES_DISPOSABLE_RESTORE',
      );
    } else if (flags.includes('--performance')) {
      await measure(env, report, target);
    } else {
      if (!(await authChecks(sb, report)))
        throw new AcceptanceError(
          'IDENTITY_PREREQUISITE_FAILED',
          'CONFIGURATION_FAILURE',
        );
      await isolation(sb, report);
      // Provider-specific steps use real HTTPS endpoints and explicit assertions.
      // Missing plans never become PASS because local substitutes exist.
      await scenarioChecks(env, sb, report);
      await browserChecks(env, report);
      await recoveryChecks(env, sb, report, target);
      if (target.performance?.length) await measure(env, report, target);
    }
  } catch (e) {
    const failureCodes = new Set([
      'PROTECTED_MIGRATION_DRIFT',
      'LOCAL_REFERENCE_MIGRATION_DRIFT',
      'HOSTED_MIGRATION_HISTORY_DRIFT',
      'HOSTED_CATALOG_DRIFT',
      'GENERATED_TYPES_REFERENCE_DRIFT',
    ]);
    report.add(
      'target.execution',
      failureCodes.has(e.message) ? 'FAIL' : 'BLOCKED',
      e.category ??
        (failureCodes.has(e.message)
          ? 'CODE_FAILURE'
          : 'CONFIGURATION_FAILURE'),
      e instanceof AcceptanceError || failureCodes.has(e.message)
        ? e.message
        : 'TARGET_OR_PLAN_VERIFICATION_FAILED',
      e.evidence ?? {},
    );
  } finally {
    if (sb)
      await runCheck(report, 'auth.session-cleanup', () => sb.logoutAll());
  }
  missingCoverage(report);
  process.exitCode = report.finish(inventory);
}
// Never let an exception render a credential-bearing stack or provider body.
main().catch(() => {
  console.log('ACCEPTANCE_INTERNAL_FAILURE');
  process.exitCode = 1;
});
