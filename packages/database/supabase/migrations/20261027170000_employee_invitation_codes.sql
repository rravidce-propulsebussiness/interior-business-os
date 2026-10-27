-- One-time, email-bound invitation codes. Project/client portal access remains separate.
-- The existing invitation is authoritative for organization, roles, branch, expiry, and revocation.
begin;

create table private.employee_invitation_codes (
 invitation_id uuid primary key references private.employee_invitations(id) on delete cascade,
 code_hash bytea not null unique,
 created_at timestamptz not null default now()
);
create index employee_invitation_codes_hash_lookup on private.employee_invitation_codes(code_hash);
alter table private.employee_invitation_codes enable row level security;
revoke all on private.employee_invitation_codes from public, anon, authenticated, business_os_worker;

create function public.employee_invitation_code_create(
 p_organization_id uuid, p_email text, p_role_ids uuid[], p_branch_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_id uuid; v_code text; v_expiry timestamptz;
begin
 -- Reuse the canonical, permission-checked, rate-limited invitation flow.
 -- It rejects owner roles, duplicate roles, invalid branches and existing members.
 v_id := public.employee_invitation_create(p_organization_id,p_email,p_role_ids,p_branch_id);
 -- UUIDv4 holds 122 unpredictable bits. Never persist a plaintext code.
 v_code := upper(replace(gen_random_uuid()::text,'-',''));
 insert into private.employee_invitation_codes(invitation_id,code_hash)
 values (v_id,sha256(convert_to(v_code,'UTF8')));
 select expires_at into v_expiry from private.employee_invitations where id=v_id;
 return jsonb_build_object(
  'code',substring(v_code,1,8)||'-'||substring(v_code,9,8)||'-'||
    substring(v_code,17,8)||'-'||substring(v_code,25,8),
  'expiresAt',v_expiry,'invitationId',v_id
 );
end $fn$;

create function public.employee_invitation_code_accept(p_code text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_code text; v_invitation uuid; v_membership uuid;
begin
 if not private.is_active_user() then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 then raise exception 'Verify your email first' using errcode='42501'; end if;
 v_code := upper(regexp_replace(coalesce(p_code,''),'[[:space:]-]','','g'));
 if length(v_code)<>32 or v_code !~ '^[A-F0-9]{32}$' then
  raise exception 'Invalid or expired invitation code' using errcode='42501'; end if;
 select c.invitation_id into v_invitation
 from private.employee_invitation_codes c
 join private.employee_invitations i on i.id=c.invitation_id
 where c.code_hash=sha256(convert_to(v_code,'UTF8'))
   and i.status='pending' and i.expires_at>now();
 if v_invitation is null then
  raise exception 'Invalid or expired invitation code' using errcode='42501'; end if;
 -- Canonical acceptance re-verifies verified recipient email, issuer's CURRENT
 -- delegable authority, active organization/branch and role assignments.
 v_membership := public.employee_invitation_accept(v_invitation);
 delete from private.employee_invitation_codes where invitation_id=v_invitation;
 return v_membership;
end $fn$;

revoke all on function public.employee_invitation_code_create(uuid,text,uuid[],uuid),
 public.employee_invitation_code_accept(text) from public,anon;
grant execute on function public.employee_invitation_code_create(uuid,text,uuid[],uuid),
 public.employee_invitation_code_accept(text) to authenticated;
commit;
