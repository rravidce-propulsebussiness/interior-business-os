\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
update public.projects set industry_id=(select id from public.industries where key='construction')
where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and code='demo-3bhk';
-- Disposable fixture, all writes rolled back. One Admin and one ordinary member.
insert into auth.users(id,email) values
 ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','allrounder-admin@example.test'),
 ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','qc-member@example.test')
on conflict(id) do nothing;
insert into public.organization_memberships(organization_id,user_id,status) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','active'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2','active')
on conflict(organization_id,user_id) do nothing;
insert into public.membership_roles(organization_id,membership_id,role_id)
select m.organization_id,m.id,r.id from public.organization_memberships m
join public.roles r on r.organization_id=m.organization_id and r.key='admin'
where m.organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  and m.user_id='a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
on conflict do nothing;
insert into public.membership_roles(organization_id,membership_id,role_id)
select m.organization_id,m.id,r.id from public.organization_memberships m
join public.roles r on r.organization_id=m.organization_id and r.key='project_manager'
where m.organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  and m.user_id='b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'
on conflict do nothing;

-- The owner assigns both people as project QC inspector.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 perform set_config('test.allrounder_project',project::text,true);
 perform public.construction_project_command(org,project,'role_assign',
  '{"user_id":"a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1","role":"quality_inspector"}');
 perform public.construction_project_command(org,project,'role_assign',
  '{"user_id":"b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2","role":"quality_inspector"}');
end$$;

reset role;
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.allrounder_project')::uuid;
begin
 if not private.user_all_rounder(org,'11111111-1111-4111-8111-111111111111')
 then raise exception 'FAIL: company owner is an all-rounder';end if;
 if not private.user_all_rounder(org,'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')
 then raise exception 'FAIL: admin is an all-rounder';end if;
 if private.user_all_rounder(org,'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2')
 then raise exception 'FAIL: ordinary member is not an all-rounder';end if;

 -- An admin keeps project management after taking a project role.
 perform set_config('request.jwt.claim.sub','a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',true);
 if not private.construction_can_manage(org,project)
 then raise exception 'FAIL: admin with a QC role lost project management';end if;
 if not private.site_allowed(org,project,array['site_engineer','watchman'])
 then raise exception 'FAIL: admin cannot act as site engineer or watchman';end if;
 if not private.site_owner(org)
 then raise exception 'FAIL: admin takes the business owner steps';end if;
 if not private.site_is_manager(org,project)
 then raise exception 'FAIL: admin with a QC role is no longer a site manager';end if;

 -- An ordinary member's explicit restricted role still takes precedence.
 perform set_config('request.jwt.claim.sub','b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',true);
 if private.construction_can_manage(org,project)
 then raise exception 'FAIL: restricted QC member gained project management';end if;
 raise notice 'PASS: owner and admin act in every project role; restricted members stay restricted';
end$$;
rollback;
