\set ON_ERROR_STOP on
begin;
create function pg_temp.studio_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
  raise notice 'PASS: %', message;
end $$;

-- New organization settings must use THEIR OWN name, not the demo or another
-- tenant's identity. Exercise actual INSERT trigger, not a fake quote row.
with source as (
 select created_by,plan_id from public.organizations
 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
)
insert into public.organizations(
 name,slug,status,default_currency,country_code,default_timezone,created_by,plan_id
)
select 'Independent Builder','studio-new-builder-test','active','INR','IN',
       'Asia/Kolkata',created_by,plan_id
from source;

select pg_temp.studio_assert(
  exists(
    select 1 from public.organization_quotation_settings settings
    join public.organizations organization
      on organization.id=settings.organization_id
    where organization.slug='studio-new-builder-test'
      and settings.branding->>'name'='Independent Builder'
      and settings.branding->>'logo_data_uri'=''
      and settings.branding->>'accent'='#2563EB'
      and settings.prefix='Q'
  ), 'new tenants receive their OWN default quotation branding');

select pg_temp.studio_assert(
  (select count(*)=1 from public.organization_quotation_settings settings
    join public.organizations o on o.id=settings.organization_id
    where o.slug='studio-new-builder-test'),
  'only one set of quotation defaults per company');

do $repeat$
declare org uuid;
begin
 select id into org from public.organizations where slug='studio-new-builder-test';
 perform private.seed_company_quotation_settings(org);
 perform private.seed_company_quotation_settings(org);
end
$repeat$;

select pg_temp.studio_assert(
  (select count(*)=1 from public.organization_quotation_settings settings
    join public.organizations o on o.id=settings.organization_id
    where o.slug='studio-new-builder-test'),
  'reapplying defaults cannot create duplicates');

select pg_temp.studio_assert(
  not has_table_privilege('authenticated','public.organization_quotation_settings','INSERT')
  and not has_table_privilege('authenticated','public.quotation_studio_attachments','SELECT')
  and not has_table_privilege('anon','public.quotation_studio_attachments','SELECT'),
  'tenant branding and annexures require authorized RPC/server operations');

rollback;
