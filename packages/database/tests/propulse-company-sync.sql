\set ON_ERROR_STOP on
begin;
-- The disposable CI auth shim has auth.users but not GoTrue auth.identities.
create table if not exists auth.identities (
 user_id uuid not null references auth.users(id),
 provider text not null,
 identity_data jsonb not null
);
create function private.propulse_assert(ok boolean,label text)
returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAILED: %',label;end if;
 raise notice 'PASS: %',label;
end $$;
create function private.propulse_denied(command text,label text)
returns void language plpgsql as $$
begin
 begin execute command;
 exception when sqlstate '42501' then
   raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000091','propulse-one@example.test',now()),
 ('00000000-0000-4000-8000-000000000092','propulse-two@example.test',now());
insert into auth.identities(user_id,provider,identity_data) values
 ('00000000-0000-4000-8000-000000000091','custom:propulse-business',
  '{"sub":"propulse:80091","email_verified":true}'),
 ('00000000-0000-4000-8000-000000000092','custom:propulse-business',
  '{"sub":"propulse:80092","email_verified":true}');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select private.propulse_denied(
 $$select public.company_propulse_sync('{"sub":"propulse:80092","company":{"source_id":"11","name":"Other business"}}')$$,
 'user cannot claim another verified ProPulse identity');
select public.company_propulse_sync(
 '{"sub":"propulse:80091","company":{"source_id":"9","name":"Original ProPulse Interiors","description":"First business profile","phone":"9000000000","services":[{"industry":"Interior Design","service":"Design"}],"locations":[{"city":"Hyderabad","state":"Telangana"}]}}'
) as synced \gset
select private.propulse_assert(
 (:'synced'::jsonb->>'status')='approved',
 'verified ProPulse owner gets company without another registration');
select private.propulse_assert(
 exists (select 1 from public.organizations o
  join public.organization_memberships m on m.organization_id=o.id
  join public.membership_roles mr on mr.membership_id=m.id
  join public.roles r on r.id=mr.role_id and r.is_owner
  where o.id=(:'synced'::jsonb->>'organizationId')::uuid
    and o.created_by='00000000-0000-4000-8000-000000000091'
    and m.user_id=o.created_by and m.status='active'),
 'import creates an active Owner membership only for identity owner');
select private.propulse_assert(
 exists(select 1 from public.organization_propulse_profiles
  where organization_id=(:'synced'::jsonb->>'organizationId')::uuid
  and phone='9000000000' and services->0->>'industry'='Interior Design'
  and locations->0->>'city'='Hyderabad'),
 'company phone, services, locations are synchronized');
select public.company_propulse_sync(
 '{"sub":"propulse:80091","company":{"source_id":"9","name":"Updated ProPulse Interiors","description":"Updated profile","phone":"9000000001","services":[{"industry":"Interior Design","service":"Design"}],"locations":[{"city":"Hyderabad","state":"Telangana"}]}}'
) as resynced \gset
select private.propulse_assert(
 (:'resynced'::jsonb->>'organizationId')=(:'synced'::jsonb->>'organizationId')
 and (select count(*) from public.organizations
      where created_by='00000000-0000-4000-8000-000000000091')=1
 and (select name from public.organizations where id=(:'synced'::jsonb->>'organizationId')::uuid)
     ='Updated ProPulse Interiors',
 'repeat sign-in updates existing workspace without duplication');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select private.propulse_assert(
 not private.is_member((:'synced'::jsonb->>'organizationId')::uuid),
 'other ProPulse account cannot read or join the first company');
select private.propulse_denied(
 $$select public.company_propulse_sync('{"sub":"propulse:80091","company":{"source_id":"9","name":"Stolen"}}')$$,
 'a second account cannot seize a linked ProPulse company');
rollback;
