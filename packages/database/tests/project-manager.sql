\set ON_ERROR_STOP on
begin;
-- Disposable demo project, transaction always rolls back. Manager updates are
-- deliberately kept separate from previous Phase 7 regression fixtures.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;
 rec uuid;material uuid;record jsonb;item text;kind text;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Demo project unavailable';end if;
 perform set_config('test.manager_project',project::text,true);
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 perform public.project_site_command(org,project,'assign',
  '{"user_id":"33333333-3333-4333-8333-333333333333","role":"site_engineer","active":true}');
 foreach kind in array array['architectural_plan','3d_design','structural_design'] loop
  record=public.project_site_command(org,project,'design_submit',jsonb_build_object('kind',kind,'reference','2026 revision for '||kind));
  perform public.project_site_command(org,project,'design_decide',jsonb_build_object('id',record->>'id','decision','approved','note','Validated'));
 end loop;
 perform public.project_site_command(org,project,'client_approve',
  '{"evidence":"Client confirmed final drawings by project meeting; reference C-108"}');
 perform public.project_site_command(org,project,'execution_start','{}'::jsonb);
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

-- Site engineer enters a real report and cannot perform manager commands.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';project uuid=current_setting('test.manager_project')::uuid;record jsonb;
begin
 record=public.project_site_command(org,project,'report_add',jsonb_build_object(
  'report_date',current_date,'completed_work','Curing and shuttering check',
  'tomorrow_plan','Inspect grid line columns','worker_count',9));
 perform set_config('test.manager_report',record->>'id',true);
 if jsonb_array_length(public.project_site_manager_read(org,project)->'updates')<>2 then
  raise exception 'Site engineer cannot read manager next-day instructions';end if;
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
 record=public.project_site_manager_command(org,project,'report_review',
  jsonb_build_object('report_id',report,'decision','changes_requested',
  'note','Add inspection photos and gridline references'));
 perform public.project_site_manager_command(org,project,'report_review',
  jsonb_build_object('report_id',report,'decision','approved',
  'note','Reviewed revised evidence independently'));
 if jsonb_array_length(public.project_site_manager_read(org,project)->'reviews')<>2
  or jsonb_array_length(public.project_site_read(org,project)->'reports')<>1
 then raise exception 'Manager approval history or original report missing';end if;
 raise notice 'PASS: manager approval/rework decisions append and preserve engineer report';
end $$;
rollback;
