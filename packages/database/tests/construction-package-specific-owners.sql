\set ON_ERROR_STOP on
begin;
do $verify$
begin
  if has_function_privilege('anon','public.construction_package_owner_options(uuid)','EXECUTE')
  or not has_function_privilege('authenticated','public.construction_package_owner_options(uuid)','EXECUTE')
  then raise exception 'Owner options incorrectly exposed'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='private'
    and table_name='construction_quote_package_designs'
    and column_name='allowed_owner_ids'
  ) then raise exception 'Selected owner list column missing'; end if;
  raise notice 'PASS: owner selection requires authenticated pricing permissions';
end $verify$;
insert into private.construction_quote_packages(
  organization_id,name,code,description,rate_per_sqft,status,created_by
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Owner ACL test (rollback)','OWNER-ACL-TEST','Not for sale',1950,
  'inactive','11111111-1111-4111-8111-111111111111'
)
returning id \gset
select set_config('app.test_package_id', :'id', true);
insert into private.construction_quote_package_designs(
  organization_id,package_id,visibility,allowed_owner_ids
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  :'id','owner_only',
  array['22222222-2222-4222-8222-222222222222']::uuid[]
);
select set_config(
  'request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true
);
do $check$
begin
  if not private.can_view_construction_package(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_setting('app.test_package_id')::uuid
  ) then raise exception 'Creator lost access'; end if;
end $check$;
select set_config(
  'request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true
);
do $check$
begin
  if not private.can_view_construction_package(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_setting('app.test_package_id')::uuid
  ) then raise exception 'Selected owner has no access'; end if;
end $check$;
select set_config(
  'request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true
);
do $check$
begin
  if private.can_view_construction_package(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',current_setting('app.test_package_id')::uuid
  ) then raise exception 'Unselected owner can view owner-only package'; end if;
  raise notice 'PASS: only creator and explicitly selected owners may read';
end $check$;
rollback;
