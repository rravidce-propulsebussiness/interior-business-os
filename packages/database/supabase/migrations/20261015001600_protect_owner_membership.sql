-- Team managers may administer employees, but not their own account or an
-- Owner membership. Company subscription changes remain platform-admin only.
begin;

create or replace function public.set_membership_status(
  p_organization_id uuid, p_membership_id uuid, p_status text
) returns void
language plpgsql security definer set search_path='' as $fn$
declare
  v_member_user uuid;
begin
  perform private.require_permission(p_organization_id, 'team.manage');
  if p_status not in ('active', 'suspended', 'revoked') then
    raise exception 'Invalid status' using errcode='22023';
  end if;
  if p_status = 'revoked'
     and not private.has_permission(p_organization_id, 'team.remove') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  select m.user_id into v_member_user
    from public.organization_memberships m
   where m.id=p_membership_id and m.organization_id=p_organization_id
   for update;
  if not found or v_member_user=auth.uid() then
    raise exception 'Forbidden: protected membership' using errcode='42501';
  end if;
  if exists(
    select 1 from public.membership_roles mr
    join public.roles r
      on r.id=mr.role_id and r.organization_id=mr.organization_id
    where mr.organization_id=p_organization_id
      and mr.membership_id=p_membership_id and r.is_owner
  ) then
    raise exception 'Forbidden: owner membership is protected' using errcode='42501';
  end if;

  update public.organization_memberships
    set status=p_status
    where id=p_membership_id and organization_id=p_organization_id;
  perform private.assert_owner(p_organization_id);
end $fn$;

create or replace function public.set_member_role(
  p_organization_id uuid, p_membership_id uuid, p_role_id uuid,
  p_branch_id uuid default null, p_remove boolean default false
) returns void
language plpgsql security definer set search_path='' as $fn$
declare
  owner_role boolean;
  v_member_user uuid;
begin
  perform private.require_permission(p_organization_id, 'team.manage');
  if not private.has_permission(p_organization_id, 'role.manage') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  select m.user_id into v_member_user
    from public.organization_memberships m
   where m.id=p_membership_id and m.organization_id=p_organization_id
   for update;
  if not found or v_member_user=auth.uid() then
    raise exception 'Forbidden: protected membership' using errcode='42501';
  end if;
  if exists(
    select 1 from public.membership_roles mr
    join public.roles r
      on r.id=mr.role_id and r.organization_id=mr.organization_id
    where mr.organization_id=p_organization_id
      and mr.membership_id=p_membership_id and r.is_owner
  ) then
    raise exception 'Forbidden: owner membership is protected' using errcode='42501';
  end if;

  select is_owner into owner_role
    from public.roles where id=p_role_id and organization_id=p_organization_id;
  if not found then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if owner_role and (
    p_branch_id is not null
    or exists(
      select 1 from public.organization_memberships
       where id=p_membership_id and branch_id is not null
    )
    or not exists(
      select 1 from public.organization_memberships m
      join public.membership_roles mr on mr.membership_id=m.id
      join public.roles r on r.id=mr.role_id
       where m.organization_id=p_organization_id
         and m.user_id=auth.uid() and m.status='active'
         and m.branch_id is null and mr.branch_id is null and r.is_owner
    )
  ) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if exists(
    select 1 from public.role_permissions rp
    join public.permissions p on p.id=rp.permission_id
     where rp.role_id=p_role_id
       and not private.has_permission(p_organization_id, p.key)
  ) then
    raise exception 'Cannot grant additional authority' using errcode='42501';
  end if;

  if p_remove then
    delete from public.membership_roles
     where organization_id=p_organization_id
       and membership_id=p_membership_id and role_id=p_role_id
       and branch_id is not distinct from p_branch_id;
  else
    insert into public.membership_roles(
      organization_id, membership_id, role_id, branch_id
    ) values(p_organization_id, p_membership_id, p_role_id, p_branch_id)
    on conflict do nothing;
  end if;
  perform private.assert_owner(p_organization_id);
end $fn$;

revoke all on function public.set_membership_status(uuid,uuid,text)
  from public,anon;
revoke all on function public.set_member_role(uuid,uuid,uuid,uuid,boolean)
  from public,anon;
grant execute on function public.set_membership_status(uuid,uuid,text)
  to authenticated;
grant execute on function public.set_member_role(uuid,uuid,uuid,uuid,boolean)
  to authenticated;
commit;
