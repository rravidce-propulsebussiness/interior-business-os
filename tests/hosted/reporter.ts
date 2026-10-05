import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
// Deliberately no error messages, attachments, title inputs, stdout or traces.
export default class SafeReporter implements Reporter {
  private rows: {
    index: number;
    result: string;
    reason: string;
    durationMs: number;
    group: string;
    applicable: boolean;
  }[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    const wrongApp =
      test.parent.project()?.name !== 'business-app' &&
      !test.location.file.endsWith('live-auth.spec.ts');
    const status =
      result.status === 'passed'
        ? 'PASS'
        : result.status === 'skipped'
          ? wrongApp
            ? 'NOT APPLICABLE'
            : 'BLOCKED'
          : 'FAIL';
    this.rows.push({
      index: this.rows.length,
      result: status,
      reason:
        status === 'PASS'
          ? 'HOSTED_BROWSER_EXECUTED'
          : status === 'NOT APPLICABLE'
            ? 'WRONG_APPLICATION'
            : status === 'BLOCKED'
              ? 'LIVE_FIXTURE_PREREQUISITE_MISSING'
              : 'HOSTED_BROWSER_ASSERTION_FAILED',
      durationMs: result.duration,
      group:
        (
          {
            'live-auth.spec.ts': 'live-auth',
            'live-catalog.spec.ts': 'live-catalog',
            'live-crm.spec.ts': 'live-crm',
            'live-quotations.spec.ts': 'live-quotation',
            'live-finance.spec.ts': 'live-finance',
            'live-execution.spec.ts': 'live-execution',
            'live-operations.spec.ts': 'live-operations',
            'live-automation.spec.ts': 'live-automation',
            'live-brochures.spec.ts': 'live-brochure',
          } as Record<string, string>
        )[basename(test.location.file)] ?? 'unknown',
      applicable: !wrongApp,
    });
  }
  onEnd() {
    const file = process.env.ACCEPTANCE_BROWSER_RESULT!;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(this.rows, null, 2) + '\n');
  }
}
