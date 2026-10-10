-- Phase 1: reviewed, verified-owner company applications.
-- Additive only. Existing organizations, roles, industry memberships and commerce
-- engines remain canonical. This migration must run in disposable CI first.
begin;

create table private.company_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references public.profiles(id),
  company_name text not null check (length(company_name) between 1 and 200),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  legal_name text check (length(legal_name) <= 200),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  timezone text not null,
  industry_keys text[] not null check (cardinality(industry_keys) between 1 and 8),
  requested_plan_id uuid references public.plans(id),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected')),
  organization_id uuid unique references public.organizations(id),
  decision_by uuid references public.profiles(id),
  decision_note text check (length(decision_note) <= 500),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'approved' and organization_id is not null and decided_at is not null)
    or (status = 'rejected' and organization_id is null and decided_at is not null)
    or (status = 'pending_review' and organization_id is null and decided_at is null))
);
create unique index company_applications_pending_slug
  on private.company_applications(slug) where status = 'pending_review';
create index company_applications_owner_time
  on private.company_applications(applicant_user_id, submitted_at desc);
create index company_applications_review_queue
  on private.company_applications(status, submitted_at desc);
create trigger company_applications_touch before update
  on private.company_applications for each row
  execute function private.touch_updated_at();

-- Not an exposed Data API table. RPCs below are the only supported access path.
alter table private.company_applications enable row level security;
revoke all on private.company_applications from public, anon, authenticated;

create function public.company_application_submit(p_input jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  keys text[];
  requested_plan uuid;
  result uuid;
  slug_value text;
  name_value text;
  country_value text;
  currency_value text;
  timezone_value text;
begin
  if not private.is_active_user() or not exists (
    select 1 from auth.users where id = (select auth.uid())
    and email_confirmed_at is not null
  ) then
    raise exception 'A verified email and active account are required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object'
    or jsonb_typeof(p_input->'industries') is distinct from 'array'
    or jsonb_array_length(p_input->'industries') not between 1 and 8 then
    raise exception 'Invalid application payload' using errcode = '22023';
  end if;
  name_value := trim(coalesce(p_input->>'name', ''));
  slug_value := trim(coalesce(p_input->>'slug', ''));
  country_value := coalesce(p_input->>'country', '');
  currency_value := coalesce(p_input->>'currency', '');
  timezone_value := coalesce(p_input->>'timezone', '');

  if length(name_value) not between 1 and 200
    or slug_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(slug_value) > 80
    or country_value !~ '^[A-Z]{2}$'
    or currency_value !~ '^[A-Z]{3}$'
    or not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_value)
    or length(coalesce(p_input->>'legalName', '')) > 200
  then raise exception 'Invalid application fields' using errcode = '22023';
  end if;
  if exists (select 1 from public.organizations where slug = slug_value) then
    raise exception 'Company slug already registered' using errcode = '23505';
  end if;
  select array_agg(distinct key order by key) into keys
  from jsonb_array_elements_text(p_input->'industries') as t(key);
  if cardinality(keys) <> jsonb_array_length(p_input->'industries')
    or exists (
      select 1 from unnest(keys) as requested(key)
      where not exists (
        select 1 from public.industries i where i.key = requested.key
        and i.status = 'active'
      )
    )
  then raise exception 'Invalid or duplicate industry' using errcode = '22023';
  end if;
  if nullif(p_input->>'planId', '') is not null then
    requested_plan := (p_input->>'planId')::uuid;
    if not exists (select 1 from public.plans where id = requested_plan and status = 'active') then
      raise exception 'Unavailable plan' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from private.company_applications
      where applicant_user_id = (select auth.uid()) and status = 'pending_review') >= 3 then
    raise exception 'Pending application limit reached' using errcode = '22023';
  end if;
  insert into private.company_applications(
    applicant_user_id, company_name, slug, legal_name,
    country_code, currency, timezone, industry_keys, requested_plan_id
  ) values (
    auth.uid(), name_value, slug_value, nullif(trim(p_input->>'legalName'), ''),
    country_value, currency_value, timezone_value, keys, requested_plan
  ) returning id into result;
  return result;
end
$function$;

create function public.company_applications_mine()
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not private.is_active_user() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
      select id, company_name, slug, industry_keys, status,
        organization_id, decision_note, submitted_at, decided_at
      from private.company_applications
      where applicant_user_id = (select auth.uid())
      order by submitted_at desc limit 30
    ) x
  );
end
$function$;

create function public.company_applications_review(
  p_status text default 'pending_review',
  p_page integer default 1
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  total_count integer;
  result_rows jsonb;
begin
  perform private.require_platform('platform.organizations.manage');
  if p_page not between 1 and 10000 or
    (p_status is not null and p_status not in ('pending_review', 'approved', 'rejected')) then
    raise exception 'Invalid review filter' using errcode = '22023';
  end if;
  select count(*) into total_count from private.company_applications
    where p_status is null or status = p_status;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result_rows from (
    select a.id, a.company_name, a.slug, a.legal_name, a.status, a.country_code,
      a.currency, a.timezone, a.industry_keys, a.requested_plan_id,
      a.organization_id, a.decision_note, a.submitted_at, a.decided_at,
      u.email applicant_email
    from private.company_applications a
    join auth.users u on u.id = a.applicant_user_id
    where p_status is null or a.status = p_status
    order by a.submitted_at asc, a.id asc
    limit 25 offset (p_page - 1) * 25
  ) x;
  return jsonb_build_object('rows', result_rows, 'total', total_count, 'page', p_page);
end
$function$;

create function public.company_application_decide(
  p_application_id uuid, p_action text, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  application private.company_applications%rowtype;
  new_org uuid;
  new_membership uuid;
  new_role uuid;
  template record;
begin
  perform private.require_platform('platform.organizations.manage');
  if p_action not in ('approve', 'reject') or length(coalesce(p_note, '')) > 500
    or (p_action = 'reject' and length(trim(coalesce(p_note, ''))) < 3) then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  select * into application from private.company_applications
    where id = p_application_id for update;
  if not found then raise exception 'Application unavailable' using errcode = '22023'; end if;
  if application.status <> 'pending_review' then
    if (application.status = 'approved' and p_action = 'approve')
      or (application.status = 'rejected' and p_action = 'reject') then
      return jsonb_build_object('status', application.status, 'organizationId', application.organization_id);
    end if;
    raise exception 'Application already decided' using errcode = '23505';
  end if;
  if application.applicant_user_id = (select auth.uid()) then
    raise exception 'Self-approval is not permitted' using errcode = '42501';
  end if;
  if p_action = 'reject' then
    update private.company_applications
      set status = 'rejected', decision_by = auth.uid(),
        decision_note = trim(p_note), decided_at = now()
      where id = p_application_id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
      values (auth.uid(), 'company.application.rejected', 'company_application', p_application_id::text,
        jsonb_build_object('reason', left(trim(p_note), 500)));
    return jsonb_build_object('status','rejected','organizationId',null);
  end if;

  if not exists (select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=application.applicant_user_id
    and u.email_confirmed_at is not null and p.status = 'active') then
    raise exception 'Applicant email is unverified or user is inactive' using errcode = '42501';
  end if;
  if exists (select 1 from public.organizations where slug = application.slug) then
    raise exception 'Company slug already registered' using errcode = '23505';
  end if;
  insert into public.organizations(
    name, slug, legal_name, status, default_currency,
    country_code, default_timezone, created_by, plan_id
  )
  values (
    application.company_name, application.slug, application.legal_name,
    'active', application.currency, application.country_code,
    application.timezone, application.applicant_user_id,
    coalesce(application.requested_plan_id,
      (select d.plan_id from private.provisioning_defaults d
        join public.plans p on p.id=d.plan_id where p.status='active'))
  ) returning id into new_org;
  insert into public.organization_memberships(organization_id, user_id, status)
    values (new_org, application.applicant_user_id, 'active')
    returning id into new_membership;
  for template in select * from private.role_templates order by key loop
    insert into public.roles(organization_id,key,name,is_owner)
      values (new_org,template.key,template.name,template.is_owner)
      returning id into new_role;
    insert into public.role_permissions(organization_id,role_id,permission_id)
      select new_org,new_role,p.id from private.role_template_permissions t
      join public.permissions p on p.key=t.permission_key
      where t.role_key=template.key and p.scope='organization';
    if template.is_owner then
      insert into public.membership_roles(organization_id,membership_id,role_id)
      values (new_org,new_membership,new_role);
    end if;
  end loop;
  insert into public.organization_industries(organization_id,industry_id)
    select new_org,i.id from public.industries i
    where i.status='active' and i.key = any(application.industry_keys);
  if (select count(*) from public.organization_industries where organization_id=new_org)
      <> cardinality(application.industry_keys) then
    raise exception 'Industry no longer available' using errcode='22023';
  end if;
  perform private.assert_owner(new_org);
  update private.company_applications set status='approved',
    organization_id=new_org, decision_by=auth.uid(),
    decision_note=nullif(trim(coalesce(p_note,'')),''), decided_at=now()
    where id=p_application_id;
  insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
    values (auth.uid(),new_org,'company.application.approved','company_application',
      p_application_id::text,jsonb_build_object('industryKeys',application.industry_keys));
  return jsonb_build_object('status','approved','organizationId',new_org);
end
$function$;

revoke all on function
  public.company_application_submit(jsonb),
  public.company_applications_mine(),
  public.company_applications_review(text,integer),
  public.company_application_decide(uuid,text,text)
from public, anon;
grant execute on function
  public.company_application_submit(jsonb),
  public.company_applications_mine(),
  public.company_applications_review(text,integer),
  public.company_application_decide(uuid,text,text)
to authenticated;

commit;
