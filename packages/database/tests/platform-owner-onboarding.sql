\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
begin
 begin
  perform public.platform_owner_directory();
  raise exception 'FAIL: tenant user could list platform owners';
 exception when insufficient_privilege then null;end;
 begin
  perform public.platform_owner_email_status('someone@example.com');
  raise exception 'FAIL: tenant user could lookup owner email';
 exception when insufficient_privilege then null;end;
end $$;

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
do $$
declare result jsonb;row jsonb;actual_email text;status text;
begin
 result=public.platform_owner_directory('','',null,1,'name','all');
 if jsonb_typeof(result->'rows')<>'array'
  or jsonb_typeof(result->'stats')<>'object'
  or (result->>'total')::integer<1
 then raise exception 'FAIL: platform owner directory unavailable';end if;
 for row in select * from jsonb_array_elements(result->'rows') loop
  if not exists (
   select 1 from public.organization_memberships m
   join public.membership_roles mr on mr.membership_id=m.id and mr.organization_id=m.organization_id and mr.branch_id is null
   join public.roles r on r.id=mr.role_id and r.organization_id=mr.organization_id and r.is_owner
   where m.user_id=(row->>'id')::uuid and m.status='active'
  ) then raise exception 'FAIL: nonowner % surfaced in owner-only cards', row->>'id';end if;
 end loop;
 select email into actual_email from auth.users where id='11111111-1111-4111-8111-111111111111';
 status=public.platform_owner_email_status(actual_email);
 if status not in ('verified','unverified','suspended') then
  raise exception 'FAIL: owner lookup did not find existing user: %',status;end if;
 if public.platform_owner_email_status('unique-owner-missing-address-987@example.invalid')<>'missing'
 then raise exception 'FAIL: nonexistent owner did not return missing';end if;
 raise notice 'PASS: owner-only page excludes staff, lookup is permission-checked';
end $$;
rollback;
