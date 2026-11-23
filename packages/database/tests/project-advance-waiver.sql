\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
set local role authenticated;
\ir site-agreement-helper.sql

-- The owner may let work proceed before the design advance is received
-- (cash given offline, client paying later). The waiver is owner-only,
-- needs a reason and never fabricates a receipt.
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;contract uuid;readiness jsonb;result jsonb;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 contract=pg_temp.site_signed_agreement(org,project);
 readiness=public.project_agreement_read(org,project);
 if readiness->>'execution_authorized'<>'false' or readiness->>'advance_waived'<>'false'
 then raise exception 'FAIL: unpaid advance must block site work before any waiver';end if;
 begin
  perform public.project_advance_waive(org,project,'too short');
  raise exception 'FAIL: waiver without a real reason accepted';
 exception when invalid_parameter_value then null;end;
 result=public.project_advance_waive(org,project,
   'TEST ONLY — client paid the design advance in cash; owner allows work to start');
 readiness=public.project_agreement_read(org,project);
 if (result->>'waived')::integer<1 or readiness->>'advance_waived'<>'true'
   or readiness->>'execution_authorized'<>'true'
 then raise exception 'FAIL: owner waiver did not clear the advance gate';end if;
 if exists(select 1 from public.payments where contract_id=contract)
 then raise exception 'FAIL: advance waiver created an artificial receipt';end if;
 raise notice 'PASS: owner can waive the design advance with a reason and no fake receipt';
end$$;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';project uuid;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 begin
  perform public.project_advance_waive(org,project,
    'Not the owner, trying to skip the advance payment');
  raise exception 'FAIL: non-owner waived the advance';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: only the company owner can waive the advance';
end$$;
rollback;
