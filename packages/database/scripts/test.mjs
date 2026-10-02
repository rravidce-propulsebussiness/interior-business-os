import { psql, file } from './postgres.mjs';
console.log(psql(['-f', file('tests/isolation.sql')]));
console.log(psql(['-f', file('tests/catalog.sql')]));
console.log(psql(['-f', file('tests/quotations.sql')]));
console.log(psql(['-f', file('tests/crm.sql')]));
console.log(psql(['-f', file('tests/finance.sql')]));
console.log(psql(['-f', file('tests/execution.sql')]));
await import('./test-operations.mjs');

await import('./test-website.mjs');
