begin;
create function pg_temp.site_v2_assert(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %',label;end if;
  raise notice 'PASS: %',label;
end$$;
create function pg_temp.site_v2_denied(statement text, label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception
    when insufficient_privilege or check_violation or invalid_parameter_value
      or serialization_failure or unique_violation then
      raise notice 'PASS: %',label;return;
  end;
  raise exception 'FAIL: %',label;
end$$;

-- Limit changes are performed by test setup, never by the authenticated tenant.
insert into public.organization_entitlements(
  organization_id,module_id,enabled,source,configuration
)
select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',id,true,'manual',
  '{"sites":1,"pages":100,"custom_domain":true,"custom_code":false,"developer_mode":false}'::jsonb
from public.modules where key='website'
on conflict(organization_id,module_id,source)
do update set enabled=true,configuration=excluded.configuration;

select set_config('test.site_v2_document',/*DOCUMENT*/::text,true);
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set local role authenticated;

do $$
declare
  org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  doc jsonb=current_setting('test.site_v2_document')::jsonb;
  site uuid;
  source jsonb;
begin
  site=public.website_project_create(
    org,'My new website','v2-site-primary',doc,'template','construction',
    null,'main','other'
  );
  perform set_config('test.site_v2_first',site::text,true);
  source=public.website_project_list(org);
  perform pg_temp.site_v2_assert(jsonb_array_length(source)>=1,
    'source list returns the authorized site');
  perform pg_temp.site_v2_assert(
    exists(select 1 from public.website_project_sources
      where website_id=site and source_kind='template'),
    'site creation writes source metadata atomically');
  perform pg_temp.site_v2_assert(
    (select count(*) from public.website_domains
      where website_id=site and kind='subdomain')<=1,
    'creating one site cannot create multiple managed subdomain records');
  perform pg_temp.site_v2_denied(
    format('select public.website_project_create(%L,%L,%L,%L,%L,%L)',
      org,'Second site','v2-site-denied',doc,'template','corporate'),
    'one-site quota denies a second site');
  perform pg_temp.site_v2_denied(
    format('select public.website_project_create(%L,%L,%L,%L,%L,%L)',
      org,'Bad source','v2-site-unsafe',doc,'repository',null),
    'repository source requires a URL');
end$$;
reset role;

update public.organization_entitlements
set configuration=jsonb_set(configuration,'{sites}','2'::jsonb,true)
where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  and source='manual'
  and module_id=(select id from public.modules where key='website');

set local role authenticated;
do $$
declare
  org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  doc jsonb=current_setting('test.site_v2_document')::jsonb;
  site uuid;
  new_version integer;
  source jsonb;
begin
  site=public.website_project_create(
    org,'Additional authorized site','v2-site-extra',doc,'repository',null,
    'https://github.com/company/repo','main','python'
  );
  perform pg_temp.site_v2_assert(site is not null,
    'higher manual entitlement authorizes a second website');
  new_version=public.website_project_configure(
    org,site,1,'https://github.com/company/new-repo','main','node',
    'https://example.com'
  );
  perform pg_temp.site_v2_assert(new_version=2,
    'source change advances optimistic version');
  perform pg_temp.site_v2_denied(
    format('select public.website_project_configure(%L,%L,1,%L,%L,%L)',
      org,site,'https://github.com/company/stale','main','node'),
    'stale source settings reject overwrites');
  perform pg_temp.site_v2_denied(
    format('select public.website_project_configure(%L,%L,2,%L,%L,%L)',
      org,site,'https://github.com/x/r?token=secret','main','node'),
    'Git credentials and query tokens cannot be stored as a source URL');
  source=public.website_project_list(org);
  perform pg_temp.site_v2_assert(
    exists(select 1 from jsonb_array_elements(source) x
      where x->>'websiteId'=site::text and x->>'framework'='node'),
    'authorized source list shows updated independent framework');
  perform pg_temp.site_v2_denied(
    format('select public.website_project_create(%L,%L,%L,%L,%L,%L)',
      gen_random_uuid(),'Unauthorized','v2-other-org',doc,'template','corporate'),
    'cross-business site creation denied');
end$$;

rollback;
