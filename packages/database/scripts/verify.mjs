import { readdirSync } from 'node:fs';
import { psql, file, ensureTooling } from './postgres.mjs';
import './check-preserved-migrations.mjs';
ensureTooling();
// Race fixtures need the same fresh schema/seeds, not a nested copy of every regression.
// The default db:verify command still executes the full canonical assertion suite.
const initializeOnly = process.argv.includes('--initialize-only');
const assertionFile = (name) => {
  if (!initializeOnly) console.log(psql(['-f', file(`tests/${name}.sql`)]));
};
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
assertionFile('isolation');
assertionFile('company-applications');
assertionFile('employee-invitations');
// This file creates the documented demo organization required by later seeds.
// Its fixture setup must run even when nested regression execution is omitted.
console.log(psql(['-f', file('tests/development-seed.sql')]));
psql(['-f', file('supabase/seed-catalog.sql')]);
psql(['-f', file('supabase/seed-catalog.sql')]);
assertionFile('marketplace');
assertionFile('platform-companies');
assertionFile('platform-users');
assertionFile('gst-billing');
console.log('Interior catalog seed is repeatable.');
assertionFile('catalog');
psql(['-f', file('supabase/seed-commercial.sql')]);
psql(['-f', file('supabase/seed-commercial.sql')]);
console.log('Commercial demo seed is repeatable.');
assertionFile('project-delivery');
assertionFile('project-manager');
assertionFile('quotations');
psql(['-f', file('supabase/seed-crm.sql')]);
psql(['-f', file('supabase/seed-crm.sql')]);
console.log('CRM demo seed is repeatable.');
assertionFile('crm');
psql(['-f', file('supabase/seed-finance.sql')]);
psql(['-f', file('supabase/seed-finance.sql')]);
console.log('Finance demo configuration seed is repeatable.');
assertionFile('finance');
psql(['-f', file('supabase/seed-execution.sql')]);
psql(['-f', file('supabase/seed-execution.sql')]);
console.log('Execution demo masters are repeatable.');
assertionFile('execution');
if (!initializeOnly) await import('./test-operations.mjs');
psql(['-f', file('supabase/seed-operations.sql')]);
psql(['-f', file('supabase/seed-operations.sql')]);
console.log('Operations starter configuration is repeatable.');

if (!initializeOnly) {
  await import('./test-website.mjs');
  await import('./test-brochure.mjs');
  await import('./test-automation.mjs');
  await import('./test-reporting.mjs');
  assertionFile('deployment');
} else {
  console.log(
    'Fresh schema/seed initialization only; no regression PASS is claimed.',
  );
}
