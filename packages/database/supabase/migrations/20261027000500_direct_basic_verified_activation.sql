-- Direct Business OS website-only subscriptions: manual bank-verification bridge.
-- Prices and online checkout are deliberately NOT invented by this migration.
-- An authorized platform administrator attests a settled payment reference.
-- Nothing in a customer-provided proof, browser form or query can enable access.
begin;

create table private.website_basic_payment_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  payment_reference text not null unique
    check (length(payment_reference) between 8 and 100),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  valid_until timestamptz not null,
  check (valid_until > verified_at)
);
create index website_basic_verified_org_time
  on private.website_basic_payment_verifications(organization_id,verified_at desc);

-- Assigning the catalog identifier by itself is NOT a purchase.
-- Direct Website Basic is granted only by the bounded paid entitlement below.
delete from public.plan_modules pm
using public.plans p, public.modules m
where pm.plan_id=p.id and pm.module_id=m.id
  and p.key='website_basic' and m.key='website';

create function public.platform_website_basic_verify_payment(
  p_organization_id uuid,
  p_payment_reference text,
  p_amount_minor bigint,
  p_valid_until timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $activate$
declare
  v_org public.organizations%rowtype;
  v_module_id uuid;
  v_configuration jsonb;
  v_previous public.organization_entitlements%rowtype;
  v_activation_id uuid;
  v_reference text := pg_catalog.btrim(coalesce(p_payment_reference,''));
begin
  perform private.require_platform('platform.entitlements.manage');
  perform private.require_platform('platform.organizations.manage');
  if p_organization_id is null
    or v_reference !~ '^[A-Za-z0-9][A-Za-z0-9.:/_-]{7,99}$'
    or p_amount_minor is null or p_amount_minor not between 1 and 1000000000000
    or p_valid_until is null
    or p_valid_until <= now() + interval '1 hour'
    or p_valid_until > now() + interval '370 days'
  then
    raise exception 'Invalid payment verification details'
      using errcode='22023';
  end if;

  select o.* into v_org
  from public.organizations o
  join public.plans p on p.id=o.plan_id
  where o.id=p_organization_id and o.status in ('active','trial')
    and p.key in ('website_unsubscribed','website_basic')
  for update of o;
  if not found then
    raise exception 'Only direct website customers awaiting activation are eligible'
      using errcode='42501';
  end if;

  if exists(select 1 from private.propulse_company_links l
            where l.organization_id=v_org.id)
  then
    raise exception 'ProPulse subscriptions are managed by ProPulse'
      using errcode='42501';
  end if;

  select m.id into v_module_id from public.modules m
    where m.key='website' and m.status='active';
  select l.configuration into v_configuration
    from public.website_plan_limits l join public.plans p on p.id=l.plan_id
    where p.key='website_basic' and p.status='active';
  if v_module_id is null or v_configuration is null
    or v_configuration->>'custom_domain'<>'true'
  then
    raise exception 'Website Basic is not configured'
      using errcode='23514';
  end if;

  select * into v_previous from public.organization_entitlements
    where organization_id=v_org.id and module_id=v_module_id
      and source='addon' for update;
  if found and (v_previous.configuration->>'campaign') is distinct from
    'direct-website-basic'
  then
    raise exception 'Another paid website add-on already exists'
      using errcode='42501';
  end if;

  insert into private.website_basic_payment_verifications(
    organization_id,payment_reference,amount_minor,currency,verified_by,
    valid_until
  ) values (
    v_org.id,v_reference,p_amount_minor,v_org.default_currency,auth.uid(),
    p_valid_until
  ) returning id into v_activation_id;

  -- A bounded add-on is the only source of website entitlement for Direct Basic.
  -- Renewals reuse the same entitlement row but require a new unique bank ref.
  insert into public.organization_entitlements(
    organization_id,module_id,enabled,source,valid_from,valid_until,configuration
  ) values (
    v_org.id,v_module_id,true,'addon',now(),p_valid_until,
    v_configuration || '{"campaign":"direct-website-basic"}'::jsonb
  )
  on conflict(organization_id,module_id,source)
  do update set
    enabled=true,
    valid_from=excluded.valid_from,
    valid_until=excluded.valid_until,
    configuration=excluded.configuration,
    updated_at=now();

  -- Keep an empty permanent plan: subscription expiration revokes website
  -- access without deleting any published pages, assets or domain records.
  update public.organizations o
    set plan_id=(select id from public.plans where key='website_unsubscribed')
    where o.id=v_org.id;

  insert into public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata
  ) values (
    auth.uid(),v_org.id,'website_basic.bank_payment_verified',
    'website_basic_subscription',v_activation_id::text,
    jsonb_build_object('currency',v_org.default_currency,
      'amountMinor',p_amount_minor,'validUntil',p_valid_until)
  );

  return jsonb_build_object('status','activated',
    'organizationId',v_org.id,'validUntil',p_valid_until);
end
$activate$;
revoke all on function public.platform_website_basic_verify_payment(
  uuid,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.platform_website_basic_verify_payment(
  uuid,text,bigint,timestamptz) to authenticated;

commit;
