begin;
create table private.provisioning_defaults (singleton boolean primary key default true check(singleton), plan_id uuid references public.plans(id));

create function private.require_permission(org uuid, permission text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.organizations where id=org for update;
 if not private.has_permission(org,permission) then raise exception 'Forbidden' using errcode='42501'; end if;
end $$;
create function private.require_platform(permission text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_platform_permission(permission) then raise exception 'Forbidden' using errcode='42501'; end if;
end $$;
create function public.organization_context(p_organization_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_member(p_organization_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 select jsonb_build_object('userId',m.user_id,'organizationId',m.organization_id,'membershipId',m.id,'membershipStatus',m.status,
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'branchId',coalesce(m.branch_id,mr.branch_id)))
 from public.membership_roles mr join public.roles r on r.id=mr.role_id where mr.membership_id=m.id
 and (m.branch_id is null or mr.branch_id is null or mr.branch_id=m.branch_id)
 and (coalesce(m.branch_id,mr.branch_id) is null or exists(select 1 from public.branches b where b.id=coalesce(m.branch_id,mr.branch_id) and b.organization_id=m.organization_id and b.status='active'))),'[]'::jsonb),
 'grants',coalesce((select jsonb_agg(g) from (select distinct jsonb_build_object('permission',p.key,'scope',case when coalesce(m.branch_id,mr.branch_id) is null then jsonb_build_object('kind','organization') else jsonb_build_object('kind','branch','branchId',coalesce(m.branch_id,mr.branch_id)) end) g
 from public.membership_roles mr join public.role_permissions rp on rp.role_id=mr.role_id join public.permissions p on p.id=rp.permission_id
 where mr.membership_id=m.id and p.scope='organization'
 and (m.branch_id is null or mr.branch_id is null or mr.branch_id=m.branch_id)
 and (coalesce(m.branch_id,mr.branch_id) is null or exists(select 1 from public.branches b where b.id=coalesce(m.branch_id,mr.branch_id) and b.organization_id=m.organization_id and b.status='active'))) grants),'[]'::jsonb),
 'entitlements',coalesce((select jsonb_agg(key order by key) from public.modules where private.entitled(m.organization_id,key)),'[]'::jsonb)) into result
 from public.organization_memberships m where m.user_id=auth.uid() and m.organization_id=p_organization_id and m.status='active';
 return result;
end $$;
create function public.platform_context() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('roles',coalesce((select jsonb_agg(r.key) from public.platform_user_roles ur join public.platform_roles r on r.id=ur.role_id where ur.user_id=auth.uid() and private.is_active_user()),'[]'::jsonb),
 'permissions',coalesce((select jsonb_agg(distinct p.key) from public.platform_user_roles ur join public.platform_role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id where ur.user_id=auth.uid() and p.scope='platform' and private.is_active_user()),'[]'::jsonb));
$$;
create function public.create_organization(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; member uuid; template record; role_id uuid; selected_industry uuid;
begin
 if not private.is_active_user() then raise exception 'Unauthenticated' using errcode='42501'; end if;
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

create function public.save_branch(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.require_permission(p_organization_id,'branch.manage');
 if length(trim(coalesce(p_input->>'name',''))) not between 1 and 200 or length(coalesce(p_input->>'code','')) not between 1 and 50 then raise exception 'Invalid branch' using errcode='22023'; end if;
 if p_input->>'timezone' is not null and not exists(select 1 from pg_catalog.pg_timezone_names where name=p_input->>'timezone') then raise exception 'Invalid timezone' using errcode='22023'; end if;
 if p_input->>'id' is null then
  insert into public.branches(organization_id,name,code,timezone) values(p_organization_id,trim(p_input->>'name'),p_input->>'code',p_input->>'timezone') returning id into result;
 else
  update public.branches set name=trim(p_input->>'name'),code=p_input->>'code',timezone=p_input->>'timezone',status=coalesce(p_input->>'status','active') where organization_id=p_organization_id and id=(p_input->>'id')::uuid returning id into result;
  if result is null then raise exception 'Not found' using errcode='42501'; end if;
 end if;
 return result;
end $$;
create function public.invite_member(p_organization_id uuid,p_user_id uuid,p_branch_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform private.require_permission(p_organization_id,'team.invite');
 if not exists(select 1 from public.profiles where id=p_user_id and status='active') then raise exception 'Invalid member' using errcode='22023'; end if;
 insert into public.organization_memberships(organization_id,user_id,branch_id,status) values(p_organization_id,p_user_id,p_branch_id,'invited') returning id into result;
 return result;
end $$;
create function public.accept_membership(p_membership_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 select organization_id into org from public.organization_memberships where id=p_membership_id and user_id=auth.uid() and status='invited';
 perform 1 from public.organizations where id=org and status in ('active','trial') for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 update public.organization_memberships set status='active' where id=p_membership_id and user_id=auth.uid() and status='invited';
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
end $$;
create function public.set_membership_status(p_organization_id uuid,p_membership_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_permission(p_organization_id,'team.manage');
 if p_status not in ('active','suspended','revoked') then raise exception 'Invalid status' using errcode='22023'; end if;
 if p_status='revoked' and not private.has_permission(p_organization_id,'team.remove') then raise exception 'Forbidden' using errcode='42501'; end if;
 update public.organization_memberships set status=p_status where id=p_membership_id and organization_id=p_organization_id;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.assert_owner(p_organization_id);
end $$;
create function public.set_member_role(p_organization_id uuid,p_membership_id uuid,p_role_id uuid,p_branch_id uuid default null,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare owner_role boolean;
begin
 perform private.require_permission(p_organization_id,'team.manage');
 if not private.has_permission(p_organization_id,'role.manage') then raise exception 'Forbidden' using errcode='42501'; end if;
 select is_owner into owner_role from public.roles where id=p_role_id and organization_id=p_organization_id;
 if not found or not exists(select 1 from public.organization_memberships where id=p_membership_id and organization_id=p_organization_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if owner_role and (p_branch_id is not null or exists(select 1 from public.organization_memberships where id=p_membership_id and branch_id is not null)
 or not exists(select 1 from public.organization_memberships m join public.membership_roles mr on mr.membership_id=m.id join public.roles r on r.id=mr.role_id where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.status='active' and m.branch_id is null and mr.branch_id is null and r.is_owner))
 then raise exception 'Forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=p_role_id and not private.has_permission(p_organization_id,p.key)) then raise exception 'Cannot grant additional authority' using errcode='42501'; end if;
 if p_remove then
  delete from public.membership_roles where organization_id=p_organization_id and membership_id=p_membership_id and role_id=p_role_id and branch_id is not distinct from p_branch_id;
 else
  insert into public.membership_roles(organization_id,membership_id,role_id,branch_id) values(p_organization_id,p_membership_id,p_role_id,p_branch_id) on conflict do nothing;
 end if;
 perform private.assert_owner(p_organization_id);
end $$;
create function public.save_role(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; keys text[];
begin
 perform private.require_permission(p_organization_id,'role.manage');
 if length(coalesce(p_input->>'name','')) not between 1 and 100 or coalesce(p_input->>'key','') !~ '^[a-z][a-z0-9_]*$' or jsonb_typeof(p_input->'permissions') is distinct from 'array' then raise exception 'Invalid role' using errcode='22023'; end if;
 select array_agg(value) into keys from jsonb_array_elements_text(p_input->'permissions');
 if exists(select 1 from unnest(keys) k where not exists(select 1 from public.permissions p where p.key=k and p.scope='organization') or not private.has_permission(p_organization_id,k)) then raise exception 'Cannot grant additional authority' using errcode='42501'; end if;
 if p_input->>'id' is null then
  insert into public.roles(organization_id,key,name) values(p_organization_id,p_input->>'key',p_input->>'name') returning id into result;
 else
  update public.roles set key=p_input->>'key',name=p_input->>'name' where organization_id=p_organization_id and id=(p_input->>'id')::uuid and not is_owner returning id into result;
  if result is null then raise exception 'Forbidden' using errcode='42501'; end if;
  -- Caller must also possess permissions being removed, avoiding delegated administrators editing stronger roles.
  if exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=result and not private.has_permission(p_organization_id,p.key)) then raise exception 'Forbidden' using errcode='42501'; end if;
  delete from public.role_permissions where role_id=result;
 end if;
 insert into public.role_permissions(organization_id,role_id,permission_id) select p_organization_id,result,id from public.permissions where key=any(keys);
 return result;
end $$;

create function public.platform_set_organization(p_organization_id uuid,p_status text,p_plan_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_platform('platform.organizations.manage');
 if p_status not in ('active','trial','suspended','archived') then raise exception 'Invalid status' using errcode='22023'; end if;
 if p_plan_id is not null and not exists(select 1 from public.plans where id=p_plan_id and status='active') then raise exception 'Invalid plan' using errcode='22023'; end if;
 update public.organizations set status=p_status,plan_id=p_plan_id where id=p_organization_id;
 if not found then raise exception 'Not found' using errcode='22023'; end if;
end $$;
create function public.platform_set_entitlement(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; selected_module uuid; starts timestamptz; ends timestamptz;
begin
 perform private.require_platform('platform.entitlements.manage');
 select id into selected_module from public.modules where key=p_input->>'moduleKey';
 if selected_module is null or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' or coalesce(p_input->>'source','') not in ('addon','promotion','manual') then raise exception 'Invalid entitlement' using errcode='22023'; end if;
 starts=coalesce((p_input->>'validFrom')::timestamptz,now()); ends=(p_input->>'validUntil')::timestamptz;
 if ends is not null and ends<=starts then raise exception 'Invalid dates' using errcode='22023'; end if;
 perform 1 from public.organizations where id=p_organization_id for update;
 if not found then raise exception 'Invalid organization' using errcode='22023'; end if;
 insert into public.organization_entitlements(organization_id,module_id,enabled,source,valid_from,valid_until,configuration)
 values(p_organization_id,selected_module,(p_input->>'enabled')::boolean,p_input->>'source',starts,ends,coalesce(p_input->'configuration','{}'::jsonb))
 on conflict(organization_id,module_id,source) do update set enabled=excluded.enabled,valid_from=excluded.valid_from,valid_until=excluded.valid_until,configuration=excluded.configuration returning id into result;
 return result;
end $$;
create function public.platform_set_role(p_user_id uuid,p_role_id uuid,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_platform('platform.roles.manage');
 -- Serialize platform role changes and retain at least one active administrator with role-management authority.
 perform pg_catalog.pg_advisory_xact_lock(71401001);
 if p_remove then delete from public.platform_user_roles where user_id=p_user_id and role_id=p_role_id;
 else insert into public.platform_user_roles(user_id,role_id) values(p_user_id,p_role_id) on conflict do nothing; end if;
 if not exists(select 1 from public.platform_user_roles ur join public.platform_role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id join public.profiles pr on pr.id=ur.user_id where p.key='platform.roles.manage' and pr.status='active') then raise exception 'An active platform administrator is required' using errcode='23514'; end if;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_active_user(),private.is_member(uuid),private.has_permission(uuid,text,uuid),private.has_platform_permission(text) to authenticated;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('organization_context','platform_context','create_organization','save_branch','invite_member','accept_membership','set_membership_status','set_member_role','save_role','platform_set_organization','platform_set_entitlement','platform_set_role') loop
  execute format('revoke all on function %s from public, anon',fn.signature);
  execute format('grant execute on function %s to authenticated',fn.signature);
 end loop;
end $$;
commit;
