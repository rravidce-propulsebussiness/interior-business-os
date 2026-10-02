import { readdirSync } from 'node:fs';
import { psql, file, ensureTooling } from './postgres.mjs';
ensureTooling();
if (process.env.ALLOW_TEST_DATABASE_RESET !== 'yes')
  throw new Error(
    'Set ALLOW_TEST_DATABASE_RESET=yes for a NEW disposable test database. This script never drops schemas.',
  );
if (
  psql([
    '-Atc',
    "select count(*) from pg_tables where schemaname in ('public','auth')",
  ]) !== '0'
)
  throw new Error(
    'Refusing to initialize a nonempty database. Create a new disposable database.',
  );
psql(['-f', file('tests/bootstrap.sql')]);
for (const migration of readdirSync(file('supabase/migrations'))
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  psql(['-f', file(`supabase/migrations/${migration}`)]);
  console.log(`Applied ${migration}`);
}
psql(['-f', file('supabase/seed.sql')]);
psql(['-f', file('supabase/seed.sql')]);
console.log('Development catalog seed is repeatable.');
console.log(psql(['-f', file('tests/isolation.sql')]));
console.log(psql(['-f', file('tests/development-seed.sql')]));
psql(['-f', file('supabase/seed-catalog.sql')]);
psql(['-f', file('supabase/seed-catalog.sql')]);
console.log('Interior catalog seed is repeatable.');
console.log(psql(['-f', file('tests/catalog.sql')]));
psql(['-f', file('supabase/seed-commercial.sql')]);
psql(['-f', file('supabase/seed-commercial.sql')]);
console.log('Commercial demo seed is repeatable.');
console.log(psql(['-f', file('tests/quotations.sql')]));
psql(['-f', file('supabase/seed-crm.sql')]);
psql(['-f', file('supabase/seed-crm.sql')]);
console.log('CRM demo seed is repeatable.');
console.log(psql(['-f', file('tests/crm.sql')]));
psql(['-f', file('supabase/seed-finance.sql')]);
psql(['-f', file('supabase/seed-finance.sql')]);
console.log('Finance demo configuration seed is repeatable.');
console.log(psql(['-f', file('tests/finance.sql')]));
psql(['-f', file('supabase/seed-execution.sql')]);
psql(['-f', file('supabase/seed-execution.sql')]);
console.log('Execution demo masters are repeatable.');
console.log(psql(['-f', file('tests/execution.sql')]));
await import('./test-operations.mjs');
psql(['-f', file('supabase/seed-operations.sql')]);
psql(['-f', file('supabase/seed-operations.sql')]);
console.log('Operations starter configuration is repeatable.');

await import('./test-website.mjs');
