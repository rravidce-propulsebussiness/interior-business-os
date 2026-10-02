\set ON_ERROR_STOP on
begin;
-- Isolate the last-platform-admin invariant from optional demo assignments.
-- This fixture change is rolled back with the entire test transaction.
delete from public.platform_user_roles;
create function private.test_assert(condition boolean, label text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end $$;
create function private.test_denied(command text, states text[], label text) returns void language plpgsql as $$
begin
 begin execute command; exception when others then
  if sqlstate=any(states) then raise notice 'PASS: %',label; return; end if;
  raise exception 'FAILED: % (unexpected %: %)',label,sqlstate,sqlerrm;
 end;
 raise exception 'FAILED: % (operation was allowed)',label;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001','owner.a@example.test','{"is_admin":true}'),
 ('00000000-0000-4000-8000-000000000002','owner.b@example.test','{}'),
 ('00000000-0000-4000-8000-000000000003','sales.isolation@example.test','{}'),
 ('00000000-0000-4000-8000-000000000004','suspended@example.test','{}'),
 ('00000000-0000-4000-8000-000000000005','platform.test@example.test','{}'),
 ('00000000-0000-4000-8000-000000000006','branch@example.test','{}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.create_organization('{"name":"Tenant A","slug":"tenant-a","currency":"USD","country":"US","timezone":"UTC"}') as org_a \gset
select set_config('test.org_a',:'org_a',true);
select public.save_branch(:'org_a','{"name":"Main","code":"main"}') as branch_a \gset
select set_config('test.branch_a',:'branch_a',true);
select public.save_branch(:'org_a','{"name":"Other","code":"other"}') as branch_other \gset
select set_config('test.branch_other',:'branch_other',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.create_organization('{"name":"Tenant B","slug":"tenant-b","currency":"INR","country":"IN","timezone":"Asia/Kolkata"}') as org_b \gset
select set_config('test.org_b',:'org_b',true);
select public.save_branch(:'org_b','{"name":"Main B","code":"main"}') as branch_b \gset
select set_config('test.branch_b',:'branch_b',true);
insert into public.organization_industries(organization_id,industry_id) select :'org_b',id from public.industries where key='interior';
insert into public.organization_entitlements(organization_id,module_id,enabled,source) select :'org_b',id,true,'manual' from public.modules where key='website';
insert into public.organization_memberships(organization_id,user_id,status,branch_id) values
 (:'org_a','00000000-0000-4000-8000-000000000003','active',null),
 (:'org_a','00000000-0000-4000-8000-000000000004','suspended',null),
 (:'org_a','00000000-0000-4000-8000-000000000006','active',:'branch_a');
insert into public.membership_roles(organization_id,membership_id,role_id)
 select m.organization_id,m.id,r.id from public.organization_memberships m join public.roles r on r.organization_id=m.organization_id
 where m.organization_id=:'org_a' and m.user_id in ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000006') and r.key='sales';
insert into public.platform_user_roles(user_id,role_id) select '00000000-0000-4000-8000-000000000005',id from public.platform_roles where key='platform_super_admin';
set constraints all immediate;
set constraints all deferred;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select private.test_assert((select count(*)=1 from public.profiles),'profile self-only access');
select private.test_assert((select count(*)=1 from public.organizations),'only own organization is visible');
select private.test_assert(not private.has_platform_permission('platform.access'),'Owner and user metadata do not grant platform access');
select private.test_assert((select count(*)=0 from public.platform_roles),'Owner cannot read platform role catalog');
select private.test_assert(private.has_permission(:'org_a','team.manage'),'owner permission graph resolves');
select private.test_assert(public.has_entitlement(:'org_a','crm'),'plan grants CRM');
select private.test_assert(not public.has_entitlement(:'org_a','website'),'website is optional');
select private.test_assert((public.organization_context(:'org_a')->>'organizationId')=:'org_a','organization context resolves membership');
do $$ declare t text; count_rows integer; begin
 foreach t in array array['branches','organization_memberships','roles','role_permissions','membership_roles','organization_industries','organization_entitlements','audit_logs'] loop
  execute format('select count(*) from public.%I where organization_id=$1',t) into count_rows using current_setting('test.org_b')::uuid;
  perform private.test_assert(count_rows=0,'cross-tenant RLS: '||t);
 end loop;
end $$;
select private.test_denied(format('select public.organization_context(%L)',:'org_b'),array['42501'],'spoofed active organization rejected');
select private.test_denied(format('select public.save_branch(%L,%L::jsonb)',:'org_b','{"name":"Hack","code":"hack"}'),array['42501'],'cross-tenant RPC write denied');
select private.test_denied(format('insert into public.branches(organization_id,name,code) values(%L,''Hack'',''hack'')',:'org_a'),array['42501'],'direct insert denied');
select private.test_denied(format('update public.branches set organization_id=%L where organization_id=%L',:'org_b',:'org_a'),array['42501'],'tenant ID reassignment denied');
select private.test_denied(format('delete from public.organization_memberships where organization_id=%L',:'org_a'),array['42501'],'direct delete denied');
select private.test_denied('update public.profiles set status=''suspended''',array['42501'],'profile status cannot be self-edited');
select private.test_denied('delete from public.audit_logs',array['42501'],'audit log is append-only to application roles');
select private.test_denied(format('select public.platform_set_organization(%L,''suspended'',null)',:'org_a'),array['42501'],'business Owner cannot call platform mutation');
select private.test_denied(format('select public.set_membership_status(%L,%L,''suspended'')',:'org_a',(select id from public.organization_memberships where organization_id=:'org_a' and user_id=auth.uid())),array['23514'],'last owner cannot be suspended');
select private.test_denied(format('select public.set_member_role(%L,%L,%L,null,true)',:'org_a',(select id from public.organization_memberships where organization_id=:'org_a' and user_id=auth.uid()),(select id from public.roles where organization_id=:'org_a' and is_owner)),array['23514'],'last owner assignment cannot be removed');
select private.test_denied(format('select public.save_role(%L,%L::jsonb)',:'org_a','{"key":"escalate","name":"Escalate","permissions":["platform.access"]}'),array['42501'],'tenant role cannot acquire platform permissions');
select private.test_denied(format('select public.create_organization(%L::jsonb)','{"name":"Bad","slug":"invalid-rollback","currency":"USD","country":"US","timezone":"Invalid/Zone"}'),array['22023'],'invalid provisioning fails atomically');
select private.test_assert((select count(*)=0 from public.organizations where slug='invalid-rollback'),'failed provisioning leaves no organization');
select private.test_denied(format('select public.invite_member(%L,%L,%L)',:'org_a','00000000-0000-4000-8000-000000000002',:'branch_b'),array['23503'],'cross-tenant branch foreign key denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select private.test_assert(private.has_permission(:'org_a','quotation.create'),'Sales permissions resolve');
select private.test_assert(not private.has_permission(:'org_a','team.manage'),'Sales has no team management');
select private.test_denied(format('select public.set_member_role(%L,%L,%L)',:'org_a',(select id from public.organization_memberships where user_id=auth.uid()),(select id from public.roles where organization_id=:'org_a' and is_owner)),array['42501'],'employee cannot promote themselves');
select private.test_denied(format('select public.save_role(%L,%L::jsonb)',:'org_a','{"key":"custom","name":"Custom","permissions":["team.manage"]}'),array['42501'],'employee cannot create elevated role');
select private.test_denied(format('select public.platform_set_entitlement(%L,%L::jsonb)',:'org_a','{"moduleKey":"website","enabled":true,"source":"manual"}'),array['42501'],'employee cannot enable modules');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
select private.test_assert(private.has_permission(:'org_a','branch.view',:'branch_a'),'branch member can access assigned branch');
select private.test_assert(not private.has_permission(:'org_a','branch.view',:'branch_other'),'branch member denied other branch');
select private.test_assert(not private.has_permission(:'org_a','quotation.create'),'branch grant cannot authorize organization-wide actions');
select private.test_assert((select count(*)=1 from public.branches),'branch RLS filters other branches');
select private.test_assert((public.organization_context(:'org_a')->'grants'->0->'scope'->>'kind')='branch','context preserves branch restriction');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select private.test_assert((select count(*)=0 from public.organizations),'suspended membership denied organization read');
select private.test_assert(not public.has_entitlement(:'org_a','crm'),'suspended membership denied entitlement access');
select private.test_denied(format('select public.organization_context(%L)',:'org_a'),array['42501'],'suspended context denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select private.test_assert(private.has_platform_permission('platform.access'),'separate platform permissions resolve');
select private.test_assert((select count(*)=2 from public.organizations where id in (:'org_a',:'org_b')),'platform can inspect organization control-plane records');
select private.test_assert((select count(*)=0 from public.organization_memberships),'platform access does not imply tenant team access');
select private.test_assert(not private.is_member(:'org_a'),'platform user is not tenant member');
select private.test_denied(format('select public.organization_context(%L)',:'org_a'),array['42501'],'platform user cannot assume tenant context');
select public.platform_set_entitlement(:'org_a','{"moduleKey":"brochure","enabled":true,"source":"manual"}');
select public.platform_set_entitlement(:'org_a','{"moduleKey":"client_portal","enabled":true,"source":"promotion"}');
select public.platform_set_entitlement(:'org_a','{"moduleKey":"crm","enabled":false,"source":"manual"}');
select public.platform_set_entitlement(:'org_a','{"moduleKey":"crm","enabled":true,"source":"addon"}');
select public.platform_set_entitlement(:'org_a','{"moduleKey":"website","enabled":true,"source":"promotion","validFrom":"2000-01-01T00:00:00Z","validUntil":"2001-01-01T00:00:00Z"}');
select private.test_denied(format('select public.platform_set_entitlement(%L,%L::jsonb)',:'org_a','{"moduleKey":"website","enabled":true,"source":"manual","validFrom":"2030-01-01T00:00:00Z","validUntil":"2029-01-01T00:00:00Z"}'),array['22023'],'invalid entitlement interval rejected');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select private.test_assert(public.has_entitlement(:'org_a','brochure'),'explicit grant supplements plan');
select private.test_assert(public.has_entitlement(:'org_a','client_portal'),'client portal entitlement independent');
select private.test_assert(not public.has_entitlement(:'org_a','website'),'expired website grant is ignored');
select private.test_assert(not public.has_entitlement(:'org_a','crm'),'explicit denial wins over plan and addon grant');
select private.test_assert((select count(*)>0 from public.audit_logs where entity_type='organization_entitlements'),'entitlement audit records exist');
select private.test_assert((select count(*)>0 from public.audit_logs where entity_type='organizations' and actor_user_id=auth.uid()),'organization provisioning audit attributed');
select private.test_assert(not exists(select 1 from public.audit_logs where metadata::text ~ 'password|token|secret'),'audit metadata excludes secret fields');

-- Exercise successful multi-step role and membership transitions as real caller roles.
select public.save_role(:'org_a','{"key":"custom_reporter","name":"Custom Reporter","permissions":["report.view"]}') as custom_role \gset
select public.set_member_role(:'org_a',(select id from public.organization_memberships where user_id='00000000-0000-4000-8000-000000000003'),:'custom_role');
select public.invite_member(:'org_a','00000000-0000-4000-8000-000000000002') as invited_member \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select private.test_assert(not private.is_member(:'org_a'),'invited membership is not active access');
select public.accept_membership(:'invited_member');
select private.test_assert(private.is_member(:'org_a'),'invitation acceptance activates only caller membership');
select private.test_assert(private.is_member(:'org_b'),'user retains original membership after joining another organization');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select private.test_assert(private.has_permission(:'org_a','report.view') and private.has_permission(:'org_a','quotation.create'),'multiple role permissions are a union');
select private.test_denied(format('select public.accept_membership(%L)',:'invited_member'),array['42501'],'cannot accept someone else membership');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.set_member_role(:'org_a',(select id from public.organization_memberships where user_id='00000000-0000-4000-8000-000000000003'),:'custom_role',null,true);
select public.set_membership_status(:'org_a',(select id from public.organization_memberships where user_id='00000000-0000-4000-8000-000000000003'),'suspended');
select private.test_assert((select count(*)>0 from public.audit_logs where entity_type='membership_roles' and action='membership_roles.delete'),'role removal audited');
select private.test_assert(exists(select 1 from public.audit_logs where entity_type='membership_roles' and action='membership_roles.delete' and metadata->>'membership_id'=(select id::text from public.organization_memberships where organization_id=:'org_a' and user_id='00000000-0000-4000-8000-000000000003')),'deleted role assignment retains its target membership in audit');
select private.test_assert(exists(select 1 from public.audit_logs where entity_type='organization_entitlements' and metadata->>'source'='promotion' and metadata ? 'valid_from'),'entitlement audit preserves source and window');
select private.test_assert((select count(*)>0 from public.audit_logs where entity_type='organization_memberships' and metadata->>'status'='suspended'),'membership suspension audited');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select private.test_denied(format('select public.organization_context(%L)',:'org_a'),array['42501'],'live membership revocation takes immediate effect');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select public.platform_set_entitlement(:'org_a','{"moduleKey":"website","enabled":true,"source":"manual","validFrom":"2200-01-01T00:00:00Z"}');
select public.platform_set_organization(:'org_a','suspended',(select id from public.plans where key='starter'));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select private.test_assert(not private.is_member(:'org_a'),'suspended organization disables even Owner access');
select private.test_assert(not public.has_entitlement(:'org_a','brochure'),'suspended organization disables entitlement access');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select public.platform_set_organization(:'org_a','active',(select id from public.plans where key='starter'));
select private.test_denied(format('select public.platform_set_role(%L,%L,true)','00000000-0000-4000-8000-000000000005',(select id from public.platform_roles where key='platform_super_admin')),array['23514'],'last platform role administrator cannot be removed');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select private.test_assert(not public.has_entitlement(:'org_a','website'),'future entitlement window has not started');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select private.test_assert((select count(*)=10 from public.roles where organization_id=:'org_b'),'provisioning installs ten default roles');
select private.test_assert((select count(*)=1 from public.organization_memberships where organization_id=:'org_b' and status='active'),'provisioning creates active Owner membership');

reset role;
-- Force a failure after provisioning has inserted organization/membership/roles.
-- The checked RPC must roll back its entire subtransaction, including audit rows.
select set_config('test.audit_count',(select count(*)::text from public.audit_logs),true);
update private.role_templates set is_owner=false where key='owner';
set local role authenticated;
select private.test_denied('select public.create_organization(''{"name":"Rollback","slug":"rollback-mid-provisioning","currency":"USD","country":"US","timezone":"UTC"}''::jsonb)',array['23514'],'mid-provisioning failure is atomic');
reset role;
update private.role_templates set is_owner=true where key='owner';
select private.test_assert(not exists(select 1 from public.organizations where slug='rollback-mid-provisioning'),'mid-provisioning failure leaves no organization');
select private.test_assert((select count(*) from public.audit_logs)=current_setting('test.audit_count')::bigint,'failed provisioning leaves no audit fragments');
select private.test_assert(not has_table_privilege('anon','public.organizations','SELECT'),'anonymous table reads denied');
select private.test_assert((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'all public tables enable and force RLS');
select private.test_assert(not has_function_privilege('anon','public.create_organization(jsonb)','EXECUTE'),'anonymous provisioning execute revoked');
select private.test_assert(not has_function_privilege('authenticated','private.entitled(uuid,text)','EXECUTE'),'private unscoped entitlement helper inaccessible');
select private.test_assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and not ('search_path=""'=any(p.proconfig))),'all definer functions use empty search_path');
rollback;
\echo Phase 1 database isolation assertions passed; fixtures rolled back.
