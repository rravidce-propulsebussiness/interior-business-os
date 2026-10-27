-- Execute after all migrations, inside the canonical SQL test harness.
begin;
do $$
declare
  tier text;
  amount integer;
  config jsonb;
begin
  foreach tier in array array['website_basic','propulse_growth','propulse_scale'] loop
    if not exists(select 1 from public.plans where key=tier and status='active') then
      raise exception 'Missing plan: %', tier;
    end if;
    select count(*) into amount from public.plan_modules pm
      join public.plans p on p.id=pm.plan_id
      join public.modules m on m.id=pm.module_id
      where p.key=tier and m.key='website';
    if amount<>1 then raise exception 'Website entitlement missing for %',tier; end if;
    select l.configuration into config from public.website_plan_limits l
      join public.plans p on p.id=l.plan_id where p.key=tier;
    if config->>'custom_domain' <> 'true' then
      raise exception 'Custom domain connection unavailable for %',tier;
    end if;
  end loop;
  foreach tier in array array['website_basic','propulse_growth'] loop
    if exists (select 1 from public.plan_modules pm
      join public.plans p on p.id=pm.plan_id
      join public.modules m on m.id=pm.module_id
      where p.key=tier and m.key <> 'website') then
      raise exception 'Website-only plan includes non-website module: %',tier;
    end if;
  end loop;
  if not exists(select 1 from public.plan_modules pm
    join public.plans p on p.id=pm.plan_id
    join public.modules m on m.id=pm.module_id
    where p.key='propulse_scale' and m.key='projects') then
    raise exception 'Scale does not include project management';
  end if;
end $$;
rollback;
