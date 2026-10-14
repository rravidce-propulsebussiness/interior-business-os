\set ON_ERROR_STOP on
begin;
do $check$
declare definition text;
begin
  select pg_get_functiondef('public.construction_package_save(uuid,jsonb)'::regprocedure)
    into definition;
  if definition not like '%Invalid plan deliverable%'
    or definition not like '%Invalid custom field%'
  then
    raise exception 'Package save must validate customizable drawing and field schema';
  end if;
  if has_table_privilege('anon',
      'private.construction_quote_package_designs','SELECT')
  then
    raise exception 'Package specification JSON exposed outside its company';
  end if;
  raise notice 'PASS: versioned package specification fields validated';
end $check$;
rollback;
