import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'verifies transactional automation, recipient permissions and email leases',
  () => {
    const result = spawnSync(
      process.execPath,
      ['packages/database/scripts/test-automation.mjs'],
      { encoding: 'utf8', env: process.env, timeout: 90000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      'PASS: repeated worker tick creates one notification',
    );
    expect(result.stderr).toContain(
      'PASS: stale lease cannot acknowledge delivery',
    );
    expect(result.stderr).toContain(
      'PASS: email body storage is not browser readable',
    );
  },
  100000,
);
