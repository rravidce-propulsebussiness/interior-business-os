import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { groups } from './config.mjs';

// Reports contain an allowlisted vocabulary and sanitized numeric/UUID evidence.
// Never persist provider bodies, exceptions, URLs, headers, cookies or credentials.
export class Report {
  constructor(environment, env = {}) {
    this.runId = randomUUID();
    this.environment = 'unverified';
    this.requestedEnvironment =
      environment === 'staging' ? 'staging' : 'unverified';
    this.startedAt = new Date().toISOString();
    this.checks = [];
    this.secrets = new Set(
      Object.entries(env)
        .filter(
          ([name, value]) =>
            /PASSWORD|TOKEN|SECRET|PRIVATE|SIGNING_KEY/.test(name) &&
            typeof value === 'string' &&
            value.length >= 8 &&
            !name.includes('PUBLISHABLE'),
        )
        .map(([, value]) => value),
    );
    for (const [name, value] of Object.entries(env))
      if (name.endsWith('DATABASE_URL')) {
        try {
          const password = decodeURIComponent(new URL(value).password);
          if (password.length >= 8) this.secrets.add(password);
        } catch {
          /* Configuration diagnostics never include URL values. */
        }
      }
  }
  add(test, result, category, reason, evidence = {}) {
    if (
      !/^[a-z0-9_.-]+$/.test(test) ||
      !['PASS', 'FAIL', 'BLOCKED', 'NOT APPLICABLE'].includes(result) ||
      !/^[A-Z_]+$/.test(category) ||
      !/^[A-Z0-9_]+$/.test(reason)
    )
      throw new Error('INVALID_RESULT_RECORD');
    const safe = {};
    for (const [key, value] of Object.entries(evidence)) {
      if (
        ![
          'httpStatus',
          'requests',
          'userId',
          'organizationA',
          'organizationB',
          'migrations',
          'protectedMigrations',
          'catalogObjects',
          'assertions',
          'steps',
          'missing',
          'durationMs',
          'executed',
          'blocked',
          'organizationsArchived',
          'samples',
          'p50Ms',
          'p95Ms',
          'p99Ms',
          'messageId',
          'executionId',
          'reportId',
          'pdfId',
          'migrationVersion',
          'checksum',
        ].includes(key)
      )
        continue;
      if (
        (typeof value === 'number' && Number.isFinite(value)) ||
        typeof value === 'boolean' ||
        (typeof value === 'string' &&
          (/^[0-9a-f-]{36}$/.test(value) ||
            /^[0-9a-f]{64}$/.test(value) ||
            /^[0-9]{14}$/.test(value)))
      )
        if (!this.secrets.has(String(value))) safe[key] = value;
    }
    this.checks.push({
      test,
      environment: this.environment,
      projectFingerprint: this.projectFingerprint ?? null,
      releaseSha: this.releaseSha ?? null,
      timestamp: new Date().toISOString(),
      result,
      category,
      failureReason: result === 'PASS' ? null : reason,
      evidence: safe,
      evidenceReference: `${this.runId}/results.json#${this.checks.length}`,
    });
    console.log(`${test}: ${result} (${reason})`);
  }
  finish(preflight = []) {
    for (const group of groups)
      if (
        !this.checks.some(
          (c) => c.test === group || c.test.startsWith(group + '.'),
        )
      )
        this.add(
          group,
          'BLOCKED',
          'ENVIRONMENT_LIMITATION',
          'HOSTED_PROCEDURE_NOT_EXECUTED',
        );
    const output = {
      title: 'HOSTED ACCEPTANCE SUMMARY',
      runId: this.runId,
      environment: this.environment,
      requestedEnvironment: this.requestedEnvironment,
      projectFingerprint: this.projectFingerprint ?? null,
      releaseSha: this.releaseSha ?? null,
      releaseCandidate: this.releaseCandidate ?? null,
      testerId: this.secrets.has(this.testerId)
        ? null
        : (this.testerId ?? null),
      releaseOwnerId: this.secrets.has(this.releaseOwnerId)
        ? null
        : (this.releaseOwnerId ?? null),
      migrationState: this.migrationState ?? null,
      deploymentReleaseVerified: false,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      productionStatus: 'NO-GO',
      preflight,
      checks: this.checks,
    };
    const directory = resolve('.tools/acceptance', this.runId);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      resolve(directory, 'results.json'),
      JSON.stringify(output, null, 2) + '\n',
    );
    writeFileSync(
      resolve(directory, 'report.md'),
      `# HOSTED ACCEPTANCE SUMMARY\n\nRun: ${this.runId}\n\nEnvironment: ${this.environment}\n\nRC: ${output.releaseCandidate ?? 'unverified'}\n\nSource commit: ${output.releaseSha ?? 'unverified'}\n\nTester / release owner: ${output.testerId ?? 'unassigned'} / ${output.releaseOwnerId ?? 'unassigned'}\n\nMigration state: ${output.migrationState?.latestVersion ?? 'unverified'}\n\nDeployed artifact provenance: unverified; requires actual provider evidence.\n\nProduction: **NO-GO**. This runner cannot certify a release by itself.\n\n| Test | Timestamp (UTC) | Result | Category | Reason | Evidence |\n| --- | --- | --- | --- | --- | --- |\n${this.checks.map((c) => `| ${c.test} | ${c.timestamp} | ${c.result} | ${c.category} | ${c.failureReason ?? 'EXPECTED_RESULT_OBSERVED'} | results.json#${this.checks.indexOf(c)} |`).join('\n')}\n`,
    );
    console.log(
      `Artifacts: .tools/acceptance/${this.runId}/results.json and report.md`,
    );
    return this.checks.some((c) => c.result === 'FAIL')
      ? 1
      : this.checks.some((c) => c.result === 'BLOCKED')
        ? 2
        : 0;
  }
}
