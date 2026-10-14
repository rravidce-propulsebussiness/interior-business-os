\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
set local role authenticated;
\ir site-agreement-helper.sql

do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;contract uuid;latest uuid;new_latest uuid;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 contract=pg_temp.site_signed_agreement(org,project);
 if (public.project_agreement_read(org,project)->>'execution_authorized')<>'true'
 then raise exception 'FAIL: genuine agreement evidence not recognized';end if;
 if exists(select 1 from public.payment_requests where contract_id=contract)
 then raise exception 'FAIL: signing an agreement manufactured a payment request';end if;
 latest=(public.project_agreement_read(org,project)->>'clearance_event_id')::uuid;
 perform public.project_agreement_command(org,project,contract,'revoke',
   jsonb_build_object('previous_event_id',latest,
     'reason','The supplied signed copy is invalid and must be replaced'));
 if (public.project_agreement_read(org,project)->>'execution_authorized')<>'false'
 then raise exception 'FAIL: agreement revocation did not block site readiness';end if;
 begin
  perform public.project_agreement_command(org,project,contract,'revoke',
    jsonb_build_object('previous_event_id',latest,
      'reason','Duplicate cancellation must be rejected'));
  raise exception 'FAIL: stale revocation accepted';
 exception when serialization_failure then null;end;
 -- A manager cannot pretend to have a customer-verified cryptographic signature.
 begin
  perform public.project_agreement_command(org,project,contract,'record_signed_pdf',
    '{"media_id":"11111111-1111-4111-8111-111111111111","note":"This is not uploaded evidence"}');
  raise exception 'FAIL: forged document accepted';
 exception when insufficient_privilege then null;end;
 -- Owner-only reasoned exception restores physical readiness without inventing a signature.
 new_latest=public.project_agreement_command(org,project,contract,'owner_exception',
   '{"reason":"Emergency site safety intervention authorized by company owner; contractual paper remains pending","reference":"Owner decision file EXCEPT-2026-1"}'::jsonb);
 if new_latest is null
   or (public.project_agreement_read(org,project)->>'execution_authorized')<>'true'
   or (public.project_agreement_read(org,project)->>'clearance_type')<>'owner_exception'
 then raise exception 'FAIL: recorded owner exception not applied';end if;
 if exists(select 1 from public.payments where contract_id=contract)
 then raise exception 'FAIL: clearance created artificial receipt';end if;
 raise notice 'PASS: signed-copy evidence, revoke, owner exception, no invented payment';
end$$;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';project uuid;contract uuid;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 select id into contract from public.contracts where organization_id=org and project_id=project
 order by accepted_at desc limit 1;
 begin
  perform public.project_agreement_read(org,project);
  raise exception 'FAIL: noncommercial user saw the agreement';
 exception when insufficient_privilege then null;end;
 begin
  perform public.project_agreement_command(org,project,contract,'owner_exception',
    '{"reason":"Not permitted to self-authorize this contracting exception","reference":"Denied request reference"}'::jsonb);
  raise exception 'FAIL: unprivileged actor granted exception';
 exception when insufficient_privilege then null;end;
 begin
  perform public.project_agreement_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,project);
  raise exception 'FAIL: cross-tenant agreement disclosure';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: contract evidence is accessible only to authorized project-finance actors';
end$$;
rollback;
