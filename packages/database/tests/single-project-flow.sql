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
 if structural then
   perform pg_temp.as_user('66666666-6666-4666-8666-666666666666');
   perform public.construction_quality_command(pg_temp.org(),pg_temp.project(),'review',jsonb_build_object(
     'stage_id',pg_temp.stage(code),'inspection_id',inspection,'review_kind','structural','decision','approved',
     'notes','Independent structural review of reinforcement and concrete for '||code));
   perform pg_temp.as_user('11111111-1111-4111-8111-111111111111');
 end if;
 perform public.construction_quality_command(pg_temp.org(),pg_temp.project(),'stage_clear',jsonb_build_object(
   'stage_id',pg_temp.stage(code),'notes','Stage certified after independent reviews: '||code));
end$$;

------------------------------------------------------------------------------
-- 1. Confirm project and signed agreement; advance request issued once.
------------------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $agreement$
declare org uuid=pg_temp.org();project uuid=pg_temp.project();contract uuid;media uuid;advance uuid;
 schedule_items integer;
begin
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 perform public.project_site_command(org,project,'assign','{"user_id":"33333333-3333-4333-8333-333333333333","role":"architect"}');
 perform public.project_site_command(org,project,'assign','{"user_id":"66666666-6666-4666-8666-666666666666","role":"structural_designer"}');
 perform public.project_site_command(org,project,'assign','{"user_id":"22222222-2222-4222-8222-222222222222","role":"site_engineer"}');
 perform public.project_site_command(org,project,'assign','{"user_id":"77777777-7777-4777-8777-777777777777","role":"watchman"}');
 perform public.project_site_command(org,project,'assign','{"user_id":"88888888-8888-4888-8888-888888888888","role":"quality_inspector"}');
 contract=public.contract_create(org,current_setting('test.flow_revision')::uuid);
 perform set_config('test.flow_contract',contract::text,true);
 media=public.project_site_media_put(org,project,'agreement','signed.pdf','application/pdf',
   encode(convert_to('%PDF-1.7'||chr(10)||'Signed agreement fixture','UTF8'),'base64'),'Signed paper agreement');
 -- The signed copy alone never authorizes design or site work.
 perform public.project_agreement_command(org,project,contract,'record_signed_pdf',
   jsonb_build_object('media_id',media,'note','Signed paper agreement received at office'));
 perform public.contract_transition(org,contract,1,'active');
 select count(*) into schedule_items from public.payment_schedule_items i join public.payment_schedules s on s.id=i.schedule_id
  where s.contract_id=contract and s.status='active';
 if schedule_items<>4 then raise exception 'FAIL: agreed stage payment schedule not activated (% items)',schedule_items;end if;
 -- The application issues the agreed advance (Booking advance|10) on signing.
 -- Repeating the call (retry, double click, second staff member) is idempotent.
 advance=public.project_advance_proforma_prepare(org,project,10);
 if advance is distinct from public.project_advance_proforma_prepare(org,project,10) then
   raise exception 'FAIL: advance request duplicated';end if;
 if (select count(*) from public.invoices where organization_id=org and contract_id=contract and invoice_type='proforma')<>1 then
   raise exception 'FAIL: expected exactly one advance request';end if;
 perform set_config('test.flow_advance',advance::text,true);
 if (public.project_advance_read(org,project)->>'received')::numeric<>0
    or (public.project_agreement_read(org,project)->>'execution_authorized')<>'false' then
   raise exception 'FAIL: signed agreement or invoice treated as money received';end if;
 -- This project's policy: design waits for the verified advance.
 perform public.project_advance_policy_set(org,project,true);
 -- Share the project with the verified homeowner.
 perform public.client_portal_manage(org,current_setting('test.flow_customer')::uuid,project,'homeowner@example.test',true);
 raise notice 'PASS 1: signed agreement, agreed schedule, single advance request, nothing marked received';
end$agreement$;

-- Homeowner is notified through the approved portal channel: the advance
-- request is visible, but no receipt exists.
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
do $notify$
declare advance jsonb;
begin
 advance=public.client_portal_advance_request(pg_temp.project());
 if advance->>'id'<>current_setting('test.flow_advance') or advance->>'status'<>'payment_requested'
    or (advance->>'received')::numeric<>0 then
   raise exception 'FAIL: homeowner cannot see an accurate advance request: %',advance;end if;
 raise notice 'PASS 1b: homeowner sees the issued advance request in the portal';
end$notify$;

------------------------------------------------------------------------------
-- 2. Design waits for verified advance; Finance verifies the payment.
------------------------------------------------------------------------------
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select pg_temp.expect_fail(format($$select public.project_site_command(%L,%L,'design_submit','{"kind":"architectural_plan","reference":"FP-01 ground floor plan"}')$$,
  pg_temp.org(),pg_temp.project()),'23514','floor plan cannot start before verified advance');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $payment$
declare org uuid=pg_temp.org();contract uuid=current_setting('test.flow_contract')::uuid;method uuid;total numeric;
begin
 select id into method from public.payment_methods where organization_id=org and kind='bank_transfer' limit 1;
 select i.total::numeric into total from public.invoices i where i.id=current_setting('test.flow_advance')::uuid;
 perform public.payment_record(org,contract,jsonb_build_object('idempotency_key',gen_random_uuid(),
   'payment_date',current_date,'amount',trim_scale(total)::text,'method_id',method));
 if (public.project_advance_read(org,pg_temp.project())->>'received')::numeric<>total
    or (public.project_agreement_read(org,pg_temp.project())->>'execution_authorized')<>'true' then
   raise exception 'FAIL: verified advance did not clear the agreement gate';end if;
 raise notice 'PASS 2: Finance-verified advance receipt clears the commercial gate';
end$payment$;
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
do $notify_paid$
begin
 if public.client_portal_advance_request(pg_temp.project())->>'status'<>'received' then
   raise exception 'FAIL: homeowner does not see the verified receipt';end if;
end$notify_paid$;

------------------------------------------------------------------------------
-- 3. Floor plan → homeowner change request → revision → approval.
------------------------------------------------------------------------------
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select set_config('test.fp1',(public.project_site_command(pg_temp.org(),pg_temp.project(),'design_submit',
  '{"kind":"architectural_plan","reference":"FP-01 ground floor plan revision 1"}')->>'id'),true);
-- Structural design cannot start before the homeowner approves the floor plan.
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
select pg_temp.expect_fail(format($$select public.project_site_command(%L,%L,'design_submit','{"kind":"structural_design","reference":"ST-01 footing layout"}')$$,
  pg_temp.org(),pg_temp.project()),'23514','structural design blocked before floor plan approval');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.project_site_command(pg_temp.org(),pg_temp.project(),'design_decide',
  jsonb_build_object('id',current_setting('test.fp1'),'decision','approved','note','Technically checked'));
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
select public.client_portal_design_decide(pg_temp.project(),'changes_requested','architectural_plan',
  'Please enlarge the kitchen by two feet toward the utility');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select set_config('test.fp2',(public.project_site_command(pg_temp.org(),pg_temp.project(),'design_submit',
  '{"kind":"architectural_plan","reference":"FP-01 ground floor plan revision 2 kitchen enlarged"}')->>'id'),true);
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.project_site_command(pg_temp.org(),pg_temp.project(),'design_decide',
  jsonb_build_object('id',current_setting('test.fp2'),'decision','approved','note','Kitchen revision checked'));
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
select public.client_portal_design_decide(pg_temp.project(),'approved','architectural_plan','Looks good');
do $portal_design$
declare r jsonb=public.client_portal_design_status(pg_temp.project());
begin
 if not exists(select 1 from jsonb_array_elements(r->'drawings') x where x->>'kind'='architectural_plan'
     and (x->>'revision')::int=2 and x->>'client_approved_at' is not null)
    or jsonb_array_length(r->'decisions')<>2 then
   raise exception 'FAIL: homeowner cannot see drawing decisions: %',r;end if;
end$portal_design$;
reset role;
do $design_history$
declare project uuid=current_setting('test.flow_project')::uuid;
begin
 if (select count(*) from private.site_designs where project_id=project and kind='architectural_plan')<>2
  or (select status from private.site_designs where id=current_setting('test.fp1')::uuid)<>'changes_requested'
  or (select client_approved_at is null from private.site_designs where id=current_setting('test.fp2')::uuid)
 then raise exception 'FAIL: floor plan revisions or decision not preserved';end if;
 if (select count(*) from private.client_design_decisions where project_id=project and design_id is not null)<>2
 then raise exception 'FAIL: homeowner decisions not tied to drawing revisions';end if;
 raise notice 'PASS 3: floor plan revision history and homeowner decisions preserved';
end$design_history$;
set local role authenticated;

------------------------------------------------------------------------------
-- 4. Structural and 3D in parallel, approvals, execution release.
------------------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $design_read$
declare r jsonb=public.project_design_flow_read(pg_temp.org(),pg_temp.project());
begin
 if (r->>'advance_before_design')<>'true' or jsonb_array_length(r->'designs')<>2 or jsonb_array_length(r->'decisions')<>2
    or not exists(select 1 from jsonb_array_elements(r->'designs') d where d->>'client_approved_at' is not null)
 then raise exception 'FAIL: design journey read incomplete: %',r;end if;
end$design_read$;
select pg_temp.as_user('66666666-6666-4666-8666-666666666666');
select set_config('test.st',(public.project_site_command(pg_temp.org(),pg_temp.project(),'design_submit',
  '{"kind":"structural_design","reference":"ST-01 structural drawings and bar bending schedule"}')->>'id'),true);
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select set_config('test.vis',(public.project_site_command(pg_temp.org(),pg_temp.project(),'design_submit',
  '{"kind":"3d_design","reference":"3D-01 exterior and interior views"}')->>'id'),true);
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.project_site_command(pg_temp.org(),pg_temp.project(),'design_decide',
  jsonb_build_object('id',current_setting('test.st'),'decision','approved','note','Structural clearance verified'));
select public.project_site_command(pg_temp.org(),pg_temp.project(),'design_decide',
  jsonb_build_object('id',current_setting('test.vis'),'decision','approved','note','Visualization checked'));
-- Physical work cannot start before the homeowner approves the design set.
select pg_temp.expect_fail(format($$select public.project_site_command(%L,%L,'execution_start','{}')$$,
  pg_temp.org(),pg_temp.project()),'42501','execution blocked before design approval');
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
select public.client_portal_design_decide(pg_temp.project(),'approved',null,'All drawings approved');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.project_site_command(pg_temp.org(),pg_temp.project(),'execution_start','{}');
do $plan$
declare org uuid=pg_temp.org();project uuid=pg_temp.project();contract uuid=current_setting('test.flow_contract')::uuid;
 hash text;plan uuid;revision uuid;milestone uuid;code text;estimate uuid;scope uuid;v integer;
begin
 select md5(coalesce(string_agg(qi.id::text||chr(31)||coalesce(qi.snapshot->>'name','')||chr(31)||qi.description||chr(31)||
   case when qi.optional then '1' else '0' end,chr(30) order by qi.id),''))
 into hash from public.quotation_items qi where qi.organization_id=org and qi.revision_id=current_setting('test.flow_revision')::uuid;
 perform public.project_quote_timeline_create(org,contract,jsonb_build_object(
  'industry','construction','quote_hash',hash,
  'template',jsonb_build_object('industry','construction','version','1.0.0'),
  'zones',jsonb_build_array(jsonb_build_object('code','F1','name','First floor'),jsonb_build_object('code','F3','name','Third floor')),
  'stages',jsonb_build_array(
   jsonb_build_object('instanceCode','SITE_PREP','templateCode','SITE_PREPARATION','phase','site_preparation','floorCode',null,
     'title','Site preparation and excavation','explanation','Setting out to founding level','holdPoint','quality','dependsOn','[]'::jsonb,
     'activities',jsonb_build_array('Site clearing and marking','Excavation to founding level'),
     'inspectionTopics',jsonb_build_array('Founding level inspection')),
   jsonb_build_object('instanceCode','FOUNDATION','templateCode','FOUNDATION','phase','foundation','floorCode',null,
     'title','Footings','explanation','PCC, reinforcement, concreting and curing','holdPoint','structural','dependsOn',jsonb_build_array('SITE_PREP'),
     'activities',jsonb_build_array('PCC below footings','Footing reinforcement','Footing concreting','Footing curing'),
     'inspectionTopics',jsonb_build_array('Pre-pour reinforcement check')),
   jsonb_build_object('instanceCode','F1_SLAB','templateCode','SLAB','phase','superstructure','floorCode','F1',
     'title','First floor columns and slab','explanation','Structural frame','holdPoint','structural','dependsOn',jsonb_build_array('FOUNDATION'),
     'activities',jsonb_build_array('Columns up to first floor','First floor slab concreting'),
     'inspectionTopics',jsonb_build_array('First floor slab pre-pour check')),
   jsonb_build_object('instanceCode','F1_MASONRY','templateCode','MASONRY','phase','masonry','floorCode','F1',
     'title','First floor brickwork','explanation','Walls on first floor','holdPoint','quality','dependsOn',jsonb_build_array('F1_SLAB'),
     'activities',jsonb_build_array('First floor brickwork'),'inspectionTopics',jsonb_build_array('Wall alignment check')),
   jsonb_build_object('instanceCode','F3_SLAB','templateCode','SLAB','phase','superstructure','floorCode','F3',
     'title','Third floor slab','explanation','Structural frame','holdPoint','structural','dependsOn',jsonb_build_array('F1_SLAB'),
     'activities',jsonb_build_array('Third floor slab reinforcement','Third floor slab concreting'),
     'inspectionTopics',jsonb_build_array('Third floor slab pre-pour check')),
   jsonb_build_object('instanceCode','F3_MASONRY','templateCode','MASONRY','phase','masonry','floorCode','F3',
     'title','Third floor brickwork','explanation','Walls on third floor','holdPoint','quality','dependsOn',jsonb_build_array('F3_SLAB'),
     'activities',jsonb_build_array('Third floor brickwork'),'inspectionTopics','[]'::jsonb),
   jsonb_build_object('instanceCode','HANDOVER','templateCode','HANDOVER','phase','handover','floorCode',null,
     'title','Finishes and handover','explanation','Close out','holdPoint','handover',
     'dependsOn',jsonb_build_array('F1_MASONRY','F3_MASONRY'),
     'activities',jsonb_build_array('Final cleaning and handover'),'inspectionTopics','[]'::jsonb))));
 -- Independent reviewers for formal certification.
 perform public.construction_project_command(org,project,'role_assign',
   '{"user_id":"11111111-1111-4111-8111-111111111111","role":"quality_inspector"}');
 perform public.construction_project_command(org,project,'role_assign',
   '{"user_id":"88888888-8888-4888-8888-888888888888","role":"quality_inspector"}');
 perform public.construction_project_command(org,project,'role_assign',
   '{"user_id":"66666666-6666-4666-8666-666666666666","role":"structural_engineer"}');
 -- Canonical Operations plan whose tasks back each stage certificate.
 -- Operations planning needs an approved execution estimate for the contract.
 estimate=public.execution_estimate_command(org,'create',jsonb_build_object('contract_id',contract));
 for scope in select id from public.execution_estimate_scope_items where revision_id=estimate and coverage='unestimated' loop
   select version into v from public.execution_estimate_revisions where id=estimate;
   perform public.execution_estimate_command(org,'exclude_scope',jsonb_build_object('id',estimate,'version',v,
     'scope_id',scope,'reason','Estimated in the site procurement package'));
 end loop;
 select version into v from public.execution_estimate_revisions where id=estimate;
 perform public.execution_estimate_command(org,'submit',jsonb_build_object('id',estimate,'version',v));
 perform public.execution_estimate_command(org,'approve',jsonb_build_object('id',estimate,'version',v+1));
 plan=public.operations_plan(org,'create',jsonb_build_object('contract_id',contract));
 milestone=public.operations_save(org,'project_milestones',jsonb_build_object('project_id',project,'plan_id',plan,'name','Structure'));
 foreach code in array array['SITE_PREP','FOUNDATION','F1_SLAB','F3_SLAB'] loop
   perform public.operations_save(org,'project_tasks',jsonb_build_object('project_id',project,'plan_id',plan,
     'milestone_id',milestone,'title','Certify '||code));
 end loop;
 select id into revision from public.execution_plan_revisions where plan_id=plan and status='draft';
 perform public.operations_plan(org,'approve',jsonb_build_object('id',revision,'version',1));
 perform public.operations_plan(org,'status',jsonb_build_object('id',plan,'version',1,'status','in_progress'));
 perform set_config('test.flow_template',public.operations_save(org,'inspection_templates',
   '{"name":"Stage conformance","is_final":false,"mandatory":true,"checklist":[{"key":"conformance","label":"Work conforms to drawings","required":true}]}'::jsonb)::text,true);
 if exists(select 1 from jsonb_array_elements(public.construction_stage_execution_read(org,project)) e
   where e->>'status'<>'not_started') then raise exception 'FAIL: planning started work automatically';end if;
 raise notice 'PASS 4: structural and 3D prepared concurrently, homeowner approval, execution released';
end$plan$;

------------------------------------------------------------------------------
-- 5. Marking and excavation with engineer measurements.
------------------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.work('SITE_PREP',0,'assign','{"user_id":"22222222-2222-4222-8222-222222222222","crew":"Marking gang A"}');
select pg_temp.expect_fail($$select pg_temp.work('SITE_PREP',0,'assign','{"user_id":"77777777-7777-4777-8777-777777777777"}')$$,
  '22023','watchman cannot be assigned engineering work');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_fail($$select pg_temp.work('SITE_PREP',0,'start')$$,'23514','work item cannot start before its stage');
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('SITE_PREP'),'start','');
select pg_temp.work('SITE_PREP',0,'start');
select pg_temp.expect_fail($$select pg_temp.work('SITE_PREP',0,'complete')$$,'23514','completion requires an actual photo');
select set_config('test.marking_photo',pg_temp.photo('site','Footing marking with string lines')::text,true);
select pg_temp.work('SITE_PREP',0,'complete',jsonb_build_object('photo_id',current_setting('test.marking_photo'),
  'measurements','[{"label":"Grid diagonal check","value":"14.142","unit":"m"}]'::jsonb));
select pg_temp.work('SITE_PREP',1,'start');
select pg_temp.work('SITE_PREP',1,'pause','{"note":"Rain, dewatering required"}');
select pg_temp.work('SITE_PREP',1,'resume');
select pg_temp.work('SITE_PREP',1,'measure','{"measurements":[{"label":"Depth","value":"1500","unit":"mm"},{"label":"Width","value":"1800","unit":"mm"},{"label":"Founding level","value":"-1.500","unit":"m"}]}');
select pg_temp.work('SITE_PREP',1,'complete',jsonb_build_object('photo_id',current_setting('test.marking_photo')));
select public.project_stage_checklist_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('SITE_PREP'),'check',0,
  'Founding level inspection','done','Hard strata reached at -1.5 m',current_setting('test.marking_photo')::uuid);
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('SITE_PREP'),'submit_for_qc','Excavation complete');
do $excavation$
declare w jsonb;
begin
 select x into w from jsonb_array_elements(public.project_stage_checklist_read(pg_temp.org(),pg_temp.project())->'work') x
  where (x->>'stage_id')::uuid=pg_temp.stage('SITE_PREP') and (x->>'index')::int=1;
 if w->>'status'<>'completed' or jsonb_array_length(w->'measurements')<>3 or w->>'started_at' is null then
   raise exception 'FAIL: excavation measurements not recorded: %',w;end if;
 if pg_temp.exec_status('SITE_PREP')<>'ready_for_qc' then raise exception 'FAIL: site prep not submitted';end if;
 raise notice 'PASS 5: marking and excavation recorded with depth/width/level measurements';
end$excavation$;
select pg_temp.certify('SITE_PREP',false);

------------------------------------------------------------------------------
-- 6. PCC, reinforcement, independent pre-pour QC with corrective work.
------------------------------------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),'start','');
select set_config('test.footing_photo',pg_temp.photo('site','Footing reinforcement and cover blocks')::text,true);
select pg_temp.work('FOUNDATION',0,'start');
select pg_temp.work('FOUNDATION',0,'complete',jsonb_build_object('photo_id',current_setting('test.footing_photo'),
 'measurements','[{"label":"PCC thickness","value":"100","unit":"mm"}]'::jsonb));
select pg_temp.work('FOUNDATION',1,'start');
select pg_temp.work('FOUNDATION',1,'complete',jsonb_build_object('photo_id',current_setting('test.footing_photo'),
 'measurements','[{"label":"Bar spacing","value":"150","unit":"mm"},{"label":"Cover","value":"50","unit":"mm"}]'::jsonb));
select pg_temp.work('FOUNDATION',2,'start');
select pg_temp.work('FOUNDATION',2,'complete',jsonb_build_object('photo_id',current_setting('test.footing_photo')));
select pg_temp.work('FOUNDATION',3,'start');
select pg_temp.work('FOUNDATION',3,'complete',jsonb_build_object('photo_id',current_setting('test.footing_photo')));
select public.project_stage_checklist_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),'check',0,
  'Pre-pour reinforcement check','done','Engineer checked spacing and cover',current_setting('test.footing_photo')::uuid);
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),'submit_for_qc','Ready for pre-pour QC');
-- The engineer who performed the check cannot QC-approve it.
select pg_temp.expect_fail(format('select public.construction_stage_qc_item_command(%L,%L,%L,0,''passed'',''Self check'',%L,true)',
  pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),current_setting('test.footing_photo')),'42501','engineer cannot self-approve QC');
-- Independent QC fails the item, corrective work follows, QC re-inspects.
select pg_temp.as_user('88888888-8888-4888-8888-888888888888');
select public.construction_stage_qc_item_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),0,'failed',
  'Cover blocks missing at two footings, add before pour',current_setting('test.footing_photo')::uuid,true);
-- The whole scenario runs in one transaction (one now()). Rework happens later
-- in reality, so the failed review is moved one hour back to keep the review
-- order deterministic; no decision or outcome is altered.
reset role;
update private.construction_stage_qc_item_reviews set reviewed_at=reviewed_at-interval '1 hour'
 where project_id=current_setting('test.flow_project')::uuid and decision='failed';
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_fail(format('select public.construction_stage_execution_command(%L,%L,%L,''start'','''')',
  pg_temp.org(),pg_temp.project(),pg_temp.stage('F1_SLAB')),'23514','failed QC holds dependent structural work');
do $rework$ begin
 -- A failed QC item reopens the stage for corrective work automatically.
 if pg_temp.exec_status('FOUNDATION')<>'in_progress' then raise exception 'FAIL: QC failure did not reopen the stage';end if;
end$rework$;
select public.project_stage_checklist_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),'check',0,
  'Pre-pour reinforcement check','done','Cover blocks added at all footings',current_setting('test.footing_photo')::uuid);
select public.construction_stage_execution_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),'submit_for_qc','Corrected');
select pg_temp.as_user('88888888-8888-4888-8888-888888888888');
select public.construction_stage_qc_item_command(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),0,'passed',
  'Cover blocks verified on re-inspection',current_setting('test.footing_photo')::uuid,true);
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $hold$
begin
 if pg_temp.blockers('F1_SLAB') not like '%Structural sign-off required%' then
   raise exception 'FAIL: structural hold point not blocking first floor slab: %',pg_temp.blockers('F1_SLAB');end if;
 raise notice 'PASS 6: PCC/reinforcement measured, independent pre-pour QC failed then passed, hold point enforced';
end$hold$;

------------------------------------------------------------------------------
-- 7. Curing: one schedule from the approved spec, watchman and engineer rounds.
------------------------------------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_fail(format($$select public.project_curing_command(%L,%L,'plan_create','{}')$$,pg_temp.org(),pg_temp.project()),
  '42501','engineer cannot approve a curing schedule');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $curing_plan$
declare zone text='Asia/Kolkata';now_m timestamptz=date_trunc('minute',now());today date=(now() at time zone 'Asia/Kolkata')::date;
begin
 perform set_config('test.r1',(now_m-interval '1 hour')::text,true);
 perform set_config('test.r2',(now_m-interval '3 hours')::text,true);
 perform set_config('test.r3',(now_m+interval '5 hours')::text,true);
 perform set_config('test.curing_plan',(public.project_curing_command(pg_temp.org(),pg_temp.project(),'plan_create',jsonb_build_object(
   'stage_id',pg_temp.stage('FOUNDATION'),'activity_index',3,'title','Footing curing',
   'spec_reference','Structural drawing ST-01 note 7: keep footings wet',
   'starts_on',today-1,'ends_on',today+6,'grace_minutes',90,
   'round_times',jsonb_build_array(
     to_char((now_m-interval '1 hour') at time zone zone,'HH24:MI'),
     to_char((now_m-interval '3 hours') at time zone zone,'HH24:MI'),
     to_char((now_m+interval '5 hours') at time zone zone,'HH24:MI'))))->>'id'),true);
end$curing_plan$;
select pg_temp.as_user('77777777-7777-4777-8777-777777777777');
do $watchman$
declare gate uuid;photo uuid;read jsonb;
begin
 -- Watchman sees only curing, not engineering records or work commands.
 perform pg_temp.expect_fail(format('select public.project_stage_checklist_read(%L,%L)',pg_temp.org(),pg_temp.project()),'42501','watchman cannot read engineering checklist');
 perform pg_temp.expect_fail($$select pg_temp.work('FOUNDATION',0,'reopen')$$,'42501','watchman cannot change work items');
 perform pg_temp.expect_fail(format($$select public.project_curing_command(%L,%L,'round_record',%L)$$,pg_temp.org(),pg_temp.project(),
   jsonb_build_object('plan_id',current_setting('test.curing_plan'),'round_at',current_setting('test.r3'),'remarks','Too early')),
   '23514','future curing round cannot be pre-recorded');
 perform pg_temp.expect_fail(format($$select public.project_curing_command(%L,%L,'round_record',%L)$$,pg_temp.org(),pg_temp.project(),
   jsonb_build_object('plan_id',current_setting('test.curing_plan'),'round_at',(current_setting('test.r1')::timestamptz-interval '1 day'),'remarks','Old round')),
   '23514','round older than 24 hours stays missed');
 gate=(public.project_curing_command(pg_temp.org(),pg_temp.project(),'round_record',jsonb_build_object(
   'plan_id',current_setting('test.curing_plan'),'round_at',current_setting('test.r1'),'remarks','Footings wetted, hessian kept damp'))->>'id')::uuid;
 photo=pg_temp.photo('curing','Watchman curing photo');
 perform public.project_curing_command(pg_temp.org(),pg_temp.project(),'round_photo',jsonb_build_object('gate_id',gate,'photo_id',photo));
 perform pg_temp.expect_fail(format($$select public.project_curing_command(%L,%L,'round_record',%L)$$,pg_temp.org(),pg_temp.project(),
   jsonb_build_object('plan_id',current_setting('test.curing_plan'),'round_at',current_setting('test.r1'),'remarks','Duplicate')),
   '23505','one canonical record per curing round');
 read=public.project_curing_read(pg_temp.org(),pg_temp.project());
 if read->>'missed_total' is not null then raise exception 'FAIL: watchman received supervisor alerts';end if;
end$watchman$;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $engineer_curing$
declare r jsonb;read jsonb;
begin
 r=public.project_curing_command(pg_temp.org(),pg_temp.project(),'round_record',jsonb_build_object(
   'plan_id',current_setting('test.curing_plan'),'round_at',current_setting('test.r2'),'remarks','Ponding checked by engineer'));
 if (r->>'late')::boolean is distinct from true then raise exception 'FAIL: late round not flagged';end if;
 read=public.project_curing_read(pg_temp.org(),pg_temp.project());
 if (select count(*) from jsonb_array_elements(read->'rounds') x where x->>'status'='recorded')<>2
  or (read->>'missed_total')::int<1
  or not exists(select 1 from jsonb_array_elements(read->'rounds') x where x->>'status'='upcoming')
 then raise exception 'FAIL: curing read model incorrect: %',left(read::text,600);end if;
 raise notice 'PASS 7: curing recorded by watchman and engineer, missed rounds alerted, nothing assumed';
end$engineer_curing$;

------------------------------------------------------------------------------
-- 8. Tomorrow's material: one from the BOQ, one manual; nothing ordered.
------------------------------------------------------------------------------
do $materials$
declare boq jsonb;steel uuid;tomorrow date=(now() at time zone 'Asia/Kolkata')::date+1;
begin
 boq=public.project_boq_items_read(pg_temp.org(),pg_temp.project());
 if jsonb_array_length(boq)<>3 or boq::text ~* 'rate|amount' then raise exception 'FAIL: BOQ projection wrong or leaks prices: %',boq;end if;
 select (x->>'id')::uuid into steel from jsonb_array_elements(boq) x where x->>'name' like 'Reinforcement%';
 perform public.project_work_item_material_request(pg_temp.org(),pg_temp.project(),pg_temp.stage('FOUNDATION'),3,
   jsonb_build_array(
    jsonb_build_object('boq_item_id',steel,'quantity','0.8','unit','tonnes','required_date',tomorrow),
    jsonb_build_object('item','OPC 53 grade cement','quantity','40','unit','bags','required_date',tomorrow,'notes','For column starters'),
    jsonb_build_object('item','Binding wire','quantity','25','unit','kg','required_date',tomorrow)));
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
      and status='requested' and requested_by='22222222-2222-4222-8222-222222222222' and activity_index=3)<>3
  or (select count(*) from private.site_material_needs where project_id=project and boq_item_id is not null)<>1
 then raise exception 'FAIL: material requests not captured with activity, date and requester';end if;
 if exists(select 1 from public.purchase_orders where project_id=project)
  or exists(select 1 from public.purchase_requisitions where project_id=project)
 then raise exception 'FAIL: material request created procurement documents automatically';end if;
 raise notice 'PASS 8: BOQ and manual material requests captured; no PO, stock or payment created';
end$material_check$;
set local role authenticated;

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
