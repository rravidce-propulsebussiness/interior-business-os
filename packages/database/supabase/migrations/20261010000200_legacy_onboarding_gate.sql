-- New applications use the review queue. This gate is deliberately OFF on
-- installation so older integrations are not cut off before hosted acceptance.
-- Enable through a platform permission-checked RPC only after QA and approval.
begin;

create table private.company_onboarding_policy (
 singleton boolean primary key default true check(singleton),
 approval_required boolean not null default false,
 updated_at timestamptz not null default now(),
 changed_by uuid references public.profiles(id)
);
insert into private.company_onboarding_policy(singleton,approval_required) values(true,false);
alter table private.company_onboarding_policy enable row level security;
revoke all on private.company_onboarding_policy from public, anon, authenticated;

create function public.company_onboarding_policy()
returns jsonb language plpgsql stable security definer set search_path=''
as $policy$
begin
 perform private.require_platform('platform.organizations.manage');
 return jsonb_build_object(
  'approvalRequired',
  coalesce((select approval_required from private.company_onboarding_policy where singleton=true),true),
  'updatedAt',
  (select updated_at from private.company_onboarding_policy where singleton=true)
 );
end
$policy$;

create function public.company_onboarding_set_policy(p_approval_required boolean)
returns jsonb language plpgsql security definer set search_path=''
as $policy$
begin
 perform private.require_platform('platform.organizations.manage');
 if p_approval_required is null then
   raise exception 'Approval policy must be explicit' using errcode='22023';
 end if;
 update private.company_onboarding_policy
   set approval_required=p_approval_required,updated_at=now(),changed_by=auth.uid()
 where singleton=true;
 if not found then
   raise exception 'Missing company onboarding policy' using errcode='23514';
 end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'company.onboarding.policy.changed','platform_onboarding',
    'company-onboarding',jsonb_build_object('approvalRequired',p_approval_required));
 return jsonb_build_object('approvalRequired',p_approval_required);
end
$policy$;

-- Replace the exact historical function contract, including all validation,
-- role templates, billing defaults and atomic owner assignment. Only add a
-- precondition after the original active-user check. This preserves the
-- existing behavior when approval_required is false.
create or replace function public.create_organization(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; member uuid; template record; role_id uuid; selected_industry uuid;
begin
 if not private.is_active_user() then raise exception 'Unauthenticated' using errcode='42501'; end if;
 if coalesce((select approval_required from private.company_onboarding_policy where singleton = true), true) then
  raise exception 'Reviewed company application required' using errcode='42501';
 end if;
 if jsonb_typeof(p_input)<>'object' or length(trim(coalesce(p_input->>'name',''))) not between 1 and 200
 or coalesce(p_input->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_input->>'slug')>80
 or coalesce(p_input->>'currency','') !~ '^[A-Z]{3}$' or coalesce(p_input->>'country','') !~ '^[A-Z]{2}$'
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_input->>'timezone')
 then raise exception 'Invalid organization' using errcode='22023'; end if;
 if p_input->>'industryId' is not null then
  select id into selected_industry from public.industries where id=(p_input->>'industryId')::uuid and status='active';
  if selected_industry is null then raise exception 'Invalid industry' using errcode='22023'; end if;
 end if;
 insert into public.organizations(name,slug,default_currency,country_code,default_timezone,created_by,plan_id)
 values(trim(p_input->>'name'),p_input->>'slug',p_input->>'currency',p_input->>'country',p_input->>'timezone',auth.uid(),(select d.plan_id from private.provisioning_defaults d join public.plans p on p.id=d.plan_id where p.status='active')) returning id into org;
 insert into public.organization_memberships(organization_id,user_id,status) values(org,auth.uid(),'active') returning id into member;
 for template in select * from private.role_templates order by key loop
  insert into public.roles(organization_id,key,name,is_owner) values(org,template.key,template.name,template.is_owner) returning id into role_id;
  insert into public.role_permissions(organization_id,role_id,permission_id) select org,role_id,p.id from private.role_template_permissions t join public.permissions p on p.key=t.permission_key where t.role_key=template.key and p.scope='organization';
  if template.is_owner then insert into public.membership_roles(organization_id,membership_id,role_id) values(org,member,role_id); end if;
 end loop;
 if selected_industry is not null then insert into public.organization_industries values(org,selected_industry,now(),now()); end if;
 perform private.assert_owner(org);
 return org;
end $$;

revoke all on function public.company_onboarding_policy(),
 public.company_onboarding_set_policy(boolean) from public,anon;
grant execute on function public.company_onboarding_policy(),
 public.company_onboarding_set_policy(boolean) to authenticated;

commit;
