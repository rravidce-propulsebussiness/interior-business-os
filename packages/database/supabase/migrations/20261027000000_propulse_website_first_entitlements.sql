-- ProPulse Growth/Scale access is time-bound and independent of the owner role.
-- No production tenant is automatically changed until the OAuth owner signs in.
begin;

insert into public.plans(key,name,status)
values
  ('propulse_linked','ProPulse linked (membership-controlled)','active'),
  ('website_pending','Direct signup (activation pending)','active'),
  ('website_basic','Website Basic (paid direct)','active'),
  ('business_os_complete','Business OS Complete (paid direct)','active')
on conflict (key) do nothing;

insert into public.plan_modules(plan_id,module_id)
select p.id,m.id from public.plans p join public.modules m on
  ((p.key='website_basic' and m.key='website') or
   (p.key='business_os_complete' and m.status='active'))
where p.key in ('website_basic','business_os_complete')
on conflict do nothing;

-- Domain connection is a feature, not domain registration. Both eligible
-- website tiers use Business OS hosting and customer-owned custom domains.
insert into public.website_plan_limits(plan_id,configuration)
select p.id,
  case when p.key='business_os_complete' then
    '{"sites":3,"pages":50,"storage_bytes":52428800,"forms":true,"custom_domain":true,"custom_code":true,"developer_mode":true,"template_only":false}'::jsonb
  else
    '{"sites":1,"pages":8,"storage_bytes":20971520,"forms":false,"custom_domain":true,"custom_code":false,"developer_mode":false,"template_only":true}'::jsonb
  end
from public.plans p where p.key in ('propulse_linked','website_basic','business_os_complete')
on conflict(plan_id) do update set configuration=excluded.configuration;

alter table private.propulse_company_links
  add column if not exists tier text not null default 'none'
    check(tier in ('none','growth','scale')),
  add column if not exists access_valid_until timestamptz;

create function public.propulse_company_import(
  p_user_id uuid, p_subject text, p_company jsonb, p_access jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $import$
declare
  v_name text;
  v_profile_id text;
  v_snapshot jsonb;
  v_industries text[];
  v_org uuid;
  v_org_name text;
  v_plan uuid;
  v_member uuid;
  v_role uuid;
  v_template record;
  v_link private.propulse_company_links%rowtype;
  v_matches integer;
  v_slug text;
  v_status text;
  v_tier text;
  v_until timestamptz;
  v_propulse_plan uuid;
begin
  if p_subject !~ '^propulse:[1-9][0-9]{0,18}$'
    or p_company is null or jsonb_typeof(p_company) <> 'object'
    or octet_length(p_company::text) > 12000
    or not exists (
      select 1 from auth.identities i
      join auth.users u on u.id = i.user_id
      join public.profiles p on p.id = u.id
      where i.user_id = p_user_id
        and i.provider = 'custom:propulse-business'
        and i.identity_data->>'sub' = p_subject
        and u.email_confirmed_at is not null
        and p.status = 'active'
    ) then
    raise exception 'Verified ProPulse identity required' using errcode = '42501';
  end if;

  -- The OAuth server obtains p_access only from a verified ProPulse UserInfo
  -- response. A caller cannot select its own tier or expiry.
  if p_access is null or jsonb_typeof(p_access) <> 'object'
    or not coalesce((p_access->>'tier') in ('growth','scale','none'),false)
    or not coalesce(jsonb_typeof(p_access->'expires_at') in ('null','string'),false) then
    raise exception 'Valid ProPulse membership evidence required' using errcode='22023';
  end if;
  v_tier := p_access->>'tier';
  if v_tier <> 'none' then
    v_until := (p_access->>'expires_at')::timestamptz;
    if v_until is null or v_until <= now() or v_until > now() + interval '3 years' then
      v_tier := 'none';
      v_until := null;
    end if;
  end if;
  -- No ProPulse package means no new complimentary website/company.
  -- Existing paired owners may still sign in to their paid direct subscription.
  if v_tier='none' and not exists(
    select 1 from private.propulse_company_links where propulse_subject=p_subject
  ) then return jsonb_build_object('status','review_required'); end if;

  select id into v_propulse_plan from public.plans where key='propulse_linked' and status='active';
  if v_propulse_plan is null then raise exception 'ProPulse website plan not installed' using errcode='23514';end if;
  v_name := btrim(coalesce(p_company->>'name', ''));
  v_profile_id := btrim(coalesce(p_company->>'source_id', ''));
  if length(v_name) not between 2 and 200
    or v_profile_id !~ '^[1-9][0-9]{0,18}$'
    or length(coalesce(p_company->>'description', '')) > 2000
    or length(coalesce(p_company->>'phone', '')) > 40
    or jsonb_typeof(p_company->'services') is distinct from 'array'
    or jsonb_typeof(p_company->'locations') is distinct from 'array'
    or jsonb_array_length(p_company->'services') > 30
    or jsonb_array_length(p_company->'locations') > 30 then
    raise exception 'Invalid ProPulse company profile' using errcode = '22023';
  end if;

  -- Source industry keys are derived only from the owner-scoped provider API.
  -- Do not silently label a real-estate-only company as construction/interior.
  select coalesce(array_agg(distinct key), array[]::text[])
    into v_industries
  from jsonb_array_elements_text(coalesce(p_company->'industries', '[]'::jsonb)) t(key)
  where key in ('construction', 'interior')
    and exists(select 1 from public.industries i where i.key = t.key and i.status = 'active');

  v_snapshot := jsonb_build_object(
    'description', coalesce(p_company->>'description', ''),
    'phone', coalesce(p_company->>'phone', ''),
    'services', p_company->'services',
    'locations', p_company->'locations'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('propulse-company:' || p_subject, 0));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('business-os-self-register:' || p_user_id::text, 0));

  select * into v_link from private.propulse_company_links
  where propulse_subject = p_subject for update;
  if found then
    if v_link.propulse_profile_id <> v_profile_id
      or v_link.connected_by <> p_user_id then
      raise exception 'ProPulse company link cannot be reassigned' using errcode = '42501';
    end if;
    v_org := v_link.organization_id;
    if not exists (
      select 1 from public.organization_memberships m
      join public.membership_roles mr
        on mr.membership_id = m.id and mr.organization_id = m.organization_id
      join public.roles r
        on r.id = mr.role_id and r.organization_id = m.organization_id and r.is_owner
      join public.organizations o on o.id = m.organization_id
      where m.organization_id = v_org and m.user_id = p_user_id
        and m.status = 'active' and m.branch_id is null
        and mr.branch_id is null and o.status in ('active','trial')
    ) then
      raise exception 'Original company owner is not active' using errcode = '42501';
    end if;
    select name into v_org_name from public.organizations where id = v_org for update;
    -- Owner changes in Business OS take precedence over imported names.
    if v_org_name = v_link.last_applied_name then
      update public.organizations set name = v_name where id = v_org;
      v_org_name := v_name;
    end if;
    update private.propulse_company_links
      set last_applied_name = case
          when v_org_name = v_name then v_name else last_applied_name end,
          profile_snapshot = v_snapshot, synced_at = now()
      where propulse_subject = p_subject;
    v_status := 'updated';
  else
    if exists (select 1 from private.propulse_company_links
      where propulse_profile_id = v_profile_id) then
      raise exception 'Company already linked to another identity' using errcode = '23505';
    end if;

    -- Reuse a *uniquely matched*, already owned Business OS company.
    -- Never choose by email or by a name belonging to another organization.
    select count(*)::integer, (array_agg(o.id order by o.created_at, o.id))[1]
    into v_matches, v_org
    from public.organizations o
    where o.created_by = p_user_id
      and o.status in ('active','trial')
      and lower(btrim(o.name)) = lower(v_name)
      and not exists (
        select 1 from private.propulse_company_links l where l.organization_id = o.id
      )
      and exists (
        select 1 from public.organization_memberships m
        join public.membership_roles mr
          on mr.membership_id = m.id and mr.organization_id = m.organization_id
        join public.roles r on r.id = mr.role_id and r.is_owner
        where m.organization_id = o.id and m.user_id = p_user_id
          and m.status = 'active' and m.branch_id is null
          and mr.branch_id is null
      );

    if v_matches <> 1 then v_org := null; end if;
    if v_org is null then
      if coalesce((select approval_required from private.company_onboarding_policy
                    where singleton = true), true) then
        return jsonb_build_object('status','review_required');
      end if;
      if (select count(*) from public.organizations where created_by = p_user_id) >= 3 then
        return jsonb_build_object('status','owner_limit');
      end if;
      -- Provider-created companies start on the zero-module linked base plan.
      -- Active ProPulse membership grants only time-bound entitlements below.
      v_plan := v_propulse_plan;
      v_slug := left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-'), 48);
      v_slug := coalesce(nullif(btrim(v_slug, '-'), ''), 'company') || '-p' || v_profile_id;
      if exists(select 1 from public.organizations where slug = v_slug) then
        v_slug := left(v_slug, 68) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
      end if;
      insert into public.organizations(
        name, slug, status, default_currency, country_code,
        default_timezone, created_by, plan_id
      ) values (
        v_name, v_slug, 'active', 'INR', 'IN', 'Asia/Kolkata', p_user_id, v_plan
      ) returning id into v_org;
      insert into public.organization_memberships(organization_id,user_id,status)
      values(v_org,p_user_id,'active') returning id into v_member;
      for v_template in select * from private.role_templates order by key loop
        insert into public.roles(organization_id,key,name,is_owner)
        values(v_org,v_template.key,v_template.name,v_template.is_owner)
        returning id into v_role;
        insert into public.role_permissions(organization_id,role_id,permission_id)
        select v_org,v_role,p.id from private.role_template_permissions t
          join public.permissions p on p.key=t.permission_key
          where t.role_key=v_template.key and p.scope='organization';
        if v_template.is_owner then
          insert into public.membership_roles(organization_id,membership_id,role_id)
          values(v_org,v_member,v_role);
        end if;
      end loop;
      perform private.assert_owner(v_org);
      v_status := 'created';
    else
      v_status := 'linked_existing';
    end if;
    insert into private.propulse_company_links(
      propulse_subject,propulse_profile_id,organization_id,connected_by,
      last_applied_name,profile_snapshot
    ) values (
      p_subject,v_profile_id,v_org,p_user_id,v_name,v_snapshot
    );
  end if;

  -- Adding a newly chosen industry is safe; never remove manual selections.
  insert into public.organization_industries(organization_id,industry_id)
    select v_org,i.id from public.industries i where i.key = any(v_industries)
    on conflict do nothing;


  -- Never replace a plan that an existing owner bought or an admin assigned.
  -- The original auto-import used the platform default, so migrate only a
  -- still-default linked plan to the provider-linked base plan.
  update public.organizations
    set plan_id=v_propulse_plan
    where id=v_org and plan_id=(
      select d.plan_id from private.provisioning_defaults d where d.singleton=true
    ) and (v_status='created' or exists(
      select 1 from public.organization_entitlements e
      where e.organization_id=v_org and e.source='promotion'
        and e.configuration->>'source'='propulse'
    ));

  -- Remove only this integration's grants; preserve purchased add-ons, other
  -- promotions and unrelated tenants. An expired Growth/Scale package cannot
  -- retain access through an old ProPulse trial promotion.
  delete from public.organization_entitlements e
  where e.organization_id=v_org and e.source='promotion'
    and e.configuration->>'source'='propulse';
  if v_tier in ('growth','scale') then
    insert into public.organization_entitlements(
      organization_id,module_id,enabled,source,valid_until,configuration
    )
    select v_org,m.id,true,'promotion',v_until,
      case when m.key='website' then
        case when v_tier='growth' then
          '{"source":"propulse","tier":"growth","sites":1,"pages":8,"storage_bytes":20971520,"forms":false,"custom_domain":true,"custom_code":false,"developer_mode":false,"template_only":true}'::jsonb
        else
          '{"source":"propulse","tier":"scale","sites":3,"pages":50,"storage_bytes":52428800,"forms":true,"custom_domain":true,"custom_code":true,"developer_mode":true,"template_only":false}'::jsonb end
      else jsonb_build_object('source','propulse','tier',v_tier) end
    from public.modules m
    where m.status='active' and (v_tier='scale' or m.key='website')
    on conflict(organization_id,module_id,source)
      do update set enabled=true,valid_from=now(),valid_until=excluded.valid_until,
        configuration=excluded.configuration;
  end if;

  update private.propulse_company_links
    set tier=v_tier,access_valid_until=v_until,synced_at=now()
    where propulse_subject=p_subject;

  insert into public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata
  ) values (
    p_user_id,v_org,'company.propulse.' || v_status,
    'organization',v_org::text,
    jsonb_build_object('provider','propulse','subject',p_subject,'tier',v_tier)
  );

  return jsonb_build_object('status',v_status,'organizationId',v_org);
end
$import$;

-- Only company owners with organization.view may read the currently linked
-- provider tier. No provider access tokens or credentials are stored.
create or replace function public.propulse_company_profile(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $read$
begin
  if not private.has_permission(p_organization_id,'organization.view') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  return (
    select jsonb_build_object(
      'source','propulse',
      'description',l.profile_snapshot->>'description',
      'phone',l.profile_snapshot->>'phone',
      'services',l.profile_snapshot->'services',
      'locations',l.profile_snapshot->'locations',
      'tier',l.tier,
      'accessExpiresAt',l.access_valid_until,
      'syncedAt',l.synced_at
    ) from private.propulse_company_links l
      where l.organization_id = p_organization_id
  );
end
$read$;

-- The insecure legacy signature allowed a 90-day all-module trial and must
-- never be callable after the upgrade. The new signed-provider-data version
-- is the only import endpoint used by Business OS.
drop function public.propulse_company_import(uuid,text,jsonb);
do $grant$
begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.propulse_company_import(uuid,text,jsonb,jsonb)
      to service_role;
  end if;
end
$grant$;
revoke all on function public.propulse_company_import(uuid,text,jsonb,jsonb)
  from public,anon,authenticated;
commit;
