\set ON_ERROR_STOP on
begin;

create function private.propulse_sync_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAILED: %', label; end if;
 raise notice 'PASS: %', label;
end $$;
create function private.propulse_sync_denied(query text,label text)
returns void language plpgsql as $$
begin
 begin
   execute query;
 exception when sqlstate '42501' then
   raise notice 'PASS: %',label;
   return;
 end;
 raise exception 'FAILED: %',label;
end $$;

insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000091','pro-sync-a@example.test',now()),
 ('00000000-0000-4000-8000-000000000092','pro-sync-b@example.test',now()),
 ('00000000-0000-4000-8000-000000000093','pro-sync-third@example.test',now());
insert into auth.identities(user_id,provider,identity_data) values
 ('00000000-0000-4000-8000-000000000091','custom:propulse-business','{"sub":"propulse:9101","email_verified":true}'),
 ('00000000-0000-4000-8000-000000000092','custom:propulse-business','{"sub":"propulse:9102","email_verified":true}'),
 ('00000000-0000-4000-8000-000000000093','custom:propulse-business','{"sub":"propulse:9103","email_verified":true}');

-- The callback calls this with a server-only Supabase credential; a normal
-- authenticated account must never be able to forge a company snapshot.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select private.propulse_sync_denied(
  $$select public.propulse_company_import('00000000-0000-4000-8000-000000000091','propulse:9101','{"name":"Fake","source_id":"9101","services":[],"locations":[]}')$$,
  'browser role cannot call service-only import');
reset role;

select private.propulse_sync_denied(
  $$select public.propulse_company_import('00000000-0000-4000-8000-000000000092','propulse:9101','{"name":"Wrong Account","source_id":"9101","services":[],"locations":[]}')$$,
  'mismatched ProPulse subject cannot grant another user ownership');

select public.propulse_company_import(
 '00000000-0000-4000-8000-000000000091','propulse:9101',
 '{"source_id":"9101","name":"Verified Interiors","description":"Trusted company",
 "phone":"9123456789","industries":["interior"],
 "services":[{"industry":"Interior Design","service":"Modular Kitchens"}],
 "locations":[{"city":"Hyderabad","state":"Telangana"}]}'
) as first_result \gset

select private.propulse_sync_assert(
  (:'first_result'::jsonb->>'status')='created'
  and exists(select 1 from public.organizations
    where id = (:'first_result'::jsonb->>'organizationId')::uuid
    and created_by = '00000000-0000-4000-8000-000000000091'),
  'verified ProPulse business gets its own tenant');
select private.propulse_sync_assert(
  exists(
    select 1 from public.organization_memberships m
    join public.membership_roles mr on mr.membership_id=m.id
    join public.roles r on r.id=mr.role_id and r.is_owner
    where m.organization_id = (:'first_result'::jsonb->>'organizationId')::uuid
      and m.user_id = '00000000-0000-4000-8000-000000000091'
      and m.status='active'
  ), 'ProPulse identity receives the Owner role');
select private.propulse_sync_assert(
  exists(select 1 from private.propulse_company_links
    where propulse_subject='propulse:9101' and membership_managed)
  and not private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'projects'),
  'new ProPulse company starts with no unrestricted project access');

-- Only the service role can apply a provider-verified membership assertion.
set local role authenticated;
select private.propulse_sync_denied(
  format('select public.propulse_membership_sync(%L::uuid,%L,%L::uuid,%L,%L::timestamptz)',
    '00000000-0000-4000-8000-000000000091','propulse:9101',
    (:'first_result'::jsonb->>'organizationId'),'scale',
    (now()+interval '30 days')::text),
  'browser cannot forge ProPulse Scale membership');
reset role;
select public.propulse_membership_sync(
  '00000000-0000-4000-8000-000000000091','propulse:9101',
  (:'first_result'::jsonb->>'organizationId')::uuid,'growth',
  now()+interval '30 days') as growth_result \gset
select private.propulse_sync_assert(
  (:'growth_result'::jsonb->>'tier')='growth'
  and private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'website')
  and not private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'projects'),
  'Growth grants website hosting only');
select private.propulse_sync_assert(
  (private.website_config((:'first_result'::jsonb->>'organizationId')::uuid)->>'template_only')='true'
  and (private.website_config((:'first_result'::jsonb->>'organizationId')::uuid)->>'custom_domain')='true'
  and (private.website_config((:'first_result'::jsonb->>'organizationId')::uuid)->>'forms')='true'
  and (private.website_config((:'first_result'::jsonb->>'organizationId')::uuid)->>'custom_code')='false',
  'Growth effective config allows hosted templates, custom domain and enquiries without code');
select public.propulse_membership_sync(
  '00000000-0000-4000-8000-000000000091','propulse:9101',
  (:'first_result'::jsonb->>'organizationId')::uuid,'scale',
  now()+interval '30 days');
select private.propulse_sync_assert(
  private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'projects')
  and private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'website'),
  'Scale unlocks complete Business OS modules');
select private.propulse_sync_assert(
  (private.website_config((:'first_result'::jsonb->>'organizationId')::uuid)->>'template_only')='false'
  and (private.website_config((:'first_result'::jsonb->>'organizationId')::uuid)->>'custom_domain')='true',
  'Scale effective config allows full website builder and custom domains');
select public.propulse_membership_sync(
  '00000000-0000-4000-8000-000000000091','propulse:9101',
  (:'first_result'::jsonb->>'organizationId')::uuid,'none',null);
select private.propulse_sync_assert(
  not private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'projects')
  and not private.entitled((:'first_result'::jsonb->>'organizationId')::uuid,'website'),
  'expired subscription revokes only tier-managed module access');
select private.propulse_sync_assert(
 (select count(*) = 1 from private.propulse_company_links
  where propulse_subject='propulse:9101'),
 'only one external-company link exists');

select public.propulse_company_import(
 '00000000-0000-4000-8000-000000000091','propulse:9101',
 '{"source_id":"9101","name":"Verified Interiors Updated","description":"New ProPulse description",
 "phone":"9123456789","industries":["construction","interior"],
 "services":[{"industry":"Construction","service":"Civil Works"}],
 "locations":[]}'
) as second_result \gset
select private.propulse_sync_assert(
  (:'second_result'::jsonb->>'organizationId')=(:'first_result'::jsonb->>'organizationId')
  and (:'second_result'::jsonb->>'status')='updated'
  and (select name from public.organizations
     where id=(:'first_result'::jsonb->>'organizationId')::uuid)='Verified Interiors Updated',
  'repeat sign-in updates the same tenant, not a duplicate');
select private.propulse_sync_assert(
  (select count(*)=2 from public.organization_industries
   where organization_id=(:'first_result'::jsonb->>'organizationId')::uuid),
  'new industry is added without replacing previous industries');

-- Manual OS company-name edits must not be overwritten by ProPulse sync.
update public.organizations set name='Manually Renamed'
 where id=(:'first_result'::jsonb->>'organizationId')::uuid;
select public.propulse_company_import(
 '00000000-0000-4000-8000-000000000091','propulse:9101',
 '{"source_id":"9101","name":"Source Renamed Again","description":"Latest",
 "phone":"","industries":[],"services":[],"locations":[]}'
);
select private.propulse_sync_assert(
  (select name='Manually Renamed' from public.organizations
   where id=(:'first_result'::jsonb->>'organizationId')::uuid),
  'manual company name takes precedence over source updates');

-- When a matching company is already owned, link it instead of cloning it.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select public.create_organization(
 '{"name":"Already Owned Construction","slug":"already-owned-propulse-sync-b",
 "currency":"INR","country":"IN","timezone":"Asia/Kolkata"}'
) as existing_org \gset
reset role;
select public.propulse_company_import(
 '00000000-0000-4000-8000-000000000092','propulse:9102',
 '{"source_id":"9102","name":"Already Owned Construction",
 "description":"","phone":"","industries":["construction"],
 "services":[],"locations":[]}'
) as link_result \gset
select private.propulse_sync_assert(
 (:'link_result'::jsonb->>'status')='linked_existing'
 and (:'link_result'::jsonb->>'organizationId')=:'existing_org',
 'exact matching owner company is reused');
select public.propulse_membership_sync(
  '00000000-0000-4000-8000-000000000092','propulse:9102',
  (:'link_result'::jsonb->>'organizationId')::uuid,'scale',
  now()+interval '30 days') as linked_membership_result \gset
select private.propulse_sync_assert(
  (:'linked_membership_result'::jsonb->>'status')='existing_company_unmodified',
  'linking an already owned company does not overwrite separate paid plans');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select private.propulse_sync_assert(
 public.propulse_company_profile((:'first_result'::jsonb->>'organizationId')::uuid)->>'description'='Latest',
 'owner can read their imported company details');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select private.propulse_sync_denied(
 format('select public.propulse_company_profile(%L::uuid)',
 (:'first_result'::jsonb->>'organizationId')),
 'other company cannot read ProPulse snapshot');
reset role;

-- Platform review toggle still works; auto-import never bypasses a required review.
update private.company_onboarding_policy set approval_required=true where singleton=true;
select public.propulse_company_import(
 '00000000-0000-4000-8000-000000000093','propulse:9103',
 '{"source_id":"9103","name":"New Review Required",
 "description":"","phone":"","industries":[],"services":[],"locations":[]}'
) as review_result \gset
select private.propulse_sync_assert(
 (:'review_result'::jsonb->>'status')='review_required'
 and not exists(select 1 from private.propulse_company_links
                where propulse_subject='propulse:9103'),
 'mandatory review stops automatic tenant creation');
rollback;
