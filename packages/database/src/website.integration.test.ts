import { spawnSync } from 'node:child_process';
import { it, expect } from 'vitest';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'verifies website publishing, CRM ingress, domain ownership and tenant isolation',
  () => {
    const r = spawnSync(
      process.execPath,
      ['packages/database/scripts/test-website.mjs'],
      { encoding: 'utf8', env: process.env, timeout: 90000 },
    );
    expect(r.error).toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('PASS: website developer denied finance');
    expect(r.stderr).toContain(
      'PASS: website draft does not replace public version',
    );
  },
  100000,
);
