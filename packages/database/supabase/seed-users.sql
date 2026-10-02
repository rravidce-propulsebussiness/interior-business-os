-- Development only. Create and confirm the five auth accounts first; see docs/SUPABASE.md.
-- Never creates Auth users, passwords, or emails. Stable fixture IDs derive from known development keys.
begin;
do $$
declare demo uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; owner_id uuid; admin_id uuid; user_row record;
begin
 select id into owner_id from auth.users where email='owner@example.test';
 select id into admin_id from auth.users where email='platform.admin@example.test';
 if owner_id is null or admin_id is null or (select count(*) from auth.users where email in ('sales@example.test','designer@example.test','accountant@example.test'))<>3 then
  raise exception 'Create the five confirmed development Auth accounts described in docs/SUPABASE.md first';
 end if;
 if exists(select 1 from public.organizations where slug='demo-interiors' and id<>demo) then raise exception 'Demo slug is already in use'; end if;
 if exists(select 1 from public.organizations where id=demo and created_by<>owner_id) then raise exception 'Demo owner mismatch'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into public.organizations(id,name,slug,status,default_currency,country_code,default_timezone,created_by,plan_id)
 select demo,'Demo Interiors','demo-interiors','trial','INR','IN','Asia/Kolkata',owner_id,id from public.plans where key='professional' on conflict(id) do nothing;
 if not exists(select 1 from public.organizations where id=demo) then raise exception 'Apply development seed.sql first'; end if;
 insert into public.roles(id,organization_id,key,name,is_owner)
 select private.seed_uuid('demo-role:'||key),demo,key,name,is_owner from private.role_templates on conflict(organization_id,key) do nothing;
 insert into public.role_permissions(organization_id,role_id,permission_id)
 select demo,r.id,p.id from public.roles r join private.role_template_permissions t on t.role_key=r.key join public.permissions p on p.key=t.permission_key where r.organization_id=demo on conflict do nothing;
 for user_row in select id,email from auth.users where email in ('owner@example.test','sales@example.test','designer@example.test','accountant@example.test') loop
  insert into public.organization_memberships(id,organization_id,user_id,status) values(private.seed_uuid('demo-member:'||user_row.email),demo,user_row.id,'active') on conflict(organization_id,user_id) do nothing;
  insert into public.membership_roles(id,organization_id,membership_id,role_id)
  select private.seed_uuid('demo-assignment:'||user_row.email),demo,m.id,r.id from public.organization_memberships m join public.roles r on r.organization_id=m.organization_id
  where m.organization_id=demo and m.user_id=user_row.id and r.key=case user_row.email when 'owner@example.test' then 'owner' when 'sales@example.test' then 'sales' when 'designer@example.test' then 'interior_designer' else 'accountant' end on conflict do nothing;
 end loop;
 insert into public.branches(id,organization_id,name,code) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',demo,'Main Branch','main') on conflict(organization_id,code) do nothing;
 insert into public.organization_industries(organization_id,industry_id) select demo,id from public.industries where key='interior' on conflict do nothing;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.platform_user_roles(user_id,role_id) select admin_id,id from public.platform_roles where key='platform_super_admin' on conflict do nothing;
 perform private.assert_owner(demo);
end $$;
commit;
