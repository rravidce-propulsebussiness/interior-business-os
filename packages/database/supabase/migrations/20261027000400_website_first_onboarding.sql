-- Safe onboarding defaults after the website-first commercial split.
-- Applies to NEW tenants only. Never edits a live customer's existing plan.
begin;

insert into public.plans(key,name,status)
values ('website_unsubscribed','Choose Your Website Plan','active')
on conflict(key) do nothing;

-- Existing ProPulse companies retain their mappings; new ProPulse-created
-- companies are immediately in a no-module managed plan until UserInfo's
-- time-bound active Growth/Scale membership has been verified.
create or replace function public.propulse_company_import(
  p_user_id uuid, p_subject text, p_company jsonb
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
      select id into v_plan from public.plans
      where key='propulse_managed' and status='active';
      if v_plan is null then
        raise exception 'No default subscription configured' using errcode = '23514';
      end if;
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
      -- No broad trial grant. The verified OAuth tier supplies expiring
      -- module entitlements through propulse_membership_sync.
      perform private.assert_owner(v_org);
      v_status := 'created';
    else
      v_status := 'linked_existing';
    end if;
    insert into private.propulse_company_links(
      propulse_subject,propulse_profile_id,organization_id,connected_by,
      last_applied_name,profile_snapshot,membership_managed
    ) values (
      p_subject,v_profile_id,v_org,p_user_id,v_name,v_snapshot,
      v_status='created'
    );
  end if;

  -- Adding a newly chosen industry is safe; never remove manual selections.
  insert into public.organization_industries(organization_id,industry_id)
    select v_org,i.id from public.industries i where i.key = any(v_industries)
    on conflict do nothing;

  insert into public.audit_logs(
    actor_user_id,organization_id,action,entity_type,entity_id,metadata
  ) values (
    p_user_id,v_org,'company.propulse.' || v_status,
    'organization',v_org::text,
    jsonb_build_object('provider','propulse','subject',p_subject)
  );

  return jsonb_build_object('status',v_status,'organizationId',v_org);
end
$import$;

-- Direct registrations do not receive a 90-day full Business OS trial.
-- An authorized payment/plan-activation workflow assigns Website Basic later.
create or replace function public.company_self_register(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $self$
declare
  v_actor uuid := (select auth.uid());
  v_application_id uuid;
  v_application private.company_applications%rowtype;
  v_org uuid;
  v_member uuid;
  v_role uuid;
  v_plan uuid;
  v_template record;
begin
  -- Only the existing verified, active account can become this company's owner.
  -- The shared application validator checks the email, fields and industries.
  if not private.is_active_user() or not exists (
    select 1 from auth.users
    where id = v_actor and email_confirmed_at is not null
  ) then
    raise exception 'Verified account required' using errcode = '42501';
  end if;

  -- Serialize concurrent self-signups for a single user and avoid unbounded
  -- company creation through the public endpoint (platform admins are separate).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('business-os-self-register:' || v_actor::text, 0)
  );
  if (select count(*) from public.organizations where created_by = v_actor) >= 3 then
    raise exception 'Company creation limit reached' using errcode = '22023';
  end if;

  v_application_id := public.company_application_submit(p_input);
  select * into strict v_application
    from private.company_applications where id = v_application_id for update;

  if coalesce((
    select approval_required from private.company_onboarding_policy
    where singleton = true
  ), true) then
    return jsonb_build_object(
      'status', 'pending_review', 'applicationId', v_application_id
    );
  end if;

  -- Verified direct signups have an account but no purchased entitlement.
  -- Payment/activation must be verified server-side before adding website
  -- Basic or any other paid modules.
  select id into v_plan from public.plans
  where key='website_unsubscribed' and status='active';
  if v_plan is null then
    raise exception 'No active default plan configured' using errcode = '23514';
  end if;

  insert into public.organizations(
    name, slug, legal_name, status, default_currency,
    country_code, default_timezone, created_by, plan_id
  ) values (
    v_application.company_name, v_application.slug,
    v_application.legal_name, 'active', v_application.currency,
    v_application.country_code, v_application.timezone, v_actor, v_plan
  ) returning id into v_org;

  insert into public.organization_memberships(organization_id, user_id, status)
  values (v_org, v_actor, 'active') returning id into v_member;

  for v_template in select * from private.role_templates order by key loop
    insert into public.roles(organization_id, key, name, is_owner)
    values (v_org, v_template.key, v_template.name, v_template.is_owner)
    returning id into v_role;

    insert into public.role_permissions(organization_id, role_id, permission_id)
      select v_org, v_role, p.id
      from private.role_template_permissions t
      join public.permissions p on p.key = t.permission_key
      where t.role_key = v_template.key and p.scope = 'organization';

    if v_template.is_owner then
      insert into public.membership_roles(organization_id, membership_id, role_id)
      values (v_org, v_member, v_role);
    end if;
  end loop;

  insert into public.organization_industries(organization_id, industry_id)
    select v_org, i.id from public.industries i
    where i.status = 'active' and i.key = any(v_application.industry_keys);
  if (select count(*) from public.organization_industries
      where organization_id = v_org) <> cardinality(v_application.industry_keys)
  then
    raise exception 'Industry no longer available' using errcode = '22023';
  end if;

  -- No promotional all-module grant during self-service registration.

  perform private.assert_owner(v_org);

  update private.company_applications
  set status = 'approved', organization_id = v_org,
      decision_by = null, decision_note = 'Subscription activation required',
      decided_at = now()
  where id = v_application_id;

  insert into public.audit_logs(
    actor_user_id, organization_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor, v_org, 'company.self_registered', 'organization', v_org::text,
    jsonb_build_object(
      'applicationId', v_application_id,
      'industryKeys', v_application.industry_keys,
      'access', 'awaiting-subscription'
    )
  );

  return jsonb_build_object(
    'status', 'approved', 'organizationId', v_org,
    'applicationId', v_application_id
  );
end
$self$;

commit;
