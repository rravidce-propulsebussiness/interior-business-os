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
    if config->>'forms' <> 'true' then
      raise exception 'Website enquiry forms unavailable for %',tier;
    end if;
    if (tier in ('website_basic','propulse_growth')
      and config->>'template_only' <> 'true')
      or (tier='propulse_scale' and config->>'template_only' <> 'false') then
      raise exception 'Incorrect published template restriction for %',tier;
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
  if not exists(select 1 from public.plans p where p.key='website_unsubscribed'
    and not exists(select 1 from public.plan_modules pm where pm.plan_id=p.id))
    or not exists(select 1 from public.plans p where p.key='propulse_managed'
    and not exists(select 1 from public.plan_modules pm where pm.plan_id=p.id)) then
    raise exception 'Unverified signups must have no default module entitlements';
  end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='website_enquiries'
    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'Website enquiry inbox must have forced RLS';
  end if;
  if has_table_privilege('anon','public.website_enquiries','SELECT')
    or has_table_privilege('authenticated','public.website_enquiries','INSERT') then
    raise exception 'Website enquiry private table access is too broad';
  end if;
  if not exists(select 1 from public.plan_modules pm
    join public.plans p on p.id=pm.plan_id
    join public.modules m on m.id=pm.module_id
    where p.key='propulse_scale' and m.key='projects') then
    raise exception 'Scale does not include project management';
  end if;
end $$;
rollback;
