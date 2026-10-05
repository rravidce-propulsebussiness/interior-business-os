import { spawnSync } from 'node:child_process';
import { it, expect } from 'vitest';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'verifies independent brochures, immutable PDFs, canonical enquiries and tenant boundaries',
  () => {
    const r = spawnSync(
      process.execPath,
      ['packages/database/scripts/test-brochure.mjs'],
      { env: process.env, encoding: 'utf8', timeout: 90000 },
    );
    expect(r.error).toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('PASS: Brochure enabled with Website disabled');
    expect(r.stderr).toContain('PASS: historical PDF bytes immutable');
  },
  100000,
);
