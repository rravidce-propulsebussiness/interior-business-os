\set ON_ERROR_STOP on
begin;
create function private.propulse_assert(ok boolean,label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function private.propulse_denied(query text,label text)
returns void language plpgsql as $$
begin
  begin execute query;
  exception when sqlstate '42501' then
    raise notice 'PASS: %',label;
    return;
  end;
  raise exception 'FAILED: %',label;
end $$;

insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-000000000091','propulse-a@example.test',now()),
('00000000-0000-4000-8000-000000000092','propulse-b@example.test',now()),
('00000000-0000-4000-8000-000000000093','unverified-propulse@example.test',null);

insert into auth.identities(user_id,provider,identity_data) values
('00000000-0000-4000-8000-000000000091','custom:propulse-business','{"sub":"propulse:601"}'),
('00000000-0000-4000-8000-000000000092','custom:propulse-business','{"sub":"propulse:602"}'),
('00000000-0000-4000-8000-000000000093','custom:propulse-business','{"sub":"propulse:603"}');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select private.propulse_denied($$select public.propulse_company_sync(
 '00000000-0000-4000-8000-000000000091','propulse:601','propulse-a@example.test',
 '{"source_id":"801","name":"Denied Direct Company","services":[],"locations":[],"industryKeys":[]}'
)$$,'regular user cannot provision via privileged company sync');

set local role service_role;
select public.propulse_company_sync(
 '00000000-0000-4000-8000-000000000091','propulse:601','propulse-a@example.test',
 '{"source_id":"801","name":"ProPulse Interiors","description":"Premium projects","phone":"9990001234","services":[{"industry":"Interior Design","service":"Modular kitchen"}],"locations":[{"city":"Hyderabad","state":"Telangana"}],"industryKeys":["interior"]}'
) as synced \gset
reset role;

select private.propulse_assert(
 (:'synced'::jsonb->>'status')='created',
 'verified OAuth owner provisions one Business OS workspace');
select private.propulse_assert(
 (select count(*)=1 from public.organization_memberships m
  join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id
  join public.roles r on r.id=mr.role_id and r.is_owner
  where m.user_id='00000000-0000-4000-8000-000000000091'
    and m.organization_id=(:'synced'::jsonb->>'organizationId')::uuid
    and m.status='active'),
 'ProPulse verified owner gets tenant Owner role');
select private.propulse_assert(
 (select count(*)=1 from public.organization_industries i
  join public.industries ind on ind.id=i.industry_id and ind.key='interior'
  where i.organization_id=(:'synced'::jsonb->>'organizationId')::uuid),
 'imports only supported company industry');

set local role service_role;
select public.propulse_company_sync(
 '00000000-0000-4000-8000-000000000091','propulse:601','propulse-a@example.test',
 '{"source_id":"801","name":"ProPulse Interiors Renamed","description":"Updated profile","phone":"9990001234","services":[],"locations":[],"industryKeys":["interior"]}'
) as updated \gset
reset role;
select private.propulse_assert(
 (:'updated'::jsonb->>'status')='updated' and
 (:'updated'::jsonb->>'organizationId')=(:'synced'::jsonb->>'organizationId'),
 'repeat login updates the same company, not a duplicate');
select private.propulse_assert(
 (select name='ProPulse Interiors Renamed' from public.organizations
  where id=(:'synced'::jsonb->>'organizationId')::uuid),
 'company name refreshes from verified ProPulse profile');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select private.propulse_denied(
 format('select public.propulse_company_link_mine(%L::uuid)',(:'synced'::jsonb->>'organizationId')),
 'another tenant cannot see imported contact and profile data');
set local role service_role;
select private.propulse_denied($$select public.propulse_company_sync(
 '00000000-0000-4000-8000-000000000092','propulse:602','propulse-b@example.test',
 '{"source_id":"801","name":"ProPulse Interiors Renamed","services":[],"locations":[],"industryKeys":[]}'
)$$,'another verified identity cannot take over an already-linked source ID');
select private.propulse_denied($$select public.propulse_company_sync(
 '00000000-0000-4000-8000-000000000093','propulse:603','unverified-propulse@example.test',
 '{"source_id":"803","name":"Unverified Business","services":[],"locations":[],"industryKeys":[]}'
)$$,'unverified email cannot provision company');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select public.company_self_register(
 '{"name":"Different Existing Company","slug":"different-existing-company","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["construction"]}'
) as existing \gset
set local role service_role;
select public.propulse_company_sync(
 '00000000-0000-4000-8000-000000000092','propulse:602','propulse-b@example.test',
 '{"source_id":"802","name":"Unrelated ProPulse Company","services":[],"locations":[],"industryKeys":[]}'
) as refused \gset
reset role;
select private.propulse_assert(
 (:'refused'::jsonb->>'status')='needs_selection'
 and not exists(select 1 from public.organizations where slug='propulse-company-802'),
 'different owned company requires confirmation instead of duplication');

rollback;
