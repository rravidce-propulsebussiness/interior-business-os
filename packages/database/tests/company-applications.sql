\set ON_ERROR_STOP on
begin;
create function private.company_assert(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
create function private.company_denied(command text, label text)
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
('00000000-0000-4000-8000-000000000071','new.owner@example.test',now()),
('00000000-0000-4000-8000-000000000072','unverified.owner@example.test',null),
('00000000-0000-4000-8000-000000000073','reviewer@example.test',now()),
('00000000-0000-4000-8000-000000000074','other.owner@example.test',now());

insert into public.platform_user_roles(user_id,role_id)
  select '00000000-0000-4000-8000-000000000073', id
  from public.platform_roles where key='platform_super_admin';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000072',true);
select private.company_denied(
  $$select public.company_application_submit('{"name":"Unverified","slug":"unverified-owner-company","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior"]}')$$,
  'unverified applicant cannot create application');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000071',true);
select public.company_application_submit(
'{"name":"Combined Interiors & Construction","slug":"combined-company-app-test","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["construction","interior"]}'
) as application_id \gset
select private.company_assert(
  jsonb_array_length(public.company_applications_mine()) = 1,
  'applicant sees own pending application');
select private.company_denied(
  format('select public.company_application_decide(%L, %L)', :'application_id', 'approve'),
  'business applicant cannot approve');
select private.company_denied(
  'select count(*) from private.company_applications',
  'private applications table cannot be read directly');
select private.company_assert(
  not exists (select 1 from public.organizations where slug='combined-company-app-test'),
  'pending application does not provision business or owner');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000074',true);
select private.company_assert(
  jsonb_array_length(public.company_applications_mine()) = 0,
  'another authenticated user cannot see application');
select private.company_denied(
  $$select public.company_applications_review('pending_review',1)$$,
  'other user cannot read admin review queue');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000073',true);
select private.company_assert(
  (public.company_applications_review('pending_review',1)->>'total')::integer > 0,
  'platform super admin sees pending applications');
select public.company_application_decide(:'application_id','approve','Verified details');
select private.company_assert(
  (select count(*)=1 from public.organizations where slug='combined-company-app-test'),
  'approved application atomically provisions exactly one organization');
select private.company_assert(
  (public.company_application_decide(:'application_id','approve','retry')->>'status')='approved',
  'retry after approval is idempotent');
select private.company_assert(
  (select count(*)=1 from public.organizations where slug='combined-company-app-test'),
  'repeated approval cannot duplicate tenant');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000071',true);
select private.company_assert(
  (select count(*)=2 from public.organization_industries oi
   join public.organizations o on o.id=oi.organization_id
   where o.slug='combined-company-app-test'),
  'construction and interior share one tenant');
select private.company_assert(
  exists (
   select 1 from public.organization_memberships m
   join public.roles r on r.organization_id=m.organization_id and r.is_owner
   join public.membership_roles mr on mr.membership_id=m.id and mr.role_id=r.id
   join public.organizations o on o.id=m.organization_id
   where o.slug='combined-company-app-test'
   and m.user_id='00000000-0000-4000-8000-000000000071' and m.status='active'
  ), 'approved verified applicant becomes owner');
select private.company_assert(
  (public.company_applications_mine()->0->>'status')='approved',
  'applicant sees decision outcome');
-- Subscription bundles reuse the existing module registry and preserve current plans.
select private.company_denied(
  'select public.platform_plan_create(''{"key":"forbidden_employee_plan","name":"Forbidden Employee Plan","modules":["crm"]}'')',
  'company owner cannot create platform subscription plans');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000073',true);
select public.platform_plan_create(
 '{"key":"sample_construction_bundle","name":"Sample Construction Bundle","modules":["crm","quotation","projects"]}'
) as new_plan_id \gset
select private.company_assert(
 (select count(*)=3 from public.plan_modules where plan_id=:'new_plan_id'),
 'new plan receives exactly requested shared business modules');
select private.company_assert(
 exists(select 1 from public.plans where id=:'new_plan_id' and status='active'),
 'new subscription plan is available');
select private.company_assert(
 not exists(select 1 from public.organizations where plan_id=:'new_plan_id'),
 'creating a plan does not change existing company subscriptions');


-- Retain the established provisioning workflow until a platform operator
-- explicitly turns on mandatory approval after hosted validation.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000071',true);
select private.company_denied(
  'select public.company_onboarding_policy()',
  'ordinary owner cannot inspect protected platform onboarding policy');
select private.company_denied(
  'select public.company_onboarding_set_policy(true)',
  'ordinary owner cannot change legacy onboarding policy');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000073',true);
select private.company_assert(
  (public.company_onboarding_policy()->>'approvalRequired')::boolean = false,
  'legacy gate defaults off to preserve existing tenants');
select public.company_onboarding_set_policy(true);
select private.company_assert(
  (public.company_onboarding_policy()->>'approvalRequired')::boolean = true,
  'authorized reviewer can enforce reviewed onboarding');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000071',true);
select private.company_denied(
  'select public.create_organization(''{"name":"Unreviewed Business","slug":"unreviewed-bypass-attempt","currency":"INR","country":"IN","timezone":"Asia/Kolkata"}'')',
  'legacy direct organization RPC cannot bypass enforced review');
select private.company_assert(
  not exists(select 1 from public.organizations where slug='unreviewed-bypass-attempt'),
  'blocked legacy RPC cannot create organization or owner');
select private.company_denied(
  'select public.company_onboarding_set_policy(false)',
  'ordinary tenant owner cannot disable enforced review');

-- Approved application workflow continues to work under the enforced gate.
select public.company_application_submit(
 '{"name":"Approved While Enforced","slug":"reviewed-while-enforced","country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["construction"]}'
) as enforced_application_id \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000073',true);
select public.company_application_decide(:'enforced_application_id','approve','Reviewed');
select private.company_assert(
  (select count(*)=1 from public.organizations where slug='reviewed-while-enforced'),
  'platform approval still provisions when legacy creation is denied');
-- Reversible only through the existing platform manage permission.
select public.company_onboarding_set_policy(false);
select private.company_assert(
  (public.company_onboarding_policy()->>'approvalRequired')::boolean = false,
  'platform can roll back gating without touching existing companies');

rollback;
