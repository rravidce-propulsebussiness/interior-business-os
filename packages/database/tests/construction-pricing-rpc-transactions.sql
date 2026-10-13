\set ON_ERROR_STOP on
begin;

do $verify$
declare fn regprocedure; status "char";
begin
  foreach fn in array array[
    'public.construction_rate_list(uuid)'::regprocedure,
    'public.construction_package_list(uuid)'::regprocedure,
    'public.construction_rate_quote_preview(uuid,uuid[],numeric)'::regprocedure,
    'public.construction_package_quote_preview(uuid,uuid,uuid[],numeric)'::regprocedure
  ]
  loop
    select provolatile into status from pg_proc where oid=fn::oid;
    if status <> 'v' then
      raise exception 'PostgREST would execute % as read-only', fn;
    end if;
    if not has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Authenticated users cannot execute %', fn;
    end if;
    if has_function_privilege('anon',fn,'EXECUTE') then
      raise exception 'Anonymous users unexpectedly can execute %', fn;
    end if;
  end loop;
  raise notice 'PASS: construction price RPCs allow checked read/write transactions';
end
$verify$;

select set_config(
  'request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true
) is not null as owner_claim_set;
set local role authenticated;
select jsonb_typeof(public.construction_rate_list(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
))='array' as construction_rates_available;
select jsonb_typeof(public.construction_package_list(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
))='array' as construction_packages_available;

rollback;
