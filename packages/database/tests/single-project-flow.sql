Warning: truncated output (original token count: 15086)
Total output lines: 764

\set ON_ERROR_STOP on
-- Single project flow acceptance scenario.
-- Disposable database only: every write below is ROLLED BACK.
--
-- One construction project travels from signed agreement to concurrent
-- multi-floor execution using only canonical records:
--   agreement → advance request (once) → verified receipt → floor plan
--   (revision + homeowner decision) → structural + 3D → execution release →
--   measured site work → PCC → reinforcement + independent pre-pour QC →
--   curing by watchman and engineer → BOQ and manual material requests →
--   concurrent third-floor slab and first-floor brickwork → stage payment
--   requests without duplicates → owner skip controls → permissions,
--   audit and homeowner visibility.
begin;

------------------------------------------------------------------------------
-- Privileged fixture: people, accepted quotation with a stage payment plan.
------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into private.quotation_signing_keys(singleton,secret_hex)
values(true,repeat('a',64)) on conflict(singleton) do nothing;
delete from public.organization_entitlements
 where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and not enabled
   and module_id in (select id from public.modules where key='billing');
insert into public.payment_methods(organization_id,name,kind,created_by)
select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd','Flow test bank transfer','bank_transfer',
       '11111111-1111-4111-8111-111111111111'
where not exists(select 1 from public.payment_methods
  where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and kind='bank_transfer');
-- Project staff (company members) and one homeowner (portal only).
insert into auth.users(id,email) values
 ('66666666-6666-4666-8666-666666666666','structure@example.test'),
 ('77777777-7777-4777-8777-777777777777','watchman@example.test'),
 ('88888888-8888-4888-8888-888888888888','qc@example.test'),
 ('99999999-9999-4999-8999-999999999999','homeowner@example.test')
on conflict(id) do nothing;
insert into public.organization_memberships(organization_id,user_id,status)
select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',u,'active' from unnest(array[
 '66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777',
 '88888888-8888-4888-8888-888888888888']::uuid[]) u
on conflict(organization_id,user_id) do nothing;
update public.projects set industry_id=(select id from public.industries where key='construction')
 where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and code='demo-3bhk';
do $fixture$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;customer uuid;root uuid=gen_random_uuid();revision uuid=gen_random_uuid();share jsonb;
 line record;
begin
 select id,customer_id into project,customer from public.projects where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Missing demo project';end if;
 insert into public.customer_contacts(organization_id,customer_id,name,email,is_primary,created_by)
 select org,customer,'Flow Homeowner','homeowner@example.test',false,'11111111-1111-4111-8111-111111111111'
 where not exists(select 1 from public.customer_contacts where customer_id=customer and email='homeowner@example.test');
 insert into public.quotations(id,organization_id,customer_id,project_id,quotation_number)
 values(root,org,customer,project,'SINGLE-FLOW-TEST');
 insert into public.quotation_revisions(id,organization_id,quotation_id,project_id,revision_number,currency,
   valid_until,document_snapshot,terms)
 select revision,org,root,project,1,'INR',current_date+30,
  jsonb_build_object('branding',branding,
   'customer',jsonb_build_object('name','Flow Homeowner','billing_address','{}'::jsonb),
   'project',jsonb_build_object('name','Three-storey residence','site_address','{}'::jsonb),
   'display',jsonb_build_object('quantity',true,'unit_rate',true,'specifications',true)),
  E'Agreed construction terms.\n[STAGE_PAYMENT_PLAN]\nBooking advance|10\nFoundation certified|30\nThird floor slab certified|20\nMasonry and handover|40\n[/STAGE_PAYMENT_PLAN]\n[STAGE_PAYMENT_LINKS]\n[[],["FOUNDATION"],["F3_SLAB"],["F1_MASONRY","F3_MASONRY","HANDOVER"]]\n[/STAGE_PAYMENT_LINKS]'
 from public.organization_quotation_settings where organization_id=org;
 for line in select * from (values
   ('RCC structural concrete M25','120','cum','Cum','5000','600000'),
   ('Reinforcement steel Fe500D','8','tonnes','Tonnes','37500','300000'),
   ('Brick masonry 230 mm','500','sqm','Sqm','200','100000')) v(name,qty,ukey,ulabel,rate,amount)
 loop
  insert into public.quotation_items(organization_id,revision_id,project_id,snapshot)
  values(org,revision,project,jsonb_build_object('snapshot_version',1,'name',line.name,
   'line_type','manual','quantity',line.qty,'unit',jsonb_build_object('key',line.ukey,'label',line.ulabel),
   'display_rate',line.rate,'effective_amount',line.amount,'final_amount',line.amount,
   'discount_amount','0','minimum_amount',null,'customer_specifications','[]'::jsonb));
 end loop;
 update public.quotation_revisions set status='issued',issued_at=now(),
   totals=private.quotation_totals(id,discount) where id=revision;
 update public.quotations set status='issued',current_revision_id=revision where id=root;
 share=public.quotation_share_manage(org,'create',jsonb_build_object('revision_id',revision));
 perform public.public_quotation(share->>'token','respond',
   '{"action":"approved","name":"Flow Homeowner","acknowledged":true}');
 perform set_config('test.flow_project',project::text,true);
 perform set_config('test.flow_customer',customer::text,true);
 perform set_config('test.flow_revision',revision::text,true);
end$fixture$;

set local role authenticated;

------------------------------------------------------------------------------
-- Test helpers (session-temporary).
------------------------------------------------------------------------------
create function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub',u::text,true) $$;
create function pg_temp.org() returns uuid language sql as $$ select 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid $$;
create function pg_temp.project() returns uuid language sql as $$ select current_setting('test.flow_project')::uuid $$;
create function pg_temp.expect_fail(statement text,expected text,label text) returns void language plpgsql as $$
declare ok boolean=false;got text;msg text;
begin
 begin execute statement; ok=true;
 exception when others then got=sqlstate; msg=sqlerrm; end;
 if ok then raise exception 'FAIL: % (statement succeeded)',label; end if;
 if expected is not null and got<>expected then
   raise exception 'FAIL: % (expected %, got % %)',label,expected,got,msg; end if;
end$$;
create function pg_temp.stage(code text) returns uuid language sql as $$
 select (s->>'id')::uuid from jsonb_array_elements(
   public.construction_project_read(pg_temp.org(),pg_temp.project())->'stages') s
 where s->>'instance_code'=code $$;
create function pg_temp.photo(category text,caption text) returns uuid language sql as $$
 select public.project_site_media_put(pg_temp.org(),pg_temp.project(),category,'evidence.png','image/png',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',caption) $$;
create function pg_temp.work(stage text,idx integer,action text,input jsonb default '{}') returns jsonb language sql as $$
 select public.project_work_item_command(pg_temp.org(),pg_temp.project(),pg_temp.stage(stage),idx,action,input) $$;
create function pg_temp.exec_status(code text) returns text language sql as $$
 select e->>'status' from jsonb_array_elements(public.construction_stage_execution_read(pg_temp.org(),pg_temp.project())) e
 where (e->>'stage_id')::uuid=pg_temp.stage(code) $$;
create function pg_temp.blockers(code text) returns text language sql as $$
 select (e->'blockers')::text from jsonb_array_elements(public.construction_stage_execution_read(pg_temp.org(),pg_temp.project())) e
 where (e->>'stage_id')::uuid=pg_temp.stage(code) $$;
-- Engineer performs every work item of a stage with real photo evidence and
-- passes the site checks; then submits the stage for independent QC.
create function pg_temp.execute_stage(code text) returns void language plpgsql as $$
declare n integer;i integer;photo uuid;topic text;state text;
begin
 perform pg_temp.as_user('22222222-2222-4222-8222-222222222222');
 if pg_temp.exec_status(code)='not_started' then
   perform public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage(code),'start','');
 end if;
 photo=pg_temp.photo('site','Work evidence for '||code);
 select jsonb_array_length(activities) into n from jsonb_array_elements(
   public.construction_project_read(pg_temp.org(),pg_temp.project())->'stages') s,
   lateral (select s->'activities' as activities) a where s->>'instance_code'=code;
 for i in 0..n-1 loop
   state=coalesce((select w->>'status' from jsonb_array_elements(public.project_stage_checklist_read(pg_temp.org(),pg_temp.project())->'work') w
       where (w->>'stage_id')::uuid=pg_temp.stage(code) and (w->>'index')::int=i),'pending');
   if state='pending' then perform pg_temp.work(code,i,'start'); state='in_progress'; end if;
   if state='in_progress' then perform pg_temp.work(code,i,'complete',jsonb_build_object('photo_id',photo)); end if;
 end loop;
 for topic in select jsonb_array_elements_text(s->'inspection_topics') from jsonb_array_elements(
   public.construction_project_read(pg_temp.org(),pg_temp.project())->'stages') s where s->>'instance_code'=code loop
   perform public.project_stage_checklist_command(pg_temp.org(),pg_temp.project(),pg_temp.stage(code),'check',0,topic,'done','Checked on site',photo);
 end loop;
 perform public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage(code),'submit_for_qc','Field work complete');
end$$;
-- Formal certification through the existing canonical chain: Operations task
-- done, passed mandatory inspection, independent quality review, independent
-- structural review for structural hold points, manager clearance.
create function pg_temp.certify(code text,structural boolean) returns void language plpgsql as $$
declare task uuid;inspection uuid;template uuid;version integer;
begin
 perform pg_temp.as_user('11111111-1111-4111-8111-111111111111');
 select id into task from public.project_tasks where organization_id=pg_temp.org() and project_id=pg_temp.project()
  and title='Certify '||code;
 select project_tasks.version into version from public.project_tasks where id=task;
 perform public.operations_task(pg_temp.org(),'task',jsonb_build_object('id',task,'version',version,'status','done'));
 perform public.construction_project_command(pg_temp.org(),pg_temp.project(),'task_link',
   jsonb_build_object('stage_id',pg_temp.stage(code),'task_id',task));
 template=current_setting('test.flow_template')::uuid;
 inspection=public.operations_inspection(pg_temp.org(),'create',jsonb_build_object(
   'project_id',pg_temp.project(),'template_id',template,'inspector_id','11111111-1111-4111-8111-111111111111'));
 perform public.construction_quality_command(pg_temp.org(),pg_temp.project(),'inspection_link',
   jsonb_build_object('stage_id',pg_temp.stage(code),'inspection_id',inspection));
 perform public.operations_inspection(pg_temp.org(),'approve',jsonb_build_object('id',inspection,'version',1,
   'status','passed','results','[{"key":"conformance","result":"pass","note":"Checked on site"}]'::jsonb));
 perform public.construction_quality_command(pg_temp.org(),pg_temp.project(),'review',jsonb_build_object(
   'stage_id',pg_temp.stage(code),'inspection_id',inspection,'review_kind','quality','decision','approved',
   'notes','Quality verified against the approved drawings for '||code));
 if structural th…9086 tokens truncated…emp.project(),binding),'23505','different duplicate direct payment rejected');
 material_read=public.project_material_access_read(pg_temp.org(),pg_temp.project());
 if not exists(select 1 from jsonb_array_elements(material_read->'delivery') x
   where x->>'id'=binding::text and x->>'homeowner_paid_method'='cash'
    and x->>'homeowner_paid_to'='TEST ONLY local supplier'
    and (x->>'homeowner_paid_amount')::numeric=2500) then
   raise exception 'FAIL: direct cash payment missing from persisted material read model: %',material_read;end if;
 if (select count(*) from public.payments where organization_id=pg_temp.org()
      and project_id=pg_temp.project())<>payments_before then
   raise exception 'FAIL: direct supplier payment created a company Finance receipt';end if;
 perform pg_temp.as_user('22222222-2222-4222-8222-222222222222');
 perform pg_temp.expect_fail(format('select public.project_work_item_material_request(%L,%L,%L,0,%L)',pg_temp.org(),pg_temp.project(),
   pg_temp.stage('FOUNDATION'),jsonb_build_array(jsonb_build_object('boq_item_id',gen_random_uuid(),'quantity','1','unit','nos','required_date',tomorrow))),
   '22023','foreign BOQ line rejected');
 perform pg_temp.expect_fail(format('select public.project_work_item_material_request(%L,%L,%L,0,%L)',pg_temp.org(),pg_temp.project(),
   pg_temp.stage('FOUNDATION'),'[{"item":"Sand","quantity":"2","unit":"cum"}]'),'22023','required date is mandatory');
end$materials$;
reset role;
do $material_check$
declare project uuid=current_setting('test.flow_project')::uuid;
begin
 if (select count(*) from private.site_material_needs where project_id=project and required_date is not null
      and requested_by='22222222-2222-4222-8222-222222222222' and activity_index=3)<>3
  or (select count(*) from private.site_material_needs where project_id=project and required_date is not null
      and status='requested' and requested_by='22222222-2222-4222-8222-222222222222' and activity_index=3)<>2
  or (select count(*) from private.site_material_needs where project_id=project
      and homeowner_paid_method='cash' and homeowner_paid_amount=2500
      and homeowner_paid_by='11111111-1111-4111-8111-111111111111')<>1
  or (select count(*) from private.site_material_needs where project_id=project and boq_item_id is not null)<>1
 then raise exception 'FAIL: material requests not captured with activity, date and requester';end if;
 if exists(select 1 from public.purchase_orders where project_id=project)
  or exists(select 1 from public.purchase_requisitions where project_id=project)
 then raise exception 'FAIL: material request created procurement documents automatically';end if;
 raise notice 'PASS 8: BOQ and manual material requests captured; direct supplier cash stayed outside company Finance';
end$material_check$;
set local role authenticated;
select pg_temp.as_user('77777777-7777-4777-8777-777777777777');
select pg_temp.expect_fail(format($q$select public.project_material_homeowner_cash_paid(%L,%L,%L,2500.00,(now() at time zone 'Asia/Kolkata')::date,'TEST ONLY local supplier','','TEST ONLY permission check')$q$,
 pg_temp.org(),pg_temp.project(),current_setting('test.direct_cash_material',true)::uuid),
 '42501','watchman cannot record procurement payment');

------------------------------------------------------------------------------
-- 9. Certification, stage payments and concurrent floors.
------------------------------------------------------------------------------
select pg_temp.certify('FOUNDATION',true);
select pg_temp.execute_stage('F1_SLAB');
select pg_temp.certify('F1_SLAB',true);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('F3_SLAB'),'start','Third floor slab shuttering');
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('F1_MASONRY'),'start','First floor brickwork');
select pg_temp.work('F3_SLAB',0,'start');
select pg_temp.work('F1_MASONRY',0,'start');
do $parallel$
begin
 if pg_temp.exec_status('F3_SLAB')<>'in_progress' or pg_temp.exec_status('F1_MASONRY')<>'in_progress' then
   raise exception 'FAIL: third floor slab and first floor brickwork not concurrent';end if;
 if (select count(*) from jsonb_array_elements(public.project_stage_checklist_read(pg_temp.org(),pg_temp.project())->'work') w
     where w->>'status'='in_progress')<>2 then raise exception 'FAIL: two concurrent work items expected';end if;
 if pg_temp.blockers('F3_MASONRY') not like '%Finish prerequisite%' then
   raise exception 'FAIL: dependent masonry not blocked: %',pg_temp.blockers('F3_MASONRY');end if;
 raise notice 'PASS 9a: third floor slab and first floor brickwork run concurrently; dependents stay blocked';
end$parallel$;
select pg_temp.execute_stage('F3_SLAB');
do $structural_hold$
begin
 if pg_temp.blockers('F3_MASONRY') not like '%Structural sign-off required%' then
   raise exception 'FAIL: uncertified slab released dependent work: %',pg_temp.blockers('F3_MASONRY');end if;
end$structural_hold$;
select pg_temp.certify('F3_SLAB',true);
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $payments$
declare contract uuid=current_setting('test.flow_contract')::uuid;labels text;
begin
 select string_agg(i.label,'|' order by i.sort_order) into labels from public.payment_requests r
  join public.payment_schedule_items i on i.id=r.schedule_item_id where r.contract_id=contract;
 if labels is distinct from 'Foundation certified|Third floor slab certified' then
   raise exception 'FAIL: stage payment requests wrong or duplicated: %',labels;end if;
 if (select count(*) from public.payments where contract_id=contract)<>1 then
   raise exception 'FAIL: a stage request manufactured a payment';end if;
 if pg_temp.blockers('F3_MASONRY')<>'[]' then raise exception 'FAIL: certified slab still blocks masonry';end if;
 raise notice 'PASS 9b: one payment request per certified milestone, no manufactured receipts';
end$payments$;

------------------------------------------------------------------------------
-- 10. Owner controls: optional task, skip guards, reschedule/assign audit.
------------------------------------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_fail($$select pg_temp.work('F1_MASONRY',0,'skip','{"reason":"Not needed on this floor"}')$$,'42501','engineer cannot skip work');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select set_config('test.optional',(pg_temp.work('F1_MASONRY',0,'add_optional',
  '{"title":"Temporary scaffolding inspection","reason":"Owner requested extra safety walk-through"}')->>'index'),true);
select pg_temp.expect_fail($$select pg_temp.work('F1_MASONRY',0,'skip','{"reason":"Homeowner wants an open plan here"}')$$,'23514','in-progress contracted work cannot be skipped');
select pg_temp.expect_fail($$select pg_temp.work('HANDOVER',0,'skip','{"reason":"Homeowner will clean the house"}')$$,'23514','contracted scope needs an approved change order');
select pg_temp.expect_fail(format($$select pg_temp.work('F1_MASONRY',%s,'skip','{"reason":"short"}')$$,current_setting('test.optional')),'22023','skip needs a real reason');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select set_config('test.mason_photo',pg_temp.photo('site','First floor brickwork courses')::text,true);
select pg_temp.work('F1_MASONRY',0,'complete',jsonb_build_object('photo_id',current_setting('test.mason_photo')));
select public.project_stage_checklist_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('F1_MASONRY'),'check',0,
  'Wall alignment check','done','Plumb within 5 mm',current_setting('test.mason_photo')::uuid);
select pg_temp.expect_fail(format('select public.construction_stage_execution_command(%L,%L,%L,''submit_for_qc'','''')',
  pg_temp.org(),pg_temp.project(),pg_temp.stage('F1_MASONRY')),'23514','owner-added task must be resolved before QC');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.work('F1_MASONRY',current_setting('test.optional')::int,'skip','{"reason":"Scaffold supplier certified the structure today"}');
select pg_temp.expect_fail($$select pg_temp.work('F1_MASONRY',0,'skip','{"reason":"Trying to skip completed work"}')$$,'23514','completed work cannot be skipped');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('F1_MASONRY'),'submit_for_qc','Brickwork done');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $audit$
declare events jsonb=public.project_stage_checklist_read(pg_temp.org(),pg_temp.project())->'events';
begin
 if not exists(select 1 from jsonb_array_elements(events) e where e->>'action'='skip' and e->'detail'->>'reason' like 'Scaffold%'
     and e->>'actor_id'='11111111-1111-4111-8111-111111111111')
  or not exists(select 1 from jsonb_array_elements(events) e where e->>'action'='assign' and e->'detail'->>'crew'='Marking gang A')
  or not exists(select 1 from jsonb_array_elements(events) e where e->>'action'='add_optional')
  or not exists(select 1 from jsonb_array_elements(events) e where e->>'action'='material_request')
  or not exists(select 1 from jsonb_array_elements(events) e where e->>'action'='pause' and e->'detail'->>'note' like 'Rain%')
 then raise exception 'FAIL: owner and engineer actions not audited';end if;
 raise notice 'PASS 10: optional task added and skipped with reason; contracted/completed/QC work protected; audit trail complete';
end$audit$;

------------------------------------------------------------------------------
-- 11. Permissions and homeowner visibility.
------------------------------------------------------------------------------
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
do $homeowner$
declare requests jsonb;portal jsonb;
begin
 perform pg_temp.expect_fail(format('select public.project_stage_checklist_read(%L,%L)',pg_temp.org(),pg_temp.project()),'42501','homeowner cannot read internal checklist');
 perform pg_temp.expect_fail(format('select public.project_curing_read(%L,%L)',pg_temp.org(),pg_temp.project()),'42501','homeowner cannot read curing register');
 perform pg_temp.expect_fail($$select pg_temp.work('F1_MASONRY',0,'reopen')$$,'42501','homeowner cannot change work');
 perform pg_temp.expect_fail(format('select public.project_boq_items_read(%L,%L)',pg_temp.org(),pg_temp.project()),'42501','homeowner cannot read staff BOQ projection');
 requests=to_jsonb(public.client_portal_stage_payment_requests(pg_temp.project()));
 if requests::text not like '%Foundation certified%' or requests::text not like '%Third floor slab certified%' then
   raise exception 'FAIL: homeowner cannot see stage payment requests: %',left(requests::text,500);end if;
 portal=to_jsonb(public.client_portal_project(pg_temp.project()));
 if portal::text ~* 'measurements|spec_reference|assignee|skip_reason' then
   raise exception 'FAIL: homeowner portal leaks internal execution records';end if;
 raise notice 'PASS 11: homeowner sees requests and approved progress only; internal records denied';
end$homeowner$;
select pg_temp.as_user('44444444-4444-4444-8444-444444444444');
select pg_temp.expect_fail(format('select public.project_curing_read(%L,%L)',pg_temp.org(),pg_temp.project()),'42501','unassigned accountant cannot read curing');
select pg_temp.expect_fail($$select pg_temp.work('F1_MASONRY',0,'reopen')$$,'42501','unassigned member cannot change work');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_fail(format('select public.project_work_item_command(%L,%L,%L,0,''start'',''{}'')',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pg_temp.project(),pg_temp.stage('F1_MASONRY')),'42501','cross-tenant command denied');
do $done$ begin raise notice 'PASS: single project flow acceptance scenario complete'; end$done$;
rollback;
