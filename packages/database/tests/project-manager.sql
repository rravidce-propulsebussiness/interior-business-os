\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
-- Disposable demo project, transaction always rolls back. Manager updates are
-- deliberately kept separate from previous Phase 7 regression fixtures.
set local role authenticated;
\ir site-agreement-helper.sql
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;
 rec uuid;material uuid;record jsonb;item text;kind text;agreement_media uuid;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Demo project unavailable';end if;
 perform set_config('test.manager_project',project::text,true);
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 agreement_media=public.project_site_media_put(org,project,'agreement','manager-agreement.pdf',
   'application/pdf',encode(convert_to('%PDF-1.7'||chr(10)||
      'Manager test signed agreement fixture','UTF8'),'base64'),
   'Private signed paper copy test');
 perform public.project_site_command(org,project,'assign',
  '{"user_id":"33333333-3333-4333-8333-333333333333","role":"site_engineer","active":true}');
 foreach kind in array array['architectural_plan','3d_design','structural_design'] loop
  record=public.project_site_command(org,project,'design_submit',jsonb_build_object('kind',kind,'reference','2026 revision for '||kind));
  perform public.project_site_command(org,project,'design_decide',jsonb_build_object('id',record->>'id','decision','approved','note','Validated'));
 end loop;
 perform public.project_site_command(org,project,'client_approve',
  '{"evidence":"Client confirmed final drawings by project meeting; reference C-108"}');
 begin
  perform public.project_site_command(org,project,'execution_start','{}'::jsonb);
  raise exception 'FAIL: site execution without contract evidence';
 exception when check_violation then null;end;
 perform pg_temp.site_signed_agreement(org,project,agreement_media);
 perform public.project_site_command(org,project,'execution_start','{}'::jsonb);
 record=public.construction_project_command(org,project,'workflow_create',
  jsonb_build_object('template',jsonb_build_object('industry','construction','version','1.0.0'),
    'floors',jsonb_build_array(jsonb_build_object('code','GROUND','name','Ground')),
    'stages',jsonb_build_array(jsonb_build_object(
       'instanceCode','FOUNDATION','templateCode','FOUNDATION','phase','foundation',
       'floorCode',null,'title','Footing and steel installation',
       'explanation','Inspect footing for final acceptance',
       'holdPoint','structural','dependsOn','[]'::jsonb,
       'activities',jsonb_build_array('Measure gridlines and foundation'),
       'inspectionTopics',jsonb_build_array('Level and cover')))));
 perform set_config('test.manager_stage',(
   select stage->>'id' from jsonb_array_elements(public.construction_project_read(org,project)->'stages') stage
     where stage->>'instance_code'='FOUNDATION'),true);
 perform public.construction_project_command(org,project,'role_assign',
   '{"user_id":"22222222-2222-4222-8222-222222222222","role":"watchman"}'::jsonb);

 record=public.project_site_manager_command(org,project,'manager_update',jsonb_build_object(
  'report_date',current_date,'health','at_risk',
  'summary','Gridline marking completed and cement supply pending',
  'tomorrow_priorities','Arrange footing inspection and delivery',
  'decisions_needed','Approve manual cement request',
  'materials_notes','Confirm quantity by site measurement',
  'site_instructions','Engineer to submit photos with report'));
 perform public.project_site_manager_command(org,project,'manager_update',jsonb_build_object(
  'report_date',current_date,'health','on_track',
  'summary','Manager recorded second progress update',
  'tomorrow_priorities','Inspect steel placement tomorrow'));
 if jsonb_array_length(public.project_site_manager_read(org,project)->'updates')<>2 then
  raise exception 'Manager updates not append-only'; end if;
 record=public.project_site_command(org,project,'material_add',
  '{"item":"Cement","quantity":100,"unit":"bags","notes":"Measured manually"}');
 material=(record->>'id')::uuid;
 perform set_config('test.manager_material',material::text,true);
 perform public.project_site_manager_command(org,project,'material_quantity_correct',
  jsonb_build_object('id',material,'quantity',115.5,'reason','Updated manual site measure for footing'));
 if (public.project_site_read(org,project)->'materials'->0->>'quantity')::numeric<>115.5
   or (public.project_site_manager_read(org,project)->'quantity_revisions'->0->>'old_quantity')::numeric<>100
 then raise exception 'Manual material correction history lost';end if;
 perform public.project_site_command(org,project,'material_update',
  jsonb_build_object('id',material,'status','approved','source','undecided','vendor_reference',''));
 perform public.project_site_manager_command(org,project,'material_quantity_correct',
  jsonb_build_object('id',material,'quantity',120,'reason','Recount before purchase'));
 perform public.project_site_command(org,project,'material_update',
  jsonb_build_object('id',material,'status','ordered','source','outside','vendor_reference','PO-001'));
 begin
  perform public.project_site_manager_command(org,project,'material_quantity_correct',
    jsonb_build_object('id',material,'quantity',140,'reason','Cannot change ordered quantity'));
  raise exception 'FAIL: manager altered ordered material';
 exception when check_violation then null;end;
 raise notice 'PASS: manager creates append-only updates and preserves manual quantity history';
end $$;

-- A direct state transition must not bypass current construction stage
-- certifications, even when invoked by a database administrator. The original
-- manager UI does not decide readiness; its database persistence does.
set local role postgres;
do $handover_test$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.manager_project')::uuid;
 stage_id uuid=current_setting('test.manager_stage')::uuid;
begin
 if private.construction_stage_chain_current(org,project,stage_id)
 then raise exception 'FAIL: uncertified footing chain marked current';end if;
 begin
   update private.site_state set stage='handover'
     where organization_id=org and project_id=project;
   raise exception 'FAIL: direct handover bypassed construction stage certificates';
 exception when check_violation then null;
 end;
 if exists(select 1 from private.site_state where organization_id=org
    and project_id=project and stage='handover')
 then raise exception 'FAIL: handover status changed despite failed clearance';end if;
 raise notice 'PASS: handover trigger requires current floor-stage certificates';
end $handover_test$;
set local role authenticated;

-- Site engineer enters a real report and cannot perform manager commands.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';project uuid=current_setting('test.manager_project')::uuid;record jsonb;
begin
 record=public.project_site_command(org,project,'report_add',jsonb_build_object(
  'report_date',current_date,'completed_work','Curing and shuttering check',
  'tomorrow_plan','Inspect grid line columns','worker_count',9));
 perform set_config('test.manager_report',record->>'id',true);
 -- Engineer proposes tomorrow's actual work and labor, but does not authorize it.
 record=jsonb_build_object('id',public.construction_tomorrow_command(org,project,'submit',
    jsonb_build_object(
      'stage_id',current_setting('test.manager_stage')::uuid,
      'work_date',current_date+1,
      'work_summary','Bar bending, placement and footing pre-pour checks',
      'labor',jsonb_build_array(
         jsonb_build_object('trade','Bar benders','workers',4),
         jsonb_build_object('trade','Helpers','workers',3)),
      'materials',jsonb_build_array(jsonb_build_object(
         'id',current_setting('test.manager_material')::uuid,'quantity',14)),
      'instructions','Check steel cover and site safety before pouring')));
 perform set_config('test.tomorrow_plan',record->>'id',true);
 if (public.construction_tomorrow_read(org,project)->'plans'->0->>'status')<>'submitted'
 then raise exception 'FAIL: engineer tomorrow proposal not pending manager review';end if;
 begin
   perform public.construction_tomorrow_command(org,project,'review',
      jsonb_build_object('plan_id',current_setting('test.tomorrow_plan')::uuid,
       'decision','approved','reason','Engineer cannot self-approve work'));
   raise exception 'FAIL: site engineer approved own next-day labor plan';
 exception when insufficient_privilege then null;end;

 if jsonb_array_length(public.project_site_manager_read(org,project)->'updates')<>2 then
  raise exception 'Site engineer cannot read manager next-day instructions';end if;
 if jsonb_array_length(public.project_site_my_projects(org))<1 then
   raise exception 'Assigned engineer cannot discover the project';end if;
 begin
   perform public.project_site_manager_command(org,project,'manager_update',
    jsonb_build_object('report_date',current_date,'health','on_track',
    'summary','Engineer attempts manager report','tomorrow_priorities','Engineer cannot publish'));
   raise exception 'FAIL: engineer gained manager access';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: engineer can file site update and read manager directions, not approve';
end $$;

-- Owner reviews the engineer report without rewriting the original report.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';project uuid=current_setting('test.manager_project')::uuid;report uuid=current_setting('test.manager_report')::uuid;record jsonb;
begin

 if (public.construction_tomorrow_read(org,project)->'plans'->0->>'status')<>'submitted'
 then raise exception 'FAIL: manager cannot see engineer labor proposal';end if;
 perform public.construction_tomorrow_command(org,project,'review',
    jsonb_build_object('plan_id',current_setting('test.tomorrow_plan')::uuid,
       'decision','approved','reason','Approved steel fixing crew and measured existing steel need'));
 if (select plan->>'status' from jsonb_array_elements(
    public.construction_tomorrow_read(org,project)->'plans') plan
    where plan->>'id'=current_setting('test.tomorrow_plan'))<>'approved'
 then raise exception 'FAIL: approved plan has not been published to assigned field staff';end if;
 -- A revised next-day plan supersedes the previous approval without mutating
 -- yesterday's decisions or creating a purchase order.
 record=jsonb_build_object('id',public.construction_tomorrow_command(org,project,'submit',
   jsonb_build_object(
    'stage_id',current_setting('test.manager_stage')::uuid,
    'work_date',current_date+1,
    'work_summary','Revised bar bending with additional steel cover checks',
    'labor',jsonb_build_array(jsonb_build_object('trade','Bar benders','workers',5)),
    'materials',jsonb_build_array(jsonb_build_object(
      'id',current_setting('test.manager_material')::uuid,'quantity',12)),
    'instructions','Engineer reviewed change to tomorrow bar bending preparation')));
 if (select plan->>'status' from jsonb_array_elements(
    public.construction_tomorrow_read(org,project)->'plans') plan
    where plan->>'id'=current_setting('test.tomorrow_plan'))<>'superseded'
 then raise exception 'FAIL: old approved manpower plan remained current after revision';end if;
 begin
    perform public.construction_tomorrow_command(org,project,'review',
      jsonb_build_object('plan_id',current_setting('test.tomorrow_plan')::uuid,
        'decision','approved','reason','Must not reapprove previous workforce revision'));
    raise exception 'FAIL: superseded plan was approved';
 exception when check_violation then null;end;
 perform public.construction_tomorrow_command(org,project,'review',
   jsonb_build_object('plan_id',record->>'id',
     'decision','approved','reason','Approved revised steel cover plan with five bar benders'));
 -- Read-only queue joins ONLY current, manager-approved tomorrow plans
 -- to existing material requests without creating a supplier PO or receipt.
 if (select item->>'readiness' from jsonb_array_elements(
    public.construction_procurement_watch(org,project)->'materials') item
    where item->>'material_id'=current_setting('test.manager_material'))<>'delivery_pending'
 then raise exception 'FAIL: ordered steel/cement was not shown awaiting actual delivery';end if;
 if (select item->>'vendor_reference' from jsonb_array_elements(
    public.construction_procurement_watch(org,project)->'materials') item
    where item->>'material_id'=current_setting('test.manager_material'))<>'PO-001'
 then raise exception 'FAIL: procurement watch invented or lost canonical PO reference';end if;
 if (public.construction_procurement_watch(org,project)->>'can_update')<>'true'
 then raise exception 'FAIL: authorized project owner cannot act on procurement queue';end if;
 -- The multi-role procurement projection can be read by an explicitly
 -- assigned staff member, but the legacy material_update write still
 -- requires its own site_team role. No permission upgrade by inference.
 perform public.construction_project_command(org,project,'role_assign',
   '{"user_id":"33333333-3333-4333-8333-333333333333","role":"procurement"}'::jsonb);
 perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
 if jsonb_array_length(public.construction_procurement_watch(org,project)->'materials')<>1
   or (public.construction_procurement_watch(org,project)->>'can_update')<>'false'
 then raise exception 'FAIL: scoped procurement viewer gained legacy ordering powers';end if;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);



 begin
   perform public.construction_tomorrow_command(org,project,'submit',
      jsonb_build_object('stage_id',current_setting('test.manager_stage')::uuid,
        'work_date',current_date+1,'work_summary','Invalid material from another company',
        'labor',jsonb_build_array(jsonb_build_object('trade','Helpers','workers',2)),
        'materials',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'quantity',4)),
        'instructions','Must reject material references outside this project'));
   raise exception 'FAIL: cross-project material reference accepted';
 exception when insufficient_privilege then null;end;
 record=public.project_site_manager_command(org,project,'report_review',
  jsonb_build_object('report_id',report,'decision','changes_requested',
  'note','Add inspection photos and gridline references'));
 begin
  perform public.construction_client_manage(org,project,'report_publish',
    jsonb_build_object('report_id',report));
  raise exception 'FAIL: report published without latest manager approval';
 exception when check_violation then null;end;
 perform public.project_site_manager_command(org,project,'report_review',
  jsonb_build_object('report_id',report,'decision','approved',
  'note','Reviewed revised evidence independently'));
 if jsonb_array_length(public.project_site_manager_read(org,project)->'reviews')<>2
  or jsonb_array_length(public.project_site_read(org,project)->'reports')<>1
 then raise exception 'Manager approval history or original report missing';end if;
 perform public.construction_field_command(org,project,'report_link',jsonb_build_object(
    'stage_id',current_setting('test.manager_stage')::uuid,
    'report_id',report));
 if (select item->>'tomorrow_plan' from jsonb_array_elements(
     public.construction_field_read(org,project)->'stage_reports') item
     where item->>'report_id'=report::text)<> 'Inspect grid line columns'
 then raise exception 'FAIL: stage lost canonical tomorrow plan reference';end if;
 record=public.construction_client_manage(org,project,'share_create','{}'::jsonb);
 perform set_config('test.client_token',record->>'token',true);
 perform set_config('test.client_share',record->>'share_id',true);
 perform public.construction_client_manage(org,project,'report_publish',
   jsonb_build_object('report_id',report));
 if (select candidate->>'published' from jsonb_array_elements(
    public.construction_client_manage_read(org,project)->'reports') candidate
    where candidate->>'id'=report::text)<>'true'
 then raise exception 'FAIL: approved report not marked published';end if;

 raise notice 'PASS: manager approval/rework decisions append and preserve engineer report';
end $$;

-- Public capability exposes only manager-approved and explicitly published
-- daily report content, not private staff updates, financial data or media.
set local role anon;
do $$
declare projection jsonb;
begin
 projection=public.construction_client_view(current_setting('test.client_token'));
 if jsonb_array_length(projection->'updates')<>1
   or projection->'updates'->0->>'tomorrow'<>'Inspect grid line columns'
 then raise exception 'FAIL: client projection does not match approved daily report';end if;
 if projection ? 'contract' or projection ? 'payments' or projection ? 'inspections'
   or projection::text like '%Private staff note%'
   or projection::text like '%Approve manual cement%'
 then raise exception 'FAIL: client projection leaked sensitive staff or finance fields';end if;
 if jsonb_array_length(projection->'stages')<>1
 then raise exception 'FAIL: client-safe stage list missing';end if;
 raise notice 'PASS: anonymous customer projection contains only approved and published site update';
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.manager_project')::uuid;
 report uuid=current_setting('test.manager_report')::uuid;
begin
 perform public.construction_client_manage(org,project,'report_unpublish',
   jsonb_build_object('report_id',report));
end$$;
set local role anon;
do $$
declare projection jsonb;
begin
 projection=public.construction_client_view(current_setting('test.client_token'));
 if jsonb_array_length(projection->'updates')<>0
 then raise exception 'FAIL: unpublished daily report still visible';end if;
 raise notice 'PASS: unpublish immediately removes daily customer report';
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.manager_project')::uuid;
begin
 perform public.construction_client_manage(org,project,'share_revoke',
   jsonb_build_object('share_id',current_setting('test.client_share')::uuid));
end$$;
set local role anon;
do $$
begin
 begin
  perform public.construction_client_view(current_setting('test.client_token'));
  raise exception 'FAIL: revoked customer capability still works';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: revoked project progress link no longer works';
end$$;
set local role authenticated;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.manager_project')::uuid;
begin

 if private.site_is_manager(org,project)
    or private.site_allowed(org,project,array['manager'])
 then raise exception 'FAIL: restricted construction role gained legacy site manager permissions';end if;
 begin
   perform public.construction_procurement_watch(org,project);
   raise exception 'FAIL: watchman accessed internal approved procurement forecast';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_tomorrow_read(org,project);
   raise exception 'FAIL: watchman can read detailed labour plan';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_tomorrow_command(org,project,'submit',
     jsonb_build_object('stage_id',current_setting('test.manager_stage')::uuid,
       'work_date',current_date+1,'work_summary','Fake watchman plan',
       'labor',jsonb_build_array(jsonb_build_object('trade','Helpers','workers',2)),
       'materials','[]'::jsonb,'instructions','Unapproved watcher instruction'));
   raise exception 'FAIL: watchman can create site work plan';
 exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.construction_field_read(org,project)->'stage_reports')<>0
 then raise exception 'FAIL: watchman obtained engineers daily reports';end if;
 begin
   perform public.construction_field_command(org,project,'report_link',jsonb_build_object(
      'stage_id',current_setting('test.manager_stage')::uuid,
      'report_id',current_setting('test.manager_report')::uuid));
   raise exception 'FAIL: watchman can attach engineering daily report';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_field_command(org,project,'curing_verify',
     jsonb_build_object('observation_id',gen_random_uuid(),'decision','verified',
       'reason','Watchman must not approve independent curing verification'));
   raise exception 'FAIL: watchman authorized their own curing verification';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_payment_read(org,project);
   raise exception 'FAIL: watchman accessed stage-linked contract payment amounts';
 exception when insufficient_privilege then null;end;
 begin
   perform public.construction_payment_command(org,project,'stage_link',jsonb_build_object(
      'item_id',gen_random_uuid(),'stage_id',current_setting('test.manager_stage')::uuid));
   raise exception 'FAIL: watchman controlled stage-payment bindings';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: watchman cannot read engineers tomorrow plan or link it';
end$$;
rollback;
