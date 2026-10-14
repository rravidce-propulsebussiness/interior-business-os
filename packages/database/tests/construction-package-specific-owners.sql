\set ON_ERROR_STOP on
begin;

-- All construction packages are tenant-scoped and company-wide. Neither
-- prior owner-only values nor non-empty ACL arrays may be saved.
do $check$
declare constrained boolean;
begin
  select exists (
    select 1 from pg_constraint
    where conrelid='private.construction_quote_package_designs'::regclass
      and conname='construction_quote_package_designs_visibility_check'
      and pg_get_constraintdef(oid) like '%company%'
  ) into constrained;
  if not constrained then
    raise exception 'Company-only visibility constraint missing';
  end if;
end $check$;

insert into private.construction_quote_packages (
  organization_id,name,code,description,rate_per_sqft,status,created_by
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Company only regression','COMPANY-ONLY-ACL','Scoped to one company',
  1950,'inactive','11111111-1111-4111-8111-111111111111'
) returning id \gset
select set_config('app.test_package_id', :'id', true);
insert into private.construction_quote_package_designs (
  organization_id,package_id,visibility,allowed_owner_ids
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'id','company','{}'::uuid[]
);

do $check$
declare rejected boolean := false;
begin
  begin
    update private.construction_quote_package_designs
    set visibility='owner_only'
    where package_id=current_setting('app.test_package_id')::uuid;
  exception when check_violation then rejected:=true;
  end;
  if not rejected then
    raise exception 'Legacy restricted scope still accepted';
  end if;
  rejected := false;
  begin
    update private.construction_quote_package_designs
    set allowed_owner_ids=array['22222222-2222-4222-8222-222222222222']::uuid[]
    where package_id=current_setting('app.test_package_id')::uuid;
  exception when check_violation then rejected:=true;
  end;
  if not rejected then
    raise exception 'Legacy user ACL still accepted';
  end if;
end $check$;

select set_config(
  'request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true
);
set local role authenticated;
do $assert$
declare
  r jsonb;
  rejected boolean := false;
begin
  if not private.can_view_construction_package(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    current_setting('app.test_package_id')::uuid
  ) then
    raise exception 'Company member with pricing permission cannot see package';
  end if;
  if private.can_view_construction_package(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    current_setting('app.test_package_id')::uuid
  ) then
    raise exception 'Other company can view this package';
  end if;
  r := public.construction_package_list('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  if not exists (
    select 1 from jsonb_array_elements(r) row
    where row->>'code'='COMPANY-ONLY-ACL'
  ) then raise exception 'Package missing from company list'; end if;

  begin
    perform public.construction_package_save(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      jsonb_build_object(
        'name','Forbidden restricted package',
        'code','INVALID-OWNER','ratePerSqft','1950',
        'status','inactive','description','Should be rejected',
        'themeColor','#155EEF','specSections','[]'::jsonb,
        'visibility','owner_only','ownerIds','[]'::jsonb
      )
    );
  exception when sqlstate '22023' then rejected := true;
  end;
  if not rejected then
    raise exception 'Owner-only RPC input still accepted';
  end if;
  raise notice 'PASS: same-company packages only; no restricted settings';
end $assert$;

rollback;
