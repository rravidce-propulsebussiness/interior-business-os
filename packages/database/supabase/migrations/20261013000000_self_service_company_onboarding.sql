-- Self-service trial onboarding: verified users own only the tenant they create.
-- Provisioning, role assignment, industry selection and trial entitlements are
-- one atomic transaction. Employee invites and platform roles are unchanged.
begin;

-- Open onboarding for the current testing phase. A platform administrator can
-- turn review back on with the existing permission-checked policy RPC.
update private.company_onboarding_policy
set approval_required = false, updated_at = now(), changed_by = null
where singleton = true;

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

  -- Never trust a client-selected subscription plan to grant paid access.
  -- The platform default is used; time-limited module access below is explicitly
  -- granted as a promotional testing entitlement instead.
  select d.plan_id into v_plan
  from private.provisioning_defaults d
  join public.plans p on p.id = d.plan_id and p.status = 'active'
  where d.singleton = true;
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

  -- During the test rollout owners can use all currently active tenant modules.
  -- Trial access expires automatically; platform admin can manage entitlements.
  insert into public.organization_entitlements(
    organization_id, module_id, enabled, source, valid_until, configuration
  )
  select v_org, m.id, true, 'promotion', now() + interval '90 days',
    '{"campaign":"self-service-testing"}'::jsonb
  from public.modules m where m.status = 'active';

  perform private.assert_owner(v_org);

  update private.company_applications
  set status = 'approved', organization_id = v_org,
      decision_by = null, decision_note = 'Self-service testing access',
      decided_at = now()
  where id = v_application_id;

  insert into public.audit_logs(
    actor_user_id, organization_id, action, entity_type, entity_id, metadata
  ) values (
    v_actor, v_org, 'company.self_registered', 'organization', v_org::text,
    jsonb_build_object(
      'applicationId', v_application_id,
      'industryKeys', v_application.industry_keys,
      'trialDays', 90
    )
  );

  return jsonb_build_object(
    'status', 'approved', 'organizationId', v_org,
    'applicationId', v_application_id
  );
end
$self$;

revoke all on function public.company_self_register(jsonb)
  from public, anon, authenticated;
grant execute on function public.company_self_register(jsonb) to authenticated;

commit;
