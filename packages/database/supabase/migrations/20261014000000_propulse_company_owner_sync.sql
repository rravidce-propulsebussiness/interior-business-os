-- Secure ProPulse business ownership linking. Never use email-only matching
-- to provision permissions: require the exact Supabase custom OAuth identity.
begin;

create table private.propulse_company_links (
  source_id text primary key check (source_id ~ '^[1-9][0-9]{0,17}$'),
  source_subject text not null unique check (source_subject ~ '^propulse:[1-9][0-9]{0,17}$'),
  organization_id uuid not null unique references public.organizations(id),
  owner_user_id uuid not null unique references public.profiles(id),
  profile jsonb not null check (jsonb_typeof(profile)='object' and octet_length(profile::text)<16000),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table private.propulse_company_links enable row level security;
revoke all on private.propulse_company_links from public, anon, authenticated;

create function public.propulse_company_sync(
  p_user_id uuid, p_subject text, p_email text, p_profile jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $sync$
declare
  v_source text;
  v_name text;
  v_org uuid;
  v_owner uuid;
  v_matched uuid;
  v_count integer;
  v_role uuid;
  v_member uuid;
  v_plan uuid;
  v_template record;
  v_industries text[];
  v_status text := 'linked';
begin
  -- Only the Business OS backend's elevated, server-only key may call this.
  -- Backend first validates the short-lived upstream OAuth token and subject.
  if p_user_id is null or p_subject !~ '^propulse:[1-9][0-9]{0,17}$'
    or lower(btrim(coalesce(p_email,''))) !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$'
    or jsonb_typeof(p_profile) is distinct from 'object'
    or octet_length(p_profile::text) >= 16000
    or jsonb_typeof(p_profile->'services') is distinct from 'array'
    or jsonb_typeof(p_profile->'locations') is distinct from 'array'
    or jsonb_typeof(p_profile->'industryKeys') is distinct from 'array'
    or jsonb_array_length(p_profile->'services')>30
    or jsonb_array_length(p_profile->'locations')>30
    or jsonb_array_length(p_profile->'industryKeys')>2
  then raise exception 'Invalid company sync request' using errcode='22023'; end if;

  -- Business profile ID and ProPulse user subject are distinct identifiers.
  -- Ownership of the business ID was established by the trusted OAuth UserInfo
  -- response, which only reads business_profiles for its authenticated user.
  v_source := btrim(coalesce(p_profile->>'source_id',''));
  if v_source !~ '^[1-9][0-9]{0,17}
  v_name := btrim(coalesce(p_profile->>'name',''));
  if length(v_name) not between 2 and 200
    or length(coalesce(p_profile->>'description',''))>2000
    or length(coalesce(p_profile->>'phone',''))>40
  then raise exception 'Invalid company profile' using errcode='22023'; end if;

  -- Double-check both independently verified identities *inside Postgres*.
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id=u.id
    where u.id=p_user_id and p.status='active'
      and u.email_confirmed_at is not null
      and lower(u.email)=lower(btrim(p_email))
  ) or not exists (
    select 1 from auth.identities i
    where i.user_id=p_user_id and i.provider='custom:propulse-business'
      and i.identity_data->>'sub'=p_subject
  ) then raise exception 'Verified ProPulse identity required' using errcode='42501'; end if;

  select coalesce(array_agg(distinct x.key order by x.key),'{}'::text[])
    into v_industries
  from jsonb_array_elements_text(p_profile->'industryKeys') as x(key);
  if cardinality(v_industries)<>jsonb_array_length(p_profile->'industryKeys')
    or exists(select 1 from unnest(v_industries) as x(key)
      where x.key not in ('construction','interior'))
  then raise exception 'Invalid business industry' using errcode='22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('propulse-company:'||p_subject,0)
  );

  select organization_id,owner_user_id into v_org,v_owner
  from private.propulse_company_links where source_id=v_source for update;
  if found then
    if v_owner<>p_user_id then
      raise exception 'ProPulse business is already linked to another identity'
        using errcode='42501';
    end if;
    -- Never reactivate an organization or restore a revoked/suspended owner.
    if not exists(
      select 1 from public.organization_memberships m
      join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id
      join public.roles r on r.id=mr.role_id and r.is_owner
      join public.organizations o on o.id=m.organization_id
      where m.organization_id=v_org and m.user_id=p_user_id and m.status='active'
        and mr.branch_id is null and m.branch_id is null and o.status in ('active','trial')
    ) then raise exception 'Linked owner is no longer active' using errcode='42501'; end if;
    v_status:='updated';
  else
    -- The same Supabase identity may not claim a second ProPulse business.
    if exists(select 1 from private.propulse_company_links
      where owner_user_id=p_user_id or source_subject=p_subject)
    then raise exception 'Conflicting ProPulse business link' using errcode='42501'; end if;

    -- Reuse a pre-existing workspace ONLY when the actual current Owner has
    -- an exactly matching company name, and that match is unambiguous.
    select count(*),min(o.id) into v_count,v_matched
    from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id
    join public.membership_roles mr on mr.organization_id=o.id and mr.membership_id=m.id
    join public.roles r on r.id=mr.role_id and r.is_owner
    where o.created_by=p_user_id and m.user_id=p_user_id and m.status='active'
      and o.status in ('active','trial') and mr.branch_id is null
      and m.branch_id is null
      and lower(btrim(o.name))=lower(v_name)
      and not exists(select 1 from private.propulse_company_links l where l.organization_id=o.id);

    if v_count=1 then
      v_org:=v_matched;
      v_status:='matched';
    else
      select count(*) into v_count from public.organizations
      where created_by=p_user_id and status in ('active','trial');
      if v_count>0 then
        -- Do not create a duplicate or attach the wrong business on a guess.
        return jsonb_build_object('status','needs_selection');
      end if;
      select d.plan_id into v_plan from private.provisioning_defaults d
        join public.plans p on p.id=d.plan_id and p.status='active'
        where d.singleton=true;
      if v_plan is null then
        raise exception 'No default plan configured' using errcode='23514';
      end if;
      insert into public.organizations(
        name,slug,status,default_currency,country_code,
        default_timezone,created_by,plan_id
      ) values (
        v_name,'propulse-company-'||v_source,'active','INR','IN',
        'Asia/Kolkata',p_user_id,v_plan
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
      insert into public.organization_entitlements(
        organization_id,module_id,enabled,source,valid_until,configuration
      ) select v_org,m.id,true,'promotion',now()+interval '90 days',
        '{"campaign":"propulse-owner-onboarding"}'::jsonb
        from public.modules m where m.status='active';
      perform private.assert_owner(v_org);
      v_status:='created';
    end if;
    insert into private.propulse_company_links(
      source_id,source_subject,organization_id,owner_user_id,profile
    ) values(v_source,p_subject,v_org,p_user_id,p_profile);
  end if;

  -- ProPulse controls its business name and the imported profile snapshot.
  -- Do not overwrite tenant-controlled tax, subscription, domain or billing.
  update public.organizations set name=v_name where id=v_org;
  insert into public.organization_industries(organization_id,industry_id)
    select v_org,i.id from public.industries i
    where i.status='active' and i.key=any(v_industries)
    on conflict do nothing;
  update private.propulse_company_links
    set profile=p_profile, synced_at=now()
    where source_id=v_source and owner_user_id=p_user_id;

  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
    values(p_user_id,v_org,'company.propulse.synced','organization',v_org::text,
      jsonb_build_object('source','propulse','result',v_status));
  return jsonb_build_object('status',v_status,'organizationId',v_org);
end
$sync$;

create function public.propulse_company_link_mine(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $read$
begin
  if not private.has_permission(p_organization_id,'organization.view') then
    raise exception 'Company access required' using errcode='42501';
  end if;
  return (select jsonb_build_object(
    'name',profile->>'name',
    'description',profile->>'description',
    'phone',profile->>'phone',
    'services',profile->'services',
    'locations',profile->'locations',
    'syncedAt',synced_at
  ) from private.propulse_company_links
  where organization_id=p_organization_id);
end
$read$;

revoke all on function
  public.propulse_company_sync(uuid,text,text,jsonb),
  public.propulse_company_link_mine(uuid)
  from public, anon, authenticated;
grant execute on function public.propulse_company_sync(uuid,text,text,jsonb)
  to service_role;
grant execute on function public.propulse_company_link_mine(uuid)
  to authenticated;

commit;
 then
    raise exception 'Invalid provider business ID' using errcode='22023';
  end if;
  v_name := btrim(coalesce(p_profile->>'name',''));
  if length(v_name) not between 2 and 200
    or length(coalesce(p_profile->>'description',''))>2000
    or length(coalesce(p_profile->>'phone',''))>40
  then raise exception 'Invalid company profile' using errcode='22023'; end if;

  -- Double-check both independently verified identities *inside Postgres*.
  if not exists (
    select 1 from auth.users u
    join public.profiles p on p.id=u.id
    where u.id=p_user_id and p.status='active'
      and u.email_confirmed_at is not null
      and lower(u.email)=lower(btrim(p_email))
  ) or not exists (
    select 1 from auth.identities i
    where i.user_id=p_user_id and i.provider='custom:propulse-business'
      and i.identity_data->>'sub'=p_subject
  ) then raise exception 'Verified ProPulse identity required' using errcode='42501'; end if;

  select coalesce(array_agg(distinct x.key order by x.key),'{}'::text[])
    into v_industries
  from jsonb_array_elements_text(p_profile->'industryKeys') as x(key);
  if cardinality(v_industries)<>jsonb_array_length(p_profile->'industryKeys')
    or exists(select 1 from unnest(v_industries) as x(key)
      where x.key not in ('construction','interior'))
  then raise exception 'Invalid business industry' using errcode='22023'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('propulse-company:'||p_subject,0)
  );

  select organization_id,owner_user_id into v_org,v_owner
  from private.propulse_company_links where source_id=v_source for update;
  if found then
    if v_owner<>p_user_id then
      raise exception 'ProPulse business is already linked to another identity'
        using errcode='42501';
    end if;
    -- Never reactivate an organization or restore a revoked/suspended owner.
    if not exists(
      select 1 from public.organization_memberships m
      join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id
      join public.roles r on r.id=mr.role_id and r.is_owner
      join public.organizations o on o.id=m.organization_id
      where m.organization_id=v_org and m.user_id=p_user_id and m.status='active'
        and mr.branch_id is null and m.branch_id is null and o.status in ('active','trial')
    ) then raise exception 'Linked owner is no longer active' using errcode='42501'; end if;
    v_status:='updated';
  else
    -- The same Supabase identity may not claim a second ProPulse business.
    if exists(select 1 from private.propulse_company_links
      where owner_user_id=p_user_id or source_subject=p_subject)
    then raise exception 'Conflicting ProPulse business link' using errcode='42501'; end if;

    -- Reuse a pre-existing workspace ONLY when the actual current Owner has
    -- an exactly matching company name, and that match is unambiguous.
    select count(*),min(o.id) into v_count,v_matched
    from public.organizations o
    join public.organization_memberships m on m.organization_id=o.id
    join public.membership_roles mr on mr.organization_id=o.id and mr.membership_id=m.id
    join public.roles r on r.id=mr.role_id and r.is_owner
    where o.created_by=p_user_id and m.user_id=p_user_id and m.status='active'
      and o.status in ('active','trial') and mr.branch_id is null
      and m.branch_id is null
      and lower(btrim(o.name))=lower(v_name)
      and not exists(select 1 from private.propulse_company_links l where l.organization_id=o.id);

    if v_count=1 then
      v_org:=v_matched;
      v_status:='matched';
    else
      select count(*) into v_count from public.organizations
      where created_by=p_user_id and status in ('active','trial');
      if v_count>0 then
        -- Do not create a duplicate or attach the wrong business on a guess.
        return jsonb_build_object('status','needs_selection');
      end if;
      select d.plan_id into v_plan from private.provisioning_defaults d
        join public.plans p on p.id=d.plan_id and p.status='active'
        where d.singleton=true;
      if v_plan is null then
        raise exception 'No default plan configured' using errcode='23514';
      end if;
      insert into public.organizations(
        name,slug,status,default_currency,country_code,
        default_timezone,created_by,plan_id
      ) values (
        v_name,'propulse-company-'||v_source,'active','INR','IN',
        'Asia/Kolkata',p_user_id,v_plan
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
      insert into public.organization_entitlements(
        organization_id,module_id,enabled,source,valid_until,configuration
      ) select v_org,m.id,true,'promotion',now()+interval '90 days',
        '{"campaign":"propulse-owner-onboarding"}'::jsonb
        from public.modules m where m.status='active';
      perform private.assert_owner(v_org);
      v_status:='created';
    end if;
    insert into private.propulse_company_links(
      source_id,source_subject,organization_id,owner_user_id,profile
    ) values(v_source,p_subject,v_org,p_user_id,p_profile);
  end if;

  -- ProPulse controls its business name and the imported profile snapshot.
  -- Do not overwrite tenant-controlled tax, subscription, domain or billing.
  update public.organizations set name=v_name where id=v_org;
  insert into public.organization_industries(organization_id,industry_id)
    select v_org,i.id from public.industries i
    where i.status='active' and i.key=any(v_industries)
    on conflict do nothing;
  update private.propulse_company_links
    set profile=p_profile, synced_at=now()
    where source_id=v_source and owner_user_id=p_user_id;

  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
    values(p_user_id,v_org,'company.propulse.synced','organization',v_org::text,
      jsonb_build_object('source','propulse','result',v_status));
  return jsonb_build_object('status',v_status,'organizationId',v_org);
end
$sync$;

create function public.propulse_company_link_mine(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $read$
begin
  if not private.has_permission(p_organization_id,'organization.view') then
    raise exception 'Company access required' using errcode='42501';
  end if;
  return (select jsonb_build_object(
    'name',profile->>'name',
    'description',profile->>'description',
    'phone',profile->>'phone',
    'services',profile->'services',
    'locations',profile->'locations',
    'syncedAt',synced_at
  ) from private.propulse_company_links
  where organization_id=p_organization_id);
end
$read$;

revoke all on function
  public.propulse_company_sync(uuid,text,text,jsonb),
  public.propulse_company_link_mine(uuid)
  from public, anon, authenticated;
grant execute on function public.propulse_company_sync(uuid,text,text,jsonb)
  to service_role;
grant execute on function public.propulse_company_link_mine(uuid)
  to authenticated;

commit;
