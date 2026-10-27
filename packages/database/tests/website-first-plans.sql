-- Execute after all migrations, inside the canonical SQL test harness.
begin;
do $$
declare
  tier text;
  amount integer;
  config jsonb;
begin
  foreach tier in array array['propulse_growth','propulse_scale'] loop
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
  if exists (select 1 from public.plan_modules pm
    join public.plans p on p.id=pm.plan_id
    where p.key='website_basic') then
    raise exception 'Website Basic assignment cannot bypass settled payment';
  end if;
  if not exists(select 1 from public.website_plan_limits l
    join public.plans p on p.id=l.plan_id
    where p.key='website_basic'
      and l.configuration->>'custom_domain'='true'
      and l.configuration->>'template_only'='true'
      and l.configuration->>'forms'='true') then
    raise exception 'Basic hosting and own-domain connection plan missing';
  end if;
  if has_function_privilege('anon',
    'public.platform_website_basic_verify_payment(uuid,text,bigint,timestamptz)',
    'EXECUTE') or not has_function_privilege('authenticated',
    'public.platform_website_basic_verify_payment(uuid,text,bigint,timestamptz)',
    'EXECUTE') then
    raise exception 'Direct Basic payment RPC grants incorrect execution';
  end if;
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='platform_website_basic_verify_payment'
        and p.prosecdef) then
    raise exception 'Manual payment verification must use privileged guarded RPC';
  end if;
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
-- Only an independently authorized platform administrator may attest a
-- settled bank credit and enable paid hosted-site access.
set local role authenticated;
do $denied$
begin
  begin
    perform public.platform_website_basic_verify_payment(
      '00000000-0000-4000-8000-000000000001',
      'test-bank-reference-123',
      10000,now()+interval '30 days'
    );
    raise exception 'Unauthorized website payment verification was accepted';
  exception
    when insufficient_privilege then null;
  end;
end
$denied$;
reset role;

rollback;
