begin;
do $$ begin
 if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='deployment_readiness' and not p.prosecdef and p.proconfig=array['search_path=""']) then
  raise exception 'Readiness must be an invoker function with fixed search_path';
 end if;
 raise notice 'PASS: readiness uses invoker rights and fixed search_path';
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='deployment_readiness' and a.grantee=0 and a.privilege_type='EXECUTE') then
  raise exception 'Readiness must revoke default PUBLIC execution';
 end if;
 raise notice 'PASS: readiness revokes default PUBLIC execution';
end $$;
set local role anon;
do $$ begin
 if public.deployment_readiness() is distinct from true then raise exception 'Anonymous readiness failed';end if;
 raise notice 'PASS: anonymous readiness returns only a boolean';
end $$;
reset role;
set local role authenticated;
do $$ begin
 if public.deployment_readiness() is distinct from true then raise exception 'Authenticated readiness failed';end if;
 raise notice 'PASS: authenticated readiness returns only a boolean';
end $$;
rollback;
