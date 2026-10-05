-- A data-free invoker RPC lets readiness exercise PostgREST -> PostgreSQL
-- without granting anonymous access to any application table or private helper.
begin;
create function public.deployment_readiness() returns boolean
language sql stable security invoker set search_path = ''
as $$ select true $$;
revoke all on function public.deployment_readiness() from public;
grant execute on function public.deployment_readiness() to anon, authenticated;
commit;
