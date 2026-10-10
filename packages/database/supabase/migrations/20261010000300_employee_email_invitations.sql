-- Employee invitations are bound to a confirmed Auth email, not to an untrusted link token.
-- All tenant memberships, roles and permissions remain in the existing canonical tables.
begin;

create table private.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  invited_by uuid not null references public.profiles(id),
  role_ids uuid[] not null check (cardinality(role_ids) between 1 and 8),
  branch_id uuid,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resent_at timestamptz,
  mail_version integer not null default 1,
  mail_status text not null default 'queued' check (mail_status in ('queued','sending','retry','sent','failed')),
  mail_attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  mail_lease uuid,
  mail_lease_until timestamptz,
  foreign key (organization_id,branch_id) references public.branches(organization_id,id)
);
create unique index employee_invitation_one_pending on private.employee_invitations(organization_id,email)
  where status='pending';
create index employee_invitation_delivery_queue
  on private.employee_invitations(next_attempt_at,id) where status='pending';
create index employee_invitation_by_email on private.employee_invitations(email,status,expires_at);
alter table private.employee_invitations enable row level security;
revoke all on private.employee_invitations from public,anon,authenticated,business_os_worker;

-- Recheck the issuer's CURRENT unbranched authority on acceptance, so a revoked
-- administrator or downgraded role cannot leave privileged outstanding grants.
create function private.employee_invitation_delegable(p_org uuid,p_issuer uuid,p_roles uuid[])
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists (
   select 1 from public.organization_memberships m
   join public.organizations o on o.id=m.organization_id and o.status in ('active','trial')
   where m.user_id=p_issuer and m.organization_id=p_org and m.status='active' and m.branch_id is null
 ) and
 not exists(
   select 1 from public.roles r where r.id=any(p_roles) and (r.organization_id<>p_org or r.is_owner)
 ) and
 (select count(*) from public.roles r where r.id=any(p_roles) and r.organization_id=p_org and not r.is_owner)
   = cardinality(p_roles) and
 not exists (
   select 1 from public.role_permissions target
   join public.permissions p on p.id=target.permission_id
   where target.role_id=any(p_roles) and target.organization_id=p_org
     and not exists (
       select 1 from public.organization_memberships m
       join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
       join public.role_permissions grant_role on grant_role.organization_id=m.organization_id and grant_role.role_id=mr.role_id
       where m.user_id=p_issuer and m.organization_id=p_org and m.status='active'
         and m.branch_id is null and mr.branch_id is null and grant_role.permission_id=p.id
     )
 ) and
 not exists (
   select 1 from (values ('team.invite'),('role.manage')) required(key)
   where not exists (
     select 1 from public.organization_memberships m
     join public.membership_roles mr on mr.organization_id=m.organization_id and mr.membership_id=m.id
     join public.role_permissions rp on rp.organization_id=m.organization_id and rp.role_id=mr.role_id
     join public.permissions p on p.id=rp.permission_id
     where m.user_id=p_issuer and m.organization_id=p_org and m.status='active'
       and m.branch_id is null and mr.branch_id is null and p.key=required.key
   )
 );
$fn$;

create function public.employee_invitation_create(
 p_organization_id uuid,p_email text,p_role_ids uuid[],p_branch_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_email text=lower(btrim(p_email)); result uuid;
begin
 perform private.require_permission(p_organization_id,'team.invite');
 perform private.require_permission(p_organization_id,'role.manage');
 if v_email is null or length(v_email) not between 3 and 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_role_ids is null or cardinality(p_role_ids) not between 1 and 8
    or cardinality(array(select distinct unnest(p_role_ids)))<>cardinality(p_role_ids)
    or array_position(p_role_ids,null) is not null
    or not private.employee_invitation_delegable(p_organization_id,auth.uid(),p_role_ids)
 then raise exception 'Invalid invitation or insufficient role authority' using errcode='42501'; end if;
 if p_branch_id is not null and not exists (
   select 1 from public.branches where organization_id=p_organization_id and id=p_branch_id and status='active'
 ) then raise exception 'Invalid branch' using errcode='22023'; end if;
 if exists(select 1 from public.organization_memberships m
   join auth.users u on u.id=m.user_id
   where m.organization_id=p_organization_id and lower(u.email)=v_email and m.status<>'revoked')
 then raise exception 'Already a member' using errcode='23505'; end if;
 if (select count(*) from private.employee_invitations
     where organization_id=p_organization_id and created_at>now()-interval '24 hours')>=20
 then raise exception 'Daily invitation limit' using errcode='42501'; end if;
 insert into private.employee_invitations(organization_id,email,invited_by,role_ids,branch_id)
 values(p_organization_id,v_email,auth.uid(),p_role_ids,p_branch_id)
 returning id into result;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),p_organization_id,'employee.invitation.created','employee_invitation',result::text,
   jsonb_build_object('role_count',cardinality(p_role_ids),'branch_scoped',p_branch_id is not null));
 return result;
end $fn$;

create function public.employee_invitations_list(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 if not private.has_permission(p_organization_id,'team.invite') then
   raise exception 'Forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',i.id,'email',i.email,'status',
     case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
   'roleIds',i.role_ids,'branchId',i.branch_id,
   'expiresAt',i.expires_at,'mailStatus',i.mail_status,'createdAt',i.created_at
 ) order by i.created_at desc)
 from private.employee_invitations i where i.organization_id=p_organization_id), '[]'::jsonb);
end $fn$;

create function public.employee_invitations_mine()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_email text;
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 select lower(email) into v_email from auth.users
   where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verify your email before accepting invitations'
   using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',i.id,'organizationName',o.name,'status',
     case when i.expires_at<=now() then 'expired' else i.status end,
   'expiresAt',i.expires_at,'roleCount',cardinality(i.role_ids)
 ) order by i.created_at desc)
 from private.employee_invitations i
 join public.organizations o on o.id=i.organization_id
 where i.email=v_email and i.status='pending'), '[]'::jsonb);
end $fn$;

create function public.employee_invitation_accept(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare i private.employee_invitations; v_email text; v_membership uuid;
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 select lower(email) into v_email from auth.users
   where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified email required' using errcode='42501'; end if;
 select * into i from private.employee_invitations where id=p_invitation_id for update;
 if not found or i.status<>'pending' or i.expires_at<=now() or i.email<>v_email
    or not private.employee_invitation_delegable(i.organization_id,i.invited_by,i.role_ids)
 then raise exception 'Unavailable invitation' using errcode='42501'; end if;
 perform 1 from public.organizations where id=i.organization_id and status in ('active','trial') for update;
 if not found then raise exception 'Inactive company' using errcode='42501'; end if;
 if i.branch_id is not null and not exists (
   select 1 from public.branches where organization_id=i.organization_id and id=i.branch_id and status='active'
 ) then raise exception 'Inactive branch' using errcode='42501'; end if;
 if exists(select 1 from public.organization_memberships
   where organization_id=i.organization_id and user_id=auth.uid())
 then raise exception 'Existing membership must be managed by an administrator' using errcode='23505'; end if;
 insert into public.organization_memberships(organization_id,user_id,branch_id,status)
 values(i.organization_id,auth.uid(),i.branch_id,'active') returning id into v_membership;
 insert into public.membership_roles(organization_id,membership_id,role_id,branch_id)
 select i.organization_id,v_membership,role_id,i.branch_id from unnest(i.role_ids) as role_id;
 update private.employee_invitations
   set status='accepted',accepted_by=auth.uid(),accepted_at=now(),updated_at=now()
   where id=i.id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),i.organization_id,'employee.invitation.accepted','organization_membership',v_membership::text,
   jsonb_build_object('invitation_id',i.id,'role_count',cardinality(i.role_ids)));
 return v_membership;
end $fn$;

create function public.employee_invitation_revoke(p_organization_id uuid,p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 perform private.require_permission(p_organization_id,'team.invite');
 update private.employee_invitations set status='revoked',updated_at=now()
 where id=p_invitation_id and organization_id=p_organization_id and status='pending';
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'employee.invitation.revoked','employee_invitation',p_invitation_id::text);
end $fn$;

create function public.employee_invitation_resend(p_organization_id uuid,p_invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare i private.employee_invitations;
begin
 perform private.require_permission(p_organization_id,'team.invite');
 select * into i from private.employee_invitations
 where id=p_invitation_id and organization_id=p_organization_id for update;
 if not found or i.status<>'pending'
    or coalesce(i.resent_at,i.created_at)>now()-interval '10 minutes'
    or not private.employee_invitation_delegable(i.organization_id,i.invited_by,i.role_ids)
 then raise exception 'Invitation not eligible for resend' using errcode='42501'; end if;
 update private.employee_invitations
 set expires_at=now()+interval '7 days',mail_version=mail_version+1,
     mail_status='queued',mail_attempts=0,next_attempt_at=now(),
     mail_lease=null,mail_lease_until=null,resent_at=now(),updated_at=now()
 where id=p_invitation_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_organization_id,'employee.invitation.resent','employee_invitation',p_invitation_id::text);
end $fn$;

-- Mail runs only in the existing restricted background worker. No API key
-- or provider secret is placed in the Business App.
create function private.employee_invitation_email_claim()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare i private.employee_invitations; v_name text; v_lease uuid;
begin
 for i in select * from private.employee_invitations
   where status='pending' and expires_at>now()
     and (mail_status in ('queued','retry') or (mail_status='sending' and mail_lease_until<now()))
     and mail_attempts<3 and next_attempt_at<=now()
   order by next_attempt_at,id for update skip locked limit 1
 loop
  if not private.employee_invitation_delegable(i.organization_id,i.invited_by,i.role_ids) then
    update private.employee_invitations set mail_status='failed',updated_at=now() where id=i.id;
    continue;
  end if;
  select name into v_name from public.organizations where id=i.organization_id and status in ('active','trial');
  if v_name is null then continue; end if;
  v_lease=gen_random_uuid();
  update private.employee_invitations
    set mail_status='sending',mail_lease=v_lease,mail_lease_until=now()+interval '2 minutes',
        mail_attempts=mail_attempts+1,updated_at=now()
    where id=i.id;
  return jsonb_build_object(
    'id',i.id,'lease',v_lease,'recipient',i.email,
    'organizationName',regexp_replace(v_name,'[\r\n]+',' ','g'),
    'idempotencyKey','employee-invite-'||i.id::text||'-'||i.mail_version::text
  );
 end loop;
 -- JSON null is emitted as literal 'null' by psql; SQL NULL would be an
 -- empty line and break the existing worker's JSON parser on idle ticks.
 return 'null'::jsonb;
end $fn$;

create function private.employee_invitation_email_ack(
 p_id uuid,p_lease uuid,p_result text,p_provider_id text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_status text;
begin
 if p_result not in ('sent','transient','permanent','unconfigured') then
   raise exception 'Invalid outcome' using errcode='22023'; end if;
 update private.employee_invitations
 set mail_status=case
       when p_result='sent' then 'sent'
       when p_result='transient' and mail_attempts<3 and expires_at>now()+interval '15 minutes' then 'retry'
       else 'failed' end,
     next_attempt_at=case when p_result='transient' then now()+interval '5 minutes' else next_attempt_at end,
     mail_lease=null,mail_lease_until=null,updated_at=now()
 where id=p_id and mail_lease=p_lease and mail_status='sending'
 returning mail_status into v_status;
 if not found then raise exception 'Invalid mail lease' using errcode='42501'; end if;
 return jsonb_build_object('status',v_status);
end $fn$;

revoke all on function private.employee_invitation_delegable(uuid,uuid,uuid[]),
  private.employee_invitation_email_claim(),private.employee_invitation_email_ack(uuid,uuid,text,text)
  from public,anon,authenticated,business_os_worker;
grant execute on function private.employee_invitation_email_claim(),
  private.employee_invitation_email_ack(uuid,uuid,text,text) to business_os_worker;
revoke all on function public.employee_invitation_create(uuid,text,uuid[],uuid),
  public.employee_invitations_list(uuid),public.employee_invitations_mine(),
  public.employee_invitation_accept(uuid),public.employee_invitation_revoke(uuid,uuid),
  public.employee_invitation_resend(uuid,uuid) from public,anon;
grant execute on function public.employee_invitation_create(uuid,text,uuid[],uuid),
  public.employee_invitations_list(uuid),public.employee_invitations_mine(),
  public.employee_invitation_accept(uuid),public.employee_invitation_revoke(uuid,uuid),
  public.employee_invitation_resend(uuid,uuid) to authenticated;
commit;
