begin;
create function pg_temp.report_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;end$$;
create function pg_temp.report_denied(statement text,label text) returns void language plpgsql as $$begin execute statement;raise exception 'FAIL: %',label;exception when insufficient_privilege or invalid_parameter_value then raise notice 'PASS: %',label;end$$;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set local role authenticated;
do $$declare kind text;report jsonb;snapshot uuid;project uuid;filters jsonb='{"from":"2020-01-01","to":"2029-12-31"}';begin
 foreach kind in array array['crm','sales','billing','receivables','projects','procurement','execution','snags','handover','subcontractors'] loop
 report=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',kind,filters);
 perform pg_temp.report_assert(jsonb_typeof(report->'rows')='array' and (report->>'total')::integer>=0,kind||' report executes against canonical schema');
 snapshot=public.report_snapshot_create('dddddddd-dddd-4ddd-8ddd-dddddddddddd',kind,filters);
 perform pg_temp.report_assert((select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(public.report_snapshot_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',snapshot)#>'{data,rows}') with ordinality where ordinality<=25)=report->'rows' and jsonb_array_length(public.report_snapshot_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',snapshot)#>'{data,rows}')=(report->>'total')::integer,kind||' snapshot retains complete source projection and first page');
 end loop;
 select project_id into project from public.execution_plans where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' order by created_at desc limit 1;
 perform pg_temp.report_assert(project is not null,'report fixture contains canonical execution project');
 report=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','inventory',filters||jsonb_build_object('projectId',project));
 perform pg_temp.report_assert(report->'rows'=public.operations_materials('dddddddd-dddd-4ddd-8ddd-dddddddddddd',project)->'rows','material report exactly reconciles canonical physical ledger');
 report=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cost',filters||jsonb_build_object('projectId',project));
 perform pg_temp.report_assert(report->'rows'=public.operations_costs('dddddddd-dddd-4ddd-8ddd-dddddddddddd',project)->'rows','cost report exactly reconciles canonical execution basis');
 foreach kind in array array['inventory','cost'] loop
 snapshot=public.report_snapshot_create('dddddddd-dddd-4ddd-8ddd-dddddddddddd',kind,filters||jsonb_build_object('projectId',project));
 perform pg_temp.report_assert(public.report_snapshot_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',snapshot)->>'kind'=kind,kind||' export revalidates live source permissions');
 end loop;
 perform pg_temp.report_denied($q$select public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','crm','{"from":"2026-10-03","to":"2026-10-01"}')$q$,'reversed report dates rejected');
 perform pg_temp.report_denied($q$select public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','crm','{"from":"2026-10-01","to":"2026-10-03","sql":"select *"}')$q$,'arbitrary report query rejected');
 perform pg_temp.report_denied($q$select public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','inventory','{"from":"2026-10-01","to":"2026-10-03"}')$q$,'cumulative material report requires project');
 perform pg_temp.report_assert(jsonb_typeof(public.work_queue('dddddddd-dddd-4ddd-8ddd-dddddddddddd','assigned',1)->'rows')='array','authorized canonical work queue executes');
 perform pg_temp.report_assert(jsonb_typeof(public.management_dashboard('dddddddd-dddd-4ddd-8ddd-dddddddddddd',filters)->'reports')='object','management summary executes with source permissions');
end$$;
reset role;
-- Force a second page even on a clean seed database; test the complete export, not only page one.
insert into public.projects select (jsonb_populate_record(null::public.projects,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'code','PH11B-PAGE-'||n,'name','Recovery verification project '||n))).* from generate_series(1,31)n cross join lateral(select * from public.projects where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' limit 1)p;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set local role authenticated;
do $$declare report jsonb;snapshot uuid;exported jsonb;begin
 report=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','projects','{"from":"2020-01-01","to":"2029-12-31"}');
 perform pg_temp.report_assert((report->>'total')::integer>25 and jsonb_array_length(report->'rows')=25,'multi-page snapshot fixture exceeds one page');
 snapshot=public.report_snapshot_create('dddddddd-dddd-4ddd-8ddd-dddddddddddd','projects','{"from":"2020-01-01","to":"2029-12-31"}');
 exported=public.report_snapshot_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',snapshot)#>'{data,rows}';
 perform pg_temp.report_assert(jsonb_array_length(exported)=(report->>'total')::integer,'multi-page snapshot exports every authorized source');
 perform pg_temp.report_assert((select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from jsonb_array_elements(exported) with ordinality where ordinality<=25)=report->'rows','multi-page snapshot preserves first-page ordering');
 perform pg_temp.report_assert((select count(distinct value->>'id') from jsonb_array_elements(exported))=(report->>'total')::integer,'multi-page snapshot has no duplicated or missing source IDs');
end$$;
reset role;
select pg_temp.report_assert(not has_table_privilege('authenticated','public.report_snapshots','INSERT'),'browser cannot fabricate report snapshots');
select pg_temp.report_assert(not has_table_privilege('authenticated','public.report_snapshots','UPDATE'),'browser cannot rewrite saved report data');
set local request.jwt.claim.sub='55555555-5555-4555-8555-555555555555';set local role authenticated;
select pg_temp.report_assert((select count(*)=0 from public.report_snapshots),'other tenant cannot read report snapshots');
select pg_temp.report_denied($q$select public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','billing','{"from":"2026-10-01","to":"2026-10-03"}')$q$,'other tenant cannot export billing report');
select pg_temp.report_denied($q$select public.work_queue('dddddddd-dddd-4ddd-8ddd-dddddddddddd','all',1)$q$,'other tenant cannot read work queue');
reset role;
select set_config('test.cost_snapshot',(select id::text from public.report_snapshots where kind='cost' limit 1),true);
delete from public.role_permissions where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and permission_id=(select id from public.permissions where key='estimate.view_cost');
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set local role authenticated;
select pg_temp.report_denied(format('select public.report_snapshot_read(%L,%L)','dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_setting('test.cost_snapshot')),'saved cost report rechecks revoked estimate cost permission');
reset role;
rollback;

