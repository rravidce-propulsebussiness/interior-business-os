\set ON_ERROR_STOP on
begin;
create function private.emp_assert(ok boolean,label text)
returns void language plpgsql as $test$
begin
 if ok is distinct from true then raise exception 'FAILED: %',label; end if;
 raise notice 'PASS: %',label;
end $test$;
create function private.emp_denied(command text,label text)
returns void language plpgsql as $test$
begin
 begin execute command; exception when sqlstate '42501' then
   raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $test$;

insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000081','invite.owner@example.test',now()),
 ('00000000-0000-4000-8000-000000000082','employee.invited@example.test',now()),
 ('00000000-0000-4000-8000-000000000083','wrong.invited@example.test',now()),
 ('00000000-0000-4000-8000-000000000084','unverified.invited@example.test',null);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000081',true);
select public.create_organization('{"name":"Email Invites Test","slug":"email-invites-test","country":"IN","currency":"INR","timezone":"Asia/Kolkata"}') as org_id \gset
select id as sales_role from public.roles where organization_id=:'org_id' and key='sales' \gset
select id as owner_role from public.roles where organization_id=:'org_id' and is_owner \gset
select private.emp_denied(
 format('select public.employee_invitation_create(%L,%L,array[%L::uuid])',
   :'org_id','bad@public.test',:'owner_role'),
 'owner role cannot be granted by email invitation');

select public.employee_invitation_create(
 :'org_id'::uuid,'Employee.Invited@Example.Test',array[:'sales_role'::uuid]
) as invite_id \gset
select private.emp_assert(
 (public.employee_invitations_list(:'org_id'::uuid)->0->>'email')='employee.invited@example.test',
 'email is canonicalized and only authorized owner may view invite list');
select private.emp_assert(
 jsonb_array_length(public.employee_invitations_list(:'org_id'::uuid))=1,
 'one invitation is queued');
select private.emp_denied('select * from private.employee_invitations',
 'authenticated callers cannot read invitation private table');
select private.emp_denied('select private.employee_invitation_email_claim()',
 'only worker can claim invitation emails');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000083',true);
select private.emp_assert(jsonb_array_length(public.employee_invitations_mine())=0,
 'wrong email cannot discover invitation');
select private.emp_denied(
 format('select public.employee_invitation_accept(%L::uuid)',:'invite_id'),
 'different verified user cannot accept invitation');
select private.emp_denied(
 format('select public.employee_invitations_list(%L::uuid)',:'org_id'),
 'nonmember cannot list company invites');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000084',true);
select private.emp_denied('select public.employee_invitations_mine()',
 'unverified email cannot list eligible invitations');

reset role;
update private.employee_invitations set expires_at=now()-interval '1 minute',
 created_at=now()-interval '15 minutes' where id=:'invite_id'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000082',true);
select private.emp_assert(
 (public.employee_invitations_mine()->0->>'status')='expired',
 'recipient sees expired invitation without credentials');
select private.emp_denied(
 format('select public.employee_invitation_accept(%L::uuid)',:'invite_id'),
 'expired invitation cannot be accepted');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000081',true);
select public.employee_invitation_resend(:'org_id'::uuid,:'invite_id'::uuid);
select private.emp_assert(
 (public.employee_invitations_list(:'org_id'::uuid)->0->>'status')='pending',
 'resend renews the exact invitation for seven days');

reset role;
set local role business_os_worker;
select private.employee_invitation_email_claim() as claimed \gset
select private.emp_assert(
 (:'claimed'::jsonb->>'recipient')='employee.invited@example.test',
 'restricted worker claims the email without a service role');
select private.employee_invitation_email_ack(
 (:'claimed'::jsonb->>'id')::uuid,
 (:'claimed'::jsonb->>'lease')::uuid,'sent',null);
select private.emp_assert(private.employee_invitation_email_claim()='null'::jsonb,
 'idle worker receives JSON null, never a parser-breaking empty SQL value');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000082',true);
select public.employee_invitation_accept(:'invite_id'::uuid) as membership_id \gset
select private.emp_assert(private.has_permission(:'org_id'::uuid,'crm.view'),
 'accepted employee has sales CRM access through canonical role');
select private.emp_assert(not private.has_permission(:'org_id'::uuid,'billing.manage'),
 'sales role cannot access company finances');
select private.emp_denied(
 format('select public.employee_invitation_accept(%L::uuid)',:'invite_id'),
 'acceptance cannot be replayed');
select private.emp_assert(jsonb_array_length(public.employee_invitations_mine())=0,
 'accepted invitation leaves pending inbox');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000081',true);
select private.emp_assert(
 (public.employee_invitations_list(:'org_id'::uuid)->0->>'status')='accepted',
 'issuer sees accepted status');
select public.employee_invitation_create(
 :'org_id'::uuid,'wrong.invited@example.test',array[:'sales_role'::uuid]
) as revoked_invite_id \gset
select public.employee_invitation_revoke(:'org_id'::uuid,:'revoked_invite_id'::uuid);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000083',true);
select private.emp_denied(
 format('select public.employee_invitation_accept(%L::uuid)',:'revoked_invite_id'),
 'revoked invitation cannot activate a membership');
rollback;
