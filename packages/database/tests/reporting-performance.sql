-- Synthetic volume only; canonical behavior is verified by the preceding fixtures.
reset role;
set local statement_timeout='120s';
insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'code','PERF-P-'||n,'name','Performance project '||n))).* from generate_series(1,1000)n cross join lateral(select * from public.projects where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' limit 1)p;
insert into public.project_tasks select (jsonb_populate_record(null::public.project_tasks,to_jsonb(t)||jsonb_build_object('id',gen_random_uuid(),'title','Performance task '||n))).* from generate_series(1,1000)n cross join lateral(select * from public.project_tasks where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' limit 1)t;
insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id) select '11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','performance.fixture','performance',n::text from generate_series(1,10000)n;
-- Balanced adjustment pairs exercise the stock guard without draining usable stock.
do $$declare source_move public.inventory_movements;source_tx public.inventory_transactions;target uuid;n integer;begin
 select * into source_move from public.inventory_movements where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' order by created_at,id limit 1;
 select * into source_tx from public.inventory_transactions where id=source_move.transaction_id;
 for n in 1..2000 loop
 target=gen_random_uuid();
 insert into public.inventory_transactions select (jsonb_populate_record(null::public.inventory_transactions,to_jsonb(source_tx)||jsonb_build_object('id',target,'number','PERF-T-'||n,'kind','adjustment','idempotency_key',gen_random_uuid()))).*;
 insert into public.inventory_movements select (jsonb_populate_record(null::public.inventory_movements,to_jsonb(source_move)||jsonb_build_object('id',gen_random_uuid(),'transaction_id',target,'quantity',case when n%2=1 then '0.001' else '-0.001' end))).*;
 end loop;
end$$;
analyze public.projects;analyze public.project_tasks;analyze public.inventory_movements;analyze public.audit_logs;
select pg_temp.execution_assert((select count(*)>=1000 from public.projects),'large project fixture created');
select pg_temp.execution_assert((select count(*)>=1000 from public.project_tasks),'large task fixture created');
select pg_temp.execution_assert((select count(*)>=2000 from public.inventory_movements),'large inventory ledger fixture created');
select pg_temp.execution_assert((select count(*)>=10000 from public.audit_logs),'large audit fixture created');
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set local role authenticated;
do $$declare started timestamptz;result jsonb;project uuid;begin
 started=clock_timestamp();result=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','projects','{"from":"2020-01-01","to":"2029-12-31"}');
 perform pg_temp.execution_assert(jsonb_array_length(result->'rows')=25,'large projects remain paginated');
 raise notice 'PERFORMANCE 1000 projects: % ms',round(extract(epoch from clock_timestamp()-started)*1000);
 started=clock_timestamp();result=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','execution','{"from":"2020-01-01","to":"2029-12-31"}');
 perform pg_temp.execution_assert(jsonb_array_length(result->'rows')=25,'large task reports remain paginated');
 raise notice 'PERFORMANCE 1000 tasks: % ms',round(extract(epoch from clock_timestamp()-started)*1000);
 select project_id into project from public.execution_plans where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' limit 1;
 started=clock_timestamp();result=public.operations_materials('dddddddd-dddd-4ddd-8ddd-dddddddddddd',project);
 perform pg_temp.execution_assert(jsonb_typeof(result->'rows')='array','large inventory ledger aggregates through canonical service');
 raise notice 'PERFORMANCE 2000 inventory movements: % ms',round(extract(epoch from clock_timestamp()-started)*1000);
 started=clock_timestamp();perform id from public.audit_logs where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' order by created_at desc,id limit 25;
 raise notice 'PERFORMANCE 10000 audit rows page: % ms',round(extract(epoch from clock_timestamp()-started)*1000);
end$$;
reset role;
rollback;
