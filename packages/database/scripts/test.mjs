import { psql, file } from './postgres.mjs';
console.log(psql(['-f', file('tests/isolation.sql')]));
console.log(psql(['-f', file('tests/company-applications.sql')]));
console.log(psql(['-f', file('tests/catalog.sql')]));
console.log(psql(['-f', file('tests/quotations.sql')]));
console.log(psql(['-f', file('tests/crm.sql')]));
console.log(psql(['-f', file('tests/finance.sql')]));
console.log(psql(['-f', file('tests/execution.sql')]));
await import('./test-operations.mjs');

await import('./test-website.mjs');
await import('./test-brochure.mjs');
await import('./test-automation.mjs');
await import('./test-reporting.mjs');
console.log(psql(['-f', file('tests/deployment.sql')]));
