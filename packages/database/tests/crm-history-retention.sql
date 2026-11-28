\set ON_ERROR_STOP on
-- Disposable database only; every inserted/deleted row is rolled back.
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $test$
declare
  org uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  expired uuid := gen_random_uuid();
  recent uuid := gen_random_uuid();
  active_lead uuid := gen_random_uuid();
  source uuid;
  stage uuid;
begin
  select id into source from public.lead_sources where organization_id = org limit 1;
  select id into stage from public.crm_pipeline_stages
    where organization_id = org and outcome = 'open' limit 1;
  insert into public.leads(id, organization_id, lead_number, name, phone, source_id, stage_id, lifecycle, archived_at)
  values
    (expired, org, 'TEST-RETENTION-EXPIRED', 'TEST ONLY — expired lead', '+919999990001', source, stage, 'archived', now() - interval '8 days'),
    (recent, org, 'TEST-RETENTION-RECENT', 'TEST ONLY — recoverable lead', '+919999990002', source, stage, 'archived', now() - interval '6 days'),
    (active_lead, org, 'TEST-RETENTION-ACTIVE', 'TEST ONLY — active lead', '+919999990003', source, stage, 'open', null);
  insert into public.lead_activities(organization_id, lead_id, activity_type, subject)
    select org, id, 'note', 'Retention regression' from public.leads
    where id in (expired, recent, active_lead);

  -- The old global flag must not bypass append-only history protection.
  perform set_config('app.lead_purge', 'on', true);
  begin
    delete from public.lead_activities where lead_id = active_lead;
    raise exception 'FAIL: legacy purge flag allowed active history deletion';
  exception when sqlstate '23514' then
    raise notice 'PASS: legacy purge flag cannot delete active lead history';
  end;

  perform set_config('business_os.retention_lead', recent::text, true);
  begin
    delete from public.lead_activities where lead_id = recent;
    raise exception 'FAIL: recent archived history deleted before expiry';
  exception when sqlstate '23514' then
    raise notice 'PASS: recoverable history remains append-only before expiry';
  end;

  perform set_config('business_os.retention_lead', '', true);
  perform private.purge_expired_archived_leads();
  if exists (select 1 from public.leads where id = expired)
     or exists (select 1 from public.lead_activities where lead_id = expired) then
    raise exception 'FAIL: expired archived lead or history was not purged';
  end if;
  if (select count(*) from public.leads where id in (recent, active_lead)) <> 2
     or (select count(*) from public.lead_activities where lead_id in (recent, active_lead)) <> 2 then
    raise exception 'FAIL: purge touched active or recoverable leads';
  end if;
  if current_setting('business_os.retention_lead', true) <> '' then
    raise exception 'FAIL: purge left its history exception enabled';
  end if;
  if has_function_privilege('authenticated', 'private.purge_expired_archived_leads()', 'execute')
     or has_function_privilege('anon', 'private.purge_expired_archived_leads()', 'execute') then
    raise exception 'FAIL: retention purge callable by a client role';
  end if;
  raise notice 'PASS: retention removes only expired leads and restores history protection';
end;
$test$;
rollback;
