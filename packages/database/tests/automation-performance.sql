begin;
set local statement_timeout='120s';
create temporary table perf_ids as select gen_random_uuid() event_id,gen_random_uuid() execution_id,gen_random_uuid() job_id,n from generate_series(1,10000)n;
insert into public.automation_events(id,organization_id,event_type,entity_kind,entity_id,actor_id,dedupe_key,dispatched_at)
select p.event_id,r.organization_id,'lead.created','lead',l.id,r.run_as,'performance:'||p.n,now() from perf_ids p cross join lateral(select * from public.automation_rules order by created_at limit 1)r cross join lateral(select id from public.leads where organization_id=r.organization_id order by created_at limit 1)l;
insert into public.automation_executions(id,organization_id,rule_id,rule_version_id,event_id,status,completed_at)
select p.execution_id,r.organization_id,r.id,v.id,p.event_id,'succeeded',now() from perf_ids p cross join lateral(select * from public.automation_rules order by created_at limit 1)r join public.automation_rule_versions v on v.rule_id=r.id and v.version=r.version;
insert into public.automation_jobs(id,organization_id,execution_id,action_index,action,run_at,status,completed_at)
select p.job_id,e.organization_id,p.execution_id,0,'{}',now(),'succeeded',now() from perf_ids p join public.automation_executions e on e.id=p.execution_id;
insert into public.notifications(organization_id,recipient_id,event_id,job_id,category,priority,title)
select e.organization_id,'11111111-1111-4111-8111-111111111111',p.event_id,p.job_id,'crm','normal','Performance fixture' from perf_ids p join public.automation_events e on e.id=p.event_id;
insert into public.leads(organization_id,lead_number,name,phone,source_id,stage_id)
select l.organization_id,'PERFORMANCE-'||n,'Performance lead '||n,'+1203'||lpad(n::text,7,'0'),l.source_id,l.stage_id from generate_series(1,10000)n cross join lateral(select * from public.leads order by created_at limit 1)l;
analyze public.notifications;analyze public.automation_events;analyze public.automation_executions;analyze public.leads;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set local role authenticated;
do $$declare started timestamptz;result jsonb;begin
 started=clock_timestamp();result=public.notifications_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'unread');
 if jsonb_array_length(result->'rows')<>25 or (result->>'total')::integer<10000 then raise exception 'Incorrect notification pagination';end if;
 raise notice 'PERFORMANCE notifications 10000 rows: % ms, % response bytes',round(extract(epoch from clock_timestamp()-started)*1000),octet_length(result::text);
 started=clock_timestamp();result=public.automation_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','history',1);
 if jsonb_array_length(result->'rows')<>25 or (result->>'total')::integer<10000 then raise exception 'Incorrect execution pagination';end if;
 raise notice 'PERFORMANCE executions 10000 rows: % ms, % response bytes',round(extract(epoch from clock_timestamp()-started)*1000),octet_length(result::text);
 started=clock_timestamp();result=public.report_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd','crm','{"from":"2020-01-01","to":"2029-12-31"}');
 if jsonb_array_length(result->'rows')<>25 or (result->>'total')::integer<10000 then raise exception 'Incorrect report pagination';end if;
 raise notice 'PERFORMANCE CRM 10000 sources: % ms, % response bytes',round(extract(epoch from clock_timestamp()-started)*1000),octet_length(result::text);
end$$;
reset role;
rollback;
