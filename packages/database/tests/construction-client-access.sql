-- Phase 12: isolated, disposable signed-in-client authorization regression.
\set ON_ERROR_STOP on
begin;
reset role;
insert into auth.users(id,email,email_confirmed_at)
values
 ('66666666-6666-4666-8666-666666666666','client-one@example.test',now()),
 ('77777777-7777-4777-8777-777777777777','client-two@example.test',now());
-- The canonical Auth trigger creates the profiles; update names without
-- manufacturing a second user record.
update public.profiles set full_name='Verified Homeowner One'
 where id='66666666-6666-4666-8666-666666666666';
update public.profiles set full_name='Verified Homeowner Two'
 where id='77777777-7777-4777-8777-777777777777';

-- Create disposable customer/project fixtures with database-owner setup,
-- then switch to the real authenticated RPC roles. App callers NEVER update
-- these tables directly.
update public.customers set email='client-one@example.test'
where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  and id=(select customer_id from public.projects
          where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
            and code='demo-3bhk');
insert into public.customers(id,organization_id,display_name,email,created_by)
values('99999999-9999-4999-8999-999999999999',
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
       'Second Client','client-two@example.test',
       '11111111-1111-4111-8111-111111111111');
insert into public.projects(id,organization_id,customer_id,name,code,created_by)
values('88888888-8888-4888-8888-888888888888',
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
       '99999999-9999-4999-8999-999999999999',
       'Client Two House','client-two-house',
       '11111111-1111-4111-8111-111111111111');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project1 uuid;customer1 uuid;project2 uuid='88888888-8888-4888-8888-888888888888';
 access1 uuid;access2 uuid;grant_result jsonb;member_version integer;
begin
 select id,customer_id into project1,customer1 from public.projects
 where organization_id=org and code='demo-3bhk';
 if project1 is null then raise exception 'Missing demo project for client regression';end if;
 perform public.project_site_command(org,project1,'initialize','{}'::jsonb);
 perform public.project_site_command(org,project2,'initialize','{}'::jsonb);
 grant_result=public.construction_client_access_manage(org,project1,'grant',
   '{"email":"client-one@example.test"}'::jsonb);
 access1=(grant_result->>'access_id')::uuid;
 grant_result=public.construction_client_access_manage(org,project2,'grant',
   '{"email":"client-two@example.test"}'::jsonb);
 access2=(grant_result->>'access_id')::uuid;
 perform set_config('test.client_one_project',project1::text,true);
 perform set_config('test.client_two_project',project2::text,true);
 perform set_config('test.client_one_access',access1::text,true);
 perform set_config('test.client_two_access',access2::text,true);

 -- A repeat assignment is idempotent, not duplicate membership or history.
 perform public.construction_client_access_manage(org,project1,'grant',
   '{"email":"client-one@example.test"}'::jsonb);
 if jsonb_array_length(
   public.construction_client_access_manage_read(org,project1)->'members')<>1 then
   raise exception 'FAIL: duplicate client access on retry';end if;
 begin
  perform public.construction_client_access_manage(org,project1,'grant',
    '{"email":"attacker@example.test"}'::jsonb);
  raise exception 'FAIL: manager granted non-customer email';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: verified CRM-matched client grants are scoped and idempotent';
end$$;

select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 p1 uuid=current_setting('test.client_one_project')::uuid;
 p2 uuid=current_setting('test.client_two_project')::uuid;
 view_data jsonb;
begin
 if (select count(*) from jsonb_array_elements(public.construction_client_projects()->'projects'))<>1
 then raise exception 'FAIL: client one sees wrong number of projects';end if;
 view_data=public.construction_client_project_view(org,p1);
 if view_data->'project'->>'code'<>'demo-3bhk'
  or view_data ? 'payments' or view_data ? 'contracts'
  or view_data ? 'material_needs' or view_data ? 'gate'
 then raise exception 'FAIL: authenticated client projection leaked financial or private data';end if;
 begin
   perform public.construction_client_project_view(org,p2);
   raise exception 'FAIL: client one accessed client two project';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_client_project_view('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',p1);
   raise exception 'FAIL: client one substituted a tenant ID';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_client_access_manage(org,p1,'grant',
     '{"email":"client-two@example.test"}'::jsonb);
   raise exception 'FAIL: client granted own manager permission';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_client_manage(org,p1,'share_create','{}'::jsonb);
   raise exception 'FAIL: client gained staff report publication rights';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: client one has only own client-safe progress with no staff grants';
end$$;

select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 p1 uuid=current_setting('test.client_one_project')::uuid;
 p2 uuid=current_setting('test.client_two_project')::uuid;
begin
 if (public.construction_client_project_view(org,p2)->'project'->>'code')<>'client-two-house'
 then raise exception 'FAIL: client two lost own project';end if;
 begin
  perform public.construction_client_project_view(org,p1);
  raise exception 'FAIL: client two accessed client one project';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: second verified client is isolated from first';
end$$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 p1 uuid=current_setting('test.client_one_project')::uuid;
 access1 uuid=current_setting('test.client_one_access')::uuid;
 result jsonb;
begin
 result=public.construction_client_access_manage(org,p1,'revoke',
   jsonb_build_object('access_id',access1,'version',1));
 if result->>'active'<>'false' or (result->>'version')::integer<>2
 then raise exception 'FAIL: revoke did not version access';end if;
 begin
   perform public.construction_client_access_manage(org,p1,'revoke',
     jsonb_build_object('access_id',access1,'version',1));
   raise exception 'FAIL: stale revocation accepted';
 exception when serialization_failure then null;end;
 raise notice 'PASS: revocation versioned, stale replay denied';
end$$;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 p1 uuid=current_setting('test.client_one_project')::uuid;
begin
 if jsonb_array_length(public.construction_client_projects()->'projects')<>0
 then raise exception 'FAIL: revoked client still sees project';end if;
 begin
   perform public.construction_client_project_view(org,p1);
   raise exception 'FAIL: revoked client directly read project';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: client revocation takes effect at database read boundary';
end$$;
rollback;
