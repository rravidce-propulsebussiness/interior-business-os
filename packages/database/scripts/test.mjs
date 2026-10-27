import { psql, file } from './postgres.mjs';
console.log(psql(['-f', file('tests/isolation.sql')]));
console.log(psql(['-f', file('tests/company-applications.sql')]));
console.log(psql(['-f', file('tests/self-service-companies.sql')]));
console.log(psql(['-f', file('tests/propulse-company-sync.sql')]));
console.log(psql(['-f', file('tests/employee-invitations.sql')]));
console.log(psql(['-f', file('tests/employee-invite-codes.sql')]));
console.log(psql(['-f', file('tests/catalog.sql')]));
console.log(psql(['-f', file('tests/quotation-studio-defaults.sql')]));
console.log(psql(['-f', file('tests/quotation-owner-access.sql')]));
console.log(psql(['-f', file('tests/quotation-signing-preflight.sql')]));
console.log(
  psql(['-f', file('tests/construction-pricing-rpc-transactions.sql')]),
);
console.log(psql(['-f', file('tests/construction-package-design.sql')]));
console.log(
  psql(['-f', file('tests/construction-package-specific-owners.sql')]),
);
console.log(psql(['-f', file('tests/quotations.sql')]));
console.log(psql(['-f', file('tests/crm-starter-defaults.sql')]));
console.log(psql(['-f', file('tests/crm.sql')]));
console.log(psql(['-f', file('tests/finance.sql')]));
console.log(psql(['-f', file('tests/project-agreement.sql')]));
console.log(psql(['-f', file('tests/construction-project-workflows.sql')]));
console.log(psql(['-f', file('tests/construction-stage-record-links.sql')]));
console.log(psql(['-f', file('tests/quote-project-timeline.sql')]));
console.log(psql(['-f', file('tests/execution.sql')]));
await import('./test-operations.mjs');

await import('./test-website.mjs');
await import('./test-brochure.mjs');
await import('./test-automation.mjs');
await import('./test-reporting.mjs');
console.log(psql(['-f', file('tests/deployment.sql')]));
