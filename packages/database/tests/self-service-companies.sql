\set ON_ERROR_STOP on
begin;

create function private.self_signup_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

create function private.self_signup_denied(command text, label text)
returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when sqlstate '42501' then
    raise notice 'PASS: %', label;
    return;
  end;
  raise exception 'FAILED: %', label;
end $$;

insert into auth.users(id,email,email_confirmed_at) values
('00000000-0000-4000-8000-000000000081','self-owner-a@example.test',now()),
('00000000-0000-4000-8000-000000000082','self-owner-b@example.test',now()),
('00000000-0000-4000-8000-000000000083','self-owner-unverified@example.test',null),
('00000000-0000-4000-8000-000000000084','self-owner-platform@example.test',now());

insert into public.platform_user_roles(user_id,role_id)
  select '00000000-0000-4000-8000-000000000084', id
  from public.platform_roles where key='platform_super_admin';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000083',true);
select private.self_signup_denied(
  $$select public.company_self_register('{"name":"Unauthorized","slug":"unverified-self-signup","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior"]}')$$,
  'unverified account cannot self-register');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000081',true);
select public.company_self_register(
 '{"name":"Self Registered A","slug":"self-registered-a","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior","construction"]}'
) as created_a \gset
select private.self_signup_assert(
  (:'created_a'::jsonb->>'status') = 'approved',
  'verified user is approved immediately during testing');
select private.self_signup_assert(
  exists(select 1 from public.organizations where id = (:'created_a'::jsonb->>'organizationId')::uuid
    and created_by = '00000000-0000-4000-8000-000000000081'),
  'new organization is owned by verified caller');
select private.self_signup_assert(
  exists(
    select 1 from public.organization_memberships m
    join public.membership_roles mr on mr.membership_id = m.id and mr.organization_id = m.organization_id
    join public.roles r on r.id = mr.role_id and r.is_owner
    where m.organization_id = (:'created_a'::jsonb->>'organizationId')::uuid
      and m.user_id = '00000000-0000-4000-8000-000000000081'
      and m.status = 'active'
  ), 'creator has active Owner role');
select private.self_signup_assert(
  (select count(*)=2 from public.organization_industries
   where organization_id = (:'created_a'::jsonb->>'organizationId')::uuid),
  'multiple industries share one tenant');
select private.self_signup_assert(
  not public.has_entitlement((:'created_a'::jsonb->>'organizationId')::uuid,'projects')
  and not public.has_entitlement((:'created_a'::jsonb->>'organizationId')::uuid,'website'),
  'unpaid direct customer cannot access website hosting or paid OS modules');
select private.self_signup_assert(
  (select p.key='website_pending' from public.organizations o
    join public.plans p on p.id=o.plan_id
    where o.id=(:'created_a'::jsonb->>'organizationId')::uuid)
  and not exists(select 1 from public.organization_entitlements
    where organization_id=(:'created_a'::jsonb->>'organizationId')::uuid
      and source='promotion'),
  'direct signup awaits verified paid plan activation');
select private.self_signup_assert(
  not private.has_platform_permission('platform.organizations.manage'),
  'company creator does not gain platform admin privileges');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000082',true);
select public.company_self_register(
 '{"name":"Self Registered B","slug":"self-registered-b","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["construction"]}'
) as created_b \gset
select private.self_signup_assert(
  not private.is_member((:'created_a'::jsonb->>'organizationId')::uuid),
  'another company cannot access the first tenant');
select private.self_signup_assert(
  not exists(select 1 from public.organizations where slug='self-registered-a'),
  'organization read RLS remains tenant-scoped');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000084',true);
select public.company_onboarding_set_policy(true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000081',true);
select public.company_self_register(
 '{"name":"Review Only Company","slug":"self-review-required","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior"]}'
) as pending \gset
select private.self_signup_assert(
  (:'pending'::jsonb->>'status')='pending_review'
  and not exists (select 1 from public.organizations where slug='self-review-required'),
  'turning on approval policy prevents automatic owner provisioning');
select private.self_signup_denied(
  $$select public.company_onboarding_set_policy(false)$$,
  'ordinary owner cannot disable platform approval policy');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000084',true);
select public.company_onboarding_set_policy(false);

rollback;
