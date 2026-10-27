-- Verified ProPulse membership -> time-bound Business OS entitlements.
-- Does not touch existing direct-purchase subscriptions or arbitrary tenants.
begin;

insert into public.plans(key,name,status)
values ('propulse_managed','ProPulse Managed Subscription','active')
on conflict(key) do nothing;

alter table private.propulse_company_links
  add column if not exists membership_managed boolean not null default false,
  add column if not exists membership_tier text,
  add column if not exists membership_expires_at timestamptz;

create or replace function public.propulse_membership_sync(
  p_user_id uuid,
  p_subject text,
  p_organization_id uuid,
  p_tier text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = ''
as $sync$
declare
  v_link private.propulse_company_links%rowtype;
  v_plan_id uuid;
  v_tier_plan_id uuid;
  v_is_new_propulse boolean;
begin
  -- Verified identity + source-company ownership are never accepted on trust.
  if p_user_id is null
    or p_subject !~ '^propulse:[1-9][0-9]{0,18}$'
    or p_organization_id is null
    or p_tier not in ('none','growth','scale')
    or p_tier is null
    or not exists (
      select 1 from auth.identities i
      join auth.users u on u.id = i.user_id
      join public.profiles p on p.id = u.id
      where i.user_id = p_user_id
        and i.provider = 'custom:propulse-business'
        and i.identity_data->>'sub' = p_subject
        and u.email_confirmed_at is not null
        and p.status = 'active'
    )
  then
    raise exception 'Verified ProPulse identity required' using errcode='42501';
  end if;
  if (p_tier='none' and p_expires_at is not null)
     or (p_tier<>'none' and (
       p_expires_at is null
       or p_expires_at<=now()
       or p_expires_at>now()+interval '5 years'))
  then
    raise exception 'Invalid active membership interval' using errcode='22023';
  end if;

  select * into v_link
  from private.propulse_company_links
  where propulse_subject=p_subject
    and organization_id=p_organization_id
    and connected_by=p_user_id
  for update;
  if not found then
    raise exception 'ProPulse company link unavailable' using errcode='42501';
  end if;

  -- Only ProPulse-created tenants, not previously owned direct-paying
  -- companies incidentally linked through OAuth, can be tier-managed.
  select exists (
    select 1 from public.organization_entitlements e
    join public.modules m on m.id=e.module_id
    where e.organization_id=p_organization_id
      and m.key='website'
      and e.source='promotion'
      and e.configuration->>'campaign'='self-service-testing'
      and e.configuration->>'source'='propulse'
  ) into v_is_new_propulse;
  if not v_link.membership_managed and not v_is_new_propulse then
    return jsonb_build_object('status','existing_company_unmodified');
  end if;

  select id into v_plan_id from public.plans
  where key='propulse_managed' and status='active';
  select id into v_tier_plan_id from public.plans
  where key=case p_tier when 'growth' then 'propulse_growth'
                        when 'scale' then 'propulse_scale'
                        else 'propulse_managed' end
    and status='active';
  if v_plan_id is null or v_tier_plan_id is null then
    raise exception 'ProPulse plan catalog unavailable' using errcode='23514';
  end if;

  perform 1 from public.organizations
    where id=p_organization_id and status in ('active','trial')
    for update;
  if not found then
    raise exception 'Inactive organization' using errcode='42501';
  end if;

  -- Empty managed plan prevents the catalog's Growth/Scale plan_modules
  -- from silently granting perpetual access after a paid membership expires.
  update public.organizations set plan_id=v_plan_id
  where id=p_organization_id;

  -- Clear only promotions created by this ProPulse flow. Never delete an
  -- independent manual/addon purchase or unrelated promotion.
  delete from public.organization_entitlements e
  where e.organization_id=p_organization_id and e.source='promotion'
    and (e.configuration->>'campaign'='propulse-membership'
      or (e.configuration->>'campaign'='self-service-testing'
          and e.configuration->>'source'='propulse'));

  if p_tier<>'none' then
    -- Capabilities and access are delegated to short-lived entitlement rows.
    -- Expiry is enforced by the central private.entitled check on every request.
    insert into public.organization_entitlements(
      organization_id,module_id,enabled,source,valid_from,valid_until,configuration
    )
    select p_organization_id,m.id,true,'promotion',now(),p_expires_at,
      case when m.key='website'
        then coalesce((select l.configuration from public.website_plan_limits l
                       where l.plan_id=v_tier_plan_id),'{}'::jsonb)
        else '{}'::jsonb
      end || '{"campaign":"propulse-membership"}'::jsonb
    from public.plan_modules pm
    join public.modules m on m.id=pm.module_id and m.status='active'
    where pm.plan_id=v_tier_plan_id
    on conflict(organization_id,module_id,source)
    do update set enabled=true,valid_from=excluded.valid_from,
      valid_until=excluded.valid_until,configuration=excluded.configuration;
  end if;

  update private.propulse_company_links
    set membership_managed=true,
      membership_tier=p_tier,
      membership_expires_at=p_expires_at,
      synced_at=now()
    where propulse_subject=p_subject;
  insert into public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata
  ) values (
    p_user_id,p_organization_id,'company.propulse.membership_synced',
    'organization',p_organization_id::text,
    jsonb_build_object('tier',p_tier,'expiresAt',p_expires_at)
  );

  return jsonb_build_object(
    'status','synced','tier',p_tier,'expiresAt',p_expires_at
  );
end
$sync$;

revoke all on function public.propulse_membership_sync(uuid,text,uuid,text,timestamptz)
  from public,anon,authenticated;
do $grant$
begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.propulse_membership_sync(uuid,text,uuid,text,timestamptz)
      to service_role;
  end if;
end $grant$;
commit;
