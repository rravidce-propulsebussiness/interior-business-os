import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'verifies canonical reports, snapshots and source authorization',
  () => {
    const result = spawnSync(
      process.execPath,
      ['packages/database/scripts/test-reporting.mjs'],
      { encoding: 'utf8', env: process.env, timeout: 90000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      'PASS: other tenant cannot export billing report',
    );
  },
  100000,
);
