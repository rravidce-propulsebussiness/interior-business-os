\set ON_ERROR_STOP on
begin;
create function private.code_assert(ok boolean,label text)
returns void language plpgsql as $test$
begin
 if ok is distinct from true then raise exception 'FAILED: %',label; end if;
 raise notice 'PASS: %',label;
end $test$;
create function private.code_denied(command text,label text)
returns void language plpgsql as $test$
begin
 begin execute command; exception when sqlstate '42501' then
  raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $test$;

insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000091','code.owner@example.test',now()),
 ('00000000-0000-4000-8000-000000000092','code.invited@example.test',now()),
 ('00000000-0000-4000-8000-000000000093','code.other@example.test',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select public.create_organization('{"name":"Codes Test","slug":"codes-test-company","country":"IN","currency":"INR","timezone":"Asia/Kolkata"}') as org_id \gset
select id as role_id from public.roles where organization_id=:'org_id' and key='sales' \gset
select public.employee_invitation_code_create(
 :'org_id'::uuid,'code.invited@example.test',array[:'role_id'::uuid]
) as code_payload \gset
select :'code_payload'::jsonb->>'code' as secret_code \gset
select private.code_assert(length(replace(:'secret_code','-',''))=32,
 'generated invite code has 122-bit UUIDv4 entropy');
select private.code_denied(
 'select * from private.employee_invitation_codes',
 'private invite hashes cannot be read by authenticated accounts');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000093',true);
select private.code_denied(
 format('select public.employee_invitation_code_accept(%L)',:'secret_code'),
 'code possession cannot bypass the invited verified email');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000092',true);
select public.employee_invitation_code_accept(:'secret_code') as membership_id \gset
select private.code_assert(private.has_permission(:'org_id'::uuid,'crm.view'),
 'code activation assigns existing approved CRM role');
select private.code_assert(not private.has_permission(:'org_id'::uuid,'billing.manage'),
 'code activation does not grant finance');
select private.code_denied(
 format('select public.employee_invitation_code_accept(%L)',:'secret_code'),
 'one-time code cannot be replayed');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000091',true);
select private.code_denied(
 format('select public.employee_invitation_code_create(%L,%L,array[%L::uuid])',
  :'org_id','code.other@example.test',
  (select id from public.roles where organization_id=:'org_id' and is_owner limit 1)),
 'codes cannot grant owner role');
rollback;
