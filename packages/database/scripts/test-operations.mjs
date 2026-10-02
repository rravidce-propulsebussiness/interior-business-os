import { readFileSync } from 'node:fs';
import { psql, file } from './postgres.mjs';

// Reuse the existing accepted-contract/procurement fixture and run every existing
// assertion unchanged. Keep its transaction open only for the additional suite.
const existing = readFileSync(file('tests/execution.sql'), 'utf8');
if (!/rollback;\s*$/i.test(existing))
  throw new Error('Execution fixture boundary changed');
const operations = readFileSync(file('tests/operations.sql'), 'utf8').replace(
  'do $$declare',
  () =>
    readFileSync(file('tests/operations-inventory.sql'), 'utf8') +
    '\ndo $$declare',
);
const suite = operations.replace(
  /rollback;\s*$/i,
  () =>
    readFileSync(file('tests/operations-security.sql'), 'utf8') + '\nrollback;',
);
console.log(psql([], existing.replace(/rollback;\s*$/i, '') + '\n' + suite));
