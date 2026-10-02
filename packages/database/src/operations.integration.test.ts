import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'verifies physical execution, inventory, subcontract certification and tenant boundaries',
  () => {
    const result = spawnSync(
      process.execPath,
      ['packages/database/scripts/test-operations.mjs'],
      { encoding: 'utf8', env: process.env, timeout: 90000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      'PASS: site ledger distinguishes consumption return and scrap',
    );
    expect(result.stderr).toContain(
      'PASS: operational completion succeeds after approved handover',
    );
    expect(result.stderr).toContain(
      'PASS: Site cannot bypass cost policy through search',
    );
  },
  100000,
);
