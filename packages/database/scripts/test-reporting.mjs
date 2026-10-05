import { readFileSync } from 'node:fs';
import { psql, file } from './postgres.mjs';
const finance = readFileSync(file('tests/finance.sql'), 'utf8').replace(
  /rollback;\s*$/i,
  '',
);
console.log(
  psql(
    [],
    finance +
      `
reset role;
select pg_temp.fin_assert(exists(select 1 from public.automation_events where event_type='invoice.created'),'trusted canonical invoice event captured');
select pg_temp.fin_assert(exists(select 1 from public.automation_events where event_type='payment.received'),'trusted canonical payment event captured');
select pg_temp.fin_assert(exists(select 1 from public.automation_events where event_type='change_order.awaiting_action'),'trusted canonical change-order event captured');
rollback;`,
  ),
);
// Exercise reports with the accepted contract, procurement and physical ledger fixtures.
const execution = readFileSync(file('tests/execution.sql'), 'utf8').replace(
  /rollback;\s*$/i,
  '',
);
const operations = readFileSync(file('tests/operations.sql'), 'utf8')
  .replace(
    'do $$declare',
    () =>
      readFileSync(file('tests/operations-inventory.sql'), 'utf8') +
      '\ndo $$declare',
  )
  .replace(/rollback;\s*$/i, '');
const reporting = readFileSync(file('tests/reporting.sql'), 'utf8').replace(
  /^begin;/,
  '',
);
console.log(
  psql(
    [],
    execution +
      '\n' +
      operations +
      '\n' +
      readFileSync(file('tests/automation-domains.sql'), 'utf8') +
      '\n' +
      reporting,
  ),
);
