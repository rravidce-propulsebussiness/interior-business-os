-- Runs in the execution.sql fixture transaction, before its final rollback.
reset role;
update public.projects set industry_id=(
  select id from public.industries where key='construction'
) where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  and id in (
    select project_id from public.quotations
    where quotation_number='EXECUTION-TEST'
      and organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  );
delete from public.organization_entitlements where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and not enabled and module_id in(select id from public.modules where key='billing');
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';c uuid;p uuid;r uuid;t uuid;t2 uuid;m uuid;pkg uuid;v integer;template uuid;i uuid;i2 uuid;s uuid;h uuid;ht uuid;vendor uuid;wo uuid;wm uuid;doc jsonb;media uuid;contract uuid;schedule uuid;qc_stage uuid;qc_tpl uuid;qc_inspection uuid;qc_wf uuid;quote_hash text;qc_review uuid;struct_review uuid;qc_clear uuid;qc_data jsonb;begin
 select id into c from public.contracts where revision_id in(select r.id from public.quotation_revisions r join public.quotations q on q.id=r.quotation_id where q.quotation_number='EXECUTION-TEST');
 p=public.operations_plan(org,'create',jsonb_build_object('contract_id',c));
 perform pg_temp.execution_assert(p=public.operations_plan(org,'create',jsonb_build_object('contract_id',c)),'plan creation retry returns same plan');
 select id into r from public.execution_plan_revisions where plan_id=p and status='draft';
 select project_id into c from public.execution_plans where id=p;
 -- The plan itself may be drafted without physical authorization. Moving it
 -- to in_progress later must require an evidenced active agreement.
 contract=(select contract_id from public.execution_plans where id=p);
 perform public.project_site_command(org,c,'initialize','{}'::jsonb);
 pkg=public.operations_save(org,'work_packages',jsonb_build_object('project_id',c,'plan_id',p,'name','Installation'));
 m=public.operations_save(org,'project_milestones',jsonb_build_object('project_id',c,'plan_id',p,'name','Install'));
 t=public.operations_save(org,'project_tasks',jsonb_build_object('project_id',c,'plan_id',p,'work_package_id',pkg,'milestone_id',m,'title','Preparation','weight','2'));
 t2=public.operations_save(org,'project_tasks',jsonb_build_object('project_id',c,'plan_id',p,'milestone_id',m,'title','Installation'));
 perform public.operations_task(org,'dependency_add',jsonb_build_object('id',t2,'version',1,'predecessor_id',t));
 perform pg_temp.execution_denied(format('select public.operations_task(%L,''dependency_add'',%L)',org,jsonb_build_object('id',t,'version',1,'predecessor_id',t2)),'circular task dependency denied');
 perform pg_temp.execution_denied(format('select public.operations_task(%L,''task'',%L)',org,jsonb_build_object('id',t2,'version',2,'status','done')),'unfinished predecessor blocks completion');
 perform public.operations_plan(org,'approve',jsonb_build_object('id',r,'version',1));
 select snapshot into doc from public.execution_plan_revisions where id=r;
 perform pg_temp.execution_denied(format(
   'select public.operations_plan(%L,''status'',%L)',
   org,jsonb_build_object('id',p,'version',1,'status','in_progress')),
   'physical Operations plan cannot begin without evidenced agreement');
 media=public.project_site_media_put(org,c,'agreement','execution-agreement.pdf',
   'application/pdf',encode(convert_to('%PDF-1.7'||chr(10)||
     'Paper agreement in disposable fixture','UTF8'),'base64'),
   'Uploaded paper agreement evidence fixture');
 perform public.project_agreement_command(org,c,contract,'record_signed_pdf',
   jsonb_build_object('media_id',media,
     'note','Signed paper agreement received for test; no electronic signature verification'));
 perform public.contract_transition(org,contract,1,'active');
 schedule=public.payment_schedule_save(org,contract,
   '{"label":"Contractual execution schedule","items":[{"label":"Final completion","calculation_type":"remaining","value":"0"}]}'::jsonb);
 perform public.payment_schedule_activate(org,schedule,1);
 perform public.operations_plan(org,'status',jsonb_build_object('id',p,'version',1,'status','in_progress'));
 perform pg_temp.execution_denied(format('select public.operations_task(%L,''task'',%L)',org,jsonb_build_object('id',t,'version',1,'status','blocked')),'blocked task requires reason');
 perform public.operations_task(org,'task',jsonb_build_object('id',t,'version',1,'status','blocked','reason','Waiting for materials'));
 perform pg_temp.execution_assert((select blocked_at is not null and blocked_by=auth.uid() from public.project_tasks where id=t),'blocked task stores actor and time');
 perform pg_temp.execution_denied(format('select public.operations_task(%L,''task'',%L)',org,jsonb_build_object('id',t,'version',2,'status','in_progress','completion_percentage','120')),'progress cannot exceed 100');
 perform public.operations_task(org,'task',jsonb_build_object('id',t,'version',2,'status','in_progress','completion_percentage','100'));
 perform pg_temp.execution_assert((select status='done' and completion_percentage='100' from public.project_tasks where id=t),'100 percent completes task');
 perform public.operations_task(org,'task',jsonb_build_object('id',t2,'version',2,'status','done'));
 perform public.operations_task(org,'milestone',jsonb_build_object('id',m,'version',1,'status','completed'));

 -- New construction stage certification binds ACTUAL canonical Operations
 -- task completion and passed mandatory inspection; it cannot invent progress.
 select md5(coalesce(string_agg(qi.id::text||chr(31)||
   coalesce(qi.snapshot->>'name','')||chr(31)||qi.description||chr(31)||
   case when qi.optional then '1' else '0' end,chr(30) order by qi.id),''))
 into quote_hash from public.quotation_items qi
 where qi.organization_id=org and qi.revision_id=(
   select revision_id from public.contracts where id=contract);
 qc_wf=(public.project_quote_timeline_create(org,contract,
  jsonb_build_object('industry','construction','quote_hash',quote_hash,
   'template',jsonb_build_object('industry','construction','version','1.0.0'),
   'zones',jsonb_build_array(jsonb_build_object('code','GROUND','name','Ground')),
   'stages',jsonb_build_array(jsonb_build_object(
     'instanceCode','FOUNDATION','templateCode','FOUNDATION',
     'phase','foundation','floorCode',null,'title','Footing bar and concrete QC',
     'explanation','Independent steel and pre-pour clearance required',
     'holdPoint','structural','dependsOn',jsonb_build_array(),
     'activities',jsonb_build_array('Footing reinforcement inspection'),
     'inspectionTopics',jsonb_build_array('Bar spacing and cover check'))))))->>'workflow_id';
 select (stage->>'id')::uuid into qc_stage
   from jsonb_array_elements(public.construction_project_read(org,c)->'stages') stage
   where stage->>'instance_code'='FOUNDATION';
 perform public.construction_project_command(org,c,'task_link',jsonb_build_object(
   'stage_id',qc_stage,'task_id',t));
 perform public.construction_project_command(org,c,'role_assign',
    jsonb_build_object('user_id',auth.uid(),'role','quality_inspector'));
 perform public.construction_project_command(org,c,'role_assign',
    '{"user_id":"33333333-3333-4333-8333-333333333333","role":"structural_engineer"}'::jsonb);
 perform pg_temp.execution_denied(format(
    'select public.construction_quality_command(%L,%L,''stage_clear'',%L)',
    org,c,jsonb_build_object('stage_id',qc_stage,
      'notes','Unreviewed footing work must not certify')),
    'stage certification requires formal inspection and independent reviewers');
 qc_tpl=public.operations_save(org,'inspection_templates',
    '{"name":"Footing steel pre-pour","is_final":false,"mandatory":true,"checklist":[{"key":"bars","label":"Spacing verified","required":true}]}'::jsonb);
 qc_inspection=public.operations_inspection(org,'create',jsonb_build_object(
    'project_id',c,'template_id',qc_tpl,'inspector_id',auth.uid()));
 perform public.construction_quality_command(org,c,'inspection_link',
    jsonb_build_object('stage_id',qc_stage,'inspection_id',qc_inspection));
 perform pg_temp.execution_denied(format(
    'select public.construction_quality_command(%L,%L,''review'',%L)',
    org,c,jsonb_build_object('stage_id',qc_stage,'inspection_id',qc_inspection,
      'review_kind','quality','decision','approved','notes','Unpassed inspection cannot approve')),
    'quality reviewer cannot certify an unpassed inspection');
 perform public.operations_inspection(org,'approve',
    jsonb_build_object('id',qc_inspection,'version',1,'status','passed',
       'results','[{"key":"bars","result":"pass","note":"Checked"}]'::jsonb));
 qc_review=public.construction_quality_command(org,c,'review',jsonb_build_object(
    'stage_id',qc_stage,'inspection_id',qc_inspection,
    'review_kind','quality','decision','approved',
    'notes','Physical bar spacing and cover verified on the passed inspection'));
 perform pg_temp.execution_denied(format(
    'select public.construction_quality_command(%L,%L,''stage_clear'',%L)',
    org,c,jsonb_build_object('stage_id',qc_stage,
      'notes','Structural sign-off must be independent')),
    'independent structural reviewer required for footing hold point');
 perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
 struct_review=public.construction_quality_command(org,c,'review',jsonb_build_object(
   'stage_id',qc_stage,'inspection_id',qc_inspection,
   'review_kind','structural','decision','approved',
   'notes','Independently checked reinforcement and footing structural readiness'));
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 qc_clear=public.construction_quality_command(org,c,'stage_clear',jsonb_build_object(
   'stage_id',qc_stage,
   'notes','Footing stage certified after complete tasks and separate quality reviews'));
 select public.construction_quality_read(org,c) into qc_data;
 perform pg_temp.execution_assert(
   (select item->>'cleared'='true'
    from jsonb_array_elements(qc_data->'stages') item
    where item->>'stage_id'=qc_stage::text),
   'structural footing stage clearance requires actual Operations inspection and independent approvals');
 perform pg_temp.execution_denied(format(
    'select public.construction_quality_command(%L,%L,''stage_clear'',%L)',
    org,c,jsonb_build_object('stage_id',qc_stage,
      'notes','Duplicate certificate must not issue')),
    'stage certificate is immutable and cannot be issued twice');

 perform pg_temp.execution_assert((select snapshot=doc from public.execution_plan_revisions where id=r),'progress preserves approved plan snapshot');
 perform public.operations_plan(org,'revise',jsonb_build_object('id',p,'version',2));
 perform pg_temp.execution_assert((select count(*)=2 from public.execution_plan_revisions where plan_id=p),'plan revision preserves predecessor');
 select id into vendor from public.vendors where organization_id=org and status='active' order by id limit 1;
 perform public.operations_save(org,'vendor_execution_profiles',jsonb_build_object('vendor_id',vendor,'specialization','Installation'));
 wo=public.operations_work_order(org,'create',jsonb_build_object('plan_id',p,'vendor_id',vendor,'title','Installation','scope','Install project units','unit','hour','quantity','10','agreed_amount','1000'));
 perform public.operations_work_order(org,'issue',jsonb_build_object('id',wo,'version',1));
 wm=public.operations_work_order(org,'measure',jsonb_build_object('id',wo,'version',2,'quantity','4','note','Four measured hours'));
 perform public.operations_work_order(org,'verify',jsonb_build_object('id',wm,'version',1,'reason','Quantity checked'));
 perform public.operations_work_order(org,'certify',jsonb_build_object('id',wm,'version',2,'reason','Accepted measured work'));
 perform pg_temp.execution_assert((select amount='400' from public.work_measurement_costs where measurement_id=wm),'certified measurement carries proportional exact cost');
 perform pg_temp.execution_denied(format('select public.operations_work_order(%L,''measure'',%L)',org,jsonb_build_object('id',wo,'version',3,'quantity','7','note','Excess measurement')),'measurement cannot exceed remaining work');
 perform pg_temp.execution_denied(format('select public.operations_work_order(%L,''cancel'',%L)',org,jsonb_build_object('id',wo,'version',3,'reason','Cancel certified work')),'certified work prevents cancellation');
 perform public.operations_work_order(org,'progress',jsonb_build_object('id',wo,'version',3,'completed_percentage','100','accepted_percentage','100'));
 perform pg_temp.execution_assert((select status='completed' from public.subcontractor_work_orders where id=wo),'accepted subcontract progress completes work');
 template=public.operations_save(org,'inspection_templates','{"name":"Final acceptance","is_final":true,"mandatory":true,"checklist":[{"key":"finish","label":"Finish checked","required":true}]}');
 i=public.operations_inspection(org,'create',jsonb_build_object('project_id',c,'template_id',template,'inspector_id',auth.uid()));
 perform public.operations_inspection(org,'approve',jsonb_build_object('id',i,'version',1,'status','failed','results','[{"key":"finish","result":"fail","note":"Scratch"}]'::jsonb));
 s=public.operations_snag(org,'create',jsonb_build_object('project_id',c,'inspection_id',i,'title','Scratch','priority','critical'));
 perform public.operations_snag(org,'assign',jsonb_build_object('id',s,'version',1,'assigned_to',auth.uid()));
 perform public.operations_snag(org,'transition',jsonb_build_object('id',s,'version',2,'status','in_progress'));
 perform pg_temp.execution_denied(format('select public.operations_snag(%L,''transition'',%L)',org,jsonb_build_object('id',s,'version',3,'status','ready_for_review')),'snag review requires resolution evidence');
 perform public.operations_snag(org,'transition',jsonb_build_object('id',s,'version',3,'status','ready_for_review','resolution','Panel repaired'));
 perform public.operations_snag(org,'transition',jsonb_build_object('id',s,'version',4,'status','verified','verification','Repair checked'));
 perform public.operations_snag(org,'transition',jsonb_build_object('id',s,'version',5,'status','closed','verification','Accepted repair'));
 perform pg_temp.execution_assert((select count(*)=6 from public.project_execution_events where entity_id=s),'snag lifecycle appends six history events');
 i2=public.operations_inspection(org,'create',jsonb_build_object('project_id',c,'template_id',template,'predecessor_id',i,'inspector_id',auth.uid()));
 perform public.operations_plan(org,'status',jsonb_build_object('id',p,'version',3,'status','punch_list'));
 ht=public.operations_save(org,'handover_templates','{"name":"Handover","checklist":[{"key":"keys","label":"Keys delivered","required":true}]}');
 h=public.operations_handover(org,'create',jsonb_build_object('plan_id',p,'template_id',ht));
 perform pg_temp.execution_denied(format('select public.operations_handover(%L,''approve'',%L)',org,jsonb_build_object('id',h,'version',1,'results','[{"key":"keys","result":"pass"}]'::jsonb,'materials_review','Stock reconciled','commercial_review','Outstanding reviewed')),'pending final inspection blocks handover');
 perform public.operations_inspection(org,'approve',jsonb_build_object('id',i2,'version',1,'status','passed','results','[{"key":"finish","result":"pass","note":"Repaired"}]'::jsonb));
 perform public.operations_handover(org,'approve',jsonb_build_object('id',h,'version',1,'results','[{"key":"keys","result":"pass"}]'::jsonb,'materials_review','Stock reconciled','commercial_review','Outstanding reviewed','internal_notes','Private staff note','customer_notes','Keys delivered'));
 perform pg_temp.execution_assert((select status='handed_over' from public.execution_plans where id=p),'handover transitions physical plan');
 perform pg_temp.execution_assert((select not(document_snapshot ? 'internal_notes') and document_snapshot->>'notes'='Keys delivered' from public.handover_records where id=h),'handover customer snapshot excludes staff notes');
 perform pg_temp.execution_assert(public.operations_document(org,'handover',h)->>'notes'='Keys delivered' and not(public.operations_document(org,'handover',h)::text like '%Private staff note%'),'handover PDF projection strips internal review notes');
 perform pg_temp.execution_assert(public.operations_document(org,'inspection',i2)->>'result'='passed','final inspection document preserves result');
 perform pg_temp.execution_assert((public.operations_options(org,'project_tasks',c)->'rows'->0->>'label') is not null,'task choices provide a readable label');
 perform pg_temp.execution_denied(format('select public.operations_handover(%L,''approve'',%L)',org,jsonb_build_object('id',h,'version',1,'results','[]'::jsonb)),'duplicate handover cannot finalize twice');
 perform public.operations_plan(org,'status',jsonb_build_object('id',p,'version',5,'status','completed'));
 perform pg_temp.execution_assert((select status='completed' from public.execution_plans where id=p),'operational completion succeeds after approved handover');
end$$;
reset role;
select pg_temp.execution_denied('update public.execution_plan_revisions set snapshot=''{}'' where status=''approved''','approved plan history rejects privileged edits');
select pg_temp.execution_denied('delete from public.project_inspections','inspection history rejects deletion');
select pg_temp.execution_denied('update public.handover_records set internal_notes=''changed'' where status=''approved''','approved handover rejects edits');
rollback;

