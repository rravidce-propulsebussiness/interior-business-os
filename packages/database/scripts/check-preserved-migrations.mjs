import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { file } from './postgres.mjs';

const expected = JSON.parse(
  readFileSync(file('supabase/preserved-migrations.json'), 'utf8'),
);
if (Object.keys(expected).length !== 89)
  throw new Error('Expected 89 preserved Phase 0–9 migrations');
for (const [name, hash] of Object.entries(expected)) {
  const actual = createHash('sha256')
    .update(readFileSync(file(`supabase/migrations/${name}`)))
    .digest('hex');
  if (actual !== hash) throw new Error(`Preserved migration changed: ${name}`);
}
console.log('All 89 Phase 0–9 migration hashes match the Phase 10 baseline.');
