\set ON_ERROR_STOP on
begin;

create function pg_temp.crm_starter_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

-- The demo tenant is created after migrations. Its INSERT trigger must have
-- provided usable defaults before the optional development CRM seed runs.
do $check$
declare
  v_org uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_source uuid;
  v_stage uuid;
  v_sources_before integer;
  v_stages_before integer;
begin
  perform pg_temp.crm_starter_assert(
    (select count(*) = 1 from public.lead_sources
      where organization_id = v_org and key = 'manual' and active),
    'new organization has an active Manual Entry lead source');
  perform pg_temp.crm_starter_assert(
    (select count(*) = 1 from public.crm_pipeline_stages
      where organization_id = v_org and key = 'new' and active and outcome = 'open'),
    'new organization has an active New pipeline stage');
  perform pg_temp.crm_starter_assert(
    (select count(*) >= 3 from public.lead_sources
      where organization_id = v_org),
    'starter manual, sheet and ProPulse sources are available');
  perform pg_temp.crm_starter_assert(
    (select count(*) >= 6 from public.crm_pipeline_stages
      where organization_id = v_org),
    'default pipeline stages exist without requiring a sheet import');

  select id into v_source from public.lead_sources
    where organization_id = v_org and key = 'manual';
  select id into v_stage from public.crm_pipeline_stages
    where organization_id = v_org and key = 'new';
  select count(*) into v_sources_before from public.lead_sources
    where organization_id = v_org;
  select count(*) into v_stages_before from public.crm_pipeline_stages
    where organization_id = v_org;
  perform private.crm_seed_starter_defaults(v_org);
  perform private.crm_seed_starter_defaults(v_org);
  perform pg_temp.crm_starter_assert(
    (select count(*) = v_sources_before from public.lead_sources
      where organization_id = v_org)
    and (select count(*) = v_stages_before from public.crm_pipeline_stages
      where organization_id = v_org)
    and (select id = v_source from public.lead_sources
      where organization_id = v_org and key = 'manual')
    and (select id = v_stage from public.crm_pipeline_stages
      where organization_id = v_org and key = 'new'),
    'repeated initialization does not duplicate or replace starter records');

  update public.lead_sources set active = false
    where organization_id = v_org and key = 'manual';
  perform private.crm_seed_starter_defaults(v_org);
  perform pg_temp.crm_starter_assert(
    (select active = false from public.lead_sources
      where organization_id = v_org and key = 'manual'),
    'owners manual source deactivation is respected on reinitialization');
  update public.lead_sources set active = true
    where organization_id = v_org and key = 'manual';
end
$check$;

-- This is the same authenticated, tenant-scoped RPC used by Quick Add Lead.
set local role authenticated;
select set_config('request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111', true);

select public.crm_save(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'leads',
  jsonb_build_object(
    'name', 'Manual lead starter regression',
    'phone', '+919876500098',
    'source_id', (
      select id from public.lead_sources
      where organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        and key = 'manual'
    ),
    'stage_id', (
      select id from public.crm_pipeline_stages
      where organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
        and key = 'new'
    ),
    'source_detail', 'manual:entry',
    'location', 'Hyderabad',
    'service_type', '3BHK',
    'notes', 'Lead created without importing any sheet'
  )
) as created_lead \gset

select pg_temp.crm_starter_assert(
  exists (
    select 1 from public.leads
    where id = :'created_lead'::uuid
      and organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and service_type = '3BHK'
      and location = 'Hyderabad'
  ),
  'tenant Owner can save manual lead without importing a sheet');

rollback;
