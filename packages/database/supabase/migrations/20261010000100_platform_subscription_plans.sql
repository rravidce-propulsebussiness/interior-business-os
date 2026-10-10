-- Phase 1: create selectable platform subscription plans without mutating
-- current organization billing, entitlements or existing plan memberships.
begin;
create function public.platform_plan_create(p_input jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $fn$
declare
  new_plan uuid;
  plan_key text;
  plan_name text;
  module_keys text[];
begin
  perform private.require_platform('platform.entitlements.manage');
  if jsonb_typeof(p_input) is distinct from 'object'
    or jsonb_typeof(p_input->'modules') is distinct from 'array'
    or jsonb_array_length(p_input->'modules') not between 1 and 25 then
    raise exception 'Invalid subscription configuration' using errcode='22023';
  end if;
  plan_key := trim(coalesce(p_input->>'key',''));
  plan_name := trim(coalesce(p_input->>'name',''));
  if length(plan_key) not between 3 and 60
    or plan_key !~ '^[a-z][a-z0-9_]*$'
    or length(plan_name) not between 3 and 100 then
    raise exception 'Invalid plan identifier/name' using errcode='22023';
  end if;
  select array_agg(distinct key order by key) into module_keys
  from jsonb_array_elements_text(p_input->'modules') as v(key);
  if cardinality(module_keys) <> jsonb_array_length(p_input->'modules')
    or exists (
      select 1 from unnest(module_keys) as v(key)
      where not exists (select 1 from public.modules m
        where m.key=v.key and m.status='active')
    ) then
    raise exception 'Invalid, repeated or inactive modules' using errcode='22023';
  end if;
  insert into public.plans(key,name,status) values(plan_key,plan_name,'active')
    returning id into new_plan;
  insert into public.plan_modules(plan_id,module_id)
    select new_plan,m.id from public.modules m
    where m.key = any(module_keys);
  if (select count(*) from public.plan_modules where plan_id=new_plan)
    <> cardinality(module_keys) then
    raise exception 'Incomplete subscription modules' using errcode='22023';
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'platform.plan.created','plan',new_plan::text,
      jsonb_build_object('moduleKeys',module_keys,'planKey',plan_key));
  return new_plan;
end
$fn$;
revoke all on function public.platform_plan_create(jsonb) from public, anon;
grant execute on function public.platform_plan_create(jsonb) to authenticated;
commit;
