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
insert into public.invoices select (jsonb_populate_record(null::public.invoices,to_jsonb(i)||jsonb_build_object('id',gen_random_uuid(),'invoice_number','PERF-I-'||n))).* from generate_series(1,1000)n cross join lateral(select * from public.invoices where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' limit 1)i;
analyze public.invoices;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set local role authenticated;
do $$declare started timestamptz=clock_timestamp();result jsonb;begin
result=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','billing','{"from":"2020-01-01","to":"2029-12-31"}');
perform pg_temp.fin_assert((result->>'total')::integer>=1000 and jsonb_array_length(result->'rows')=25,'large invoice report stays paginated');
raise notice 'PERFORMANCE 1000 invoices: % ms',round(extract(epoch from clock_timestamp()-started)*1000);
end$$;reset role;rollback;`,
  ),
);
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
console.log(
  psql(
    [],
    execution +
      '\n' +
      operations +
      '\n' +
      readFileSync(file('tests/reporting-performance.sql'), 'utf8'),
  ),
);
