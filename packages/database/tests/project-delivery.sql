\set ON_ERROR_STOP on
begin;
-- Uses seeded disposable Demo Interiors tenant and project; leaves no records.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=private.seed_uuid('business-os:demo:3bhk');
 design_id uuid;need_id uuid;check_id uuid;
 kind text;
 result jsonb;
begin
 if not private.has_permission(org,'project.manage') then
   raise exception 'Project owner fixture lacks project.manage grant';
 end if;
 if not private.entitled(org,'projects') then
   raise exception 'Fixture requires Projects entitlement';
 end if;
 result=public.project_site_command(org,project,'initialize','{}');
 if (public.project_site_read(org,project)->>'stage') is distinct from 'design' then
   raise exception 'Project initialization did not enter design stage';
 end if;
 begin
   perform public.project_site_command(org,project,'execution_start','{}');
   raise exception 'FAIL: site execution started without client approval';
 exception when insufficient_privilege then null;
 end;
 perform public.project_site_command(org,project,'assign',jsonb_build_object('user_id','33333333-3333-4333-8333-333333333333','role','architect','active',true));
 perform public.project_site_command(org,project,'assign',jsonb_build_object('user_id','22222222-2222-4222-8222-222222222222','role','watchman','active',true));
 foreach kind in array array['architectural_plan','3d_design','structural_design'] loop
   result=public.project_site_command(org,project,'design_submit',jsonb_build_object('kind',kind,'reference','Approved reference drawing '||kind));
   design_id=(result->>'id')::uuid;
   perform public.project_site_command(org,project,'design_decide',jsonb_build_object('id',design_id,'decision','approved','note','Reviewed'));
 end loop;
 begin
   perform public.project_site_command(org,project,'client_approve',jsonb_build_object('evidence',''));
   raise exception 'FAIL: client approval evidence not required';
 exception when invalid_parameter_value then null;
 end;
 perform public.project_site_command(org,project,'client_approve',
   jsonb_build_object('evidence','Client approved by email on 2026-10-10, owner verified final revisions'));
 perform public.project_site_command(org,project,'execution_start','{}');
 if public.project_site_read(org,project)->>'stage' is distinct from 'execution' then
   raise exception 'Approved designs did not unlock execution';
 end if;
 result=public.project_site_command(org,project,'material_add',
   '{"item":"Cement","quantity":100,"unit":"bags","notes":"Site marking"}');
 need_id=(result->>'id')::uuid;
 begin
   perform public.project_site_command(org,project,'material_update',
     jsonb_build_object('id',need_id,'status','received','source','marketplace','vendor_reference','Supplier-001'));
   raise exception 'FAIL: unordered material receipt permitted';
 exception when serialization_failure then null;
 end;
 perform public.project_site_command(org,project,'material_update',
   jsonb_build_object('id',need_id,'status','approved','source','undecided','vendor_reference',''));
 perform public.project_site_command(org,project,'material_update',
   jsonb_build_object('id',need_id,'status','ordered','source','outside','vendor_reference','PO-TEST-001'));
 result=public.project_site_command(org,project,'check_add',
   '{"title":"Column gridline level check","notes":"Compare plan"}');
 check_id=(result->>'id')::uuid;
 perform public.project_site_command(org,project,'check_update',
   jsonb_build_object('id',check_id,'status','passed','notes','Verified'));
 perform public.project_site_command(org,project,'report_add',
   '{"report_date":"2026-10-10","completed_work":"Site clearing and marking","tomorrow_plan":"Footing gridline inspection","worker_count":8}');
 begin
   perform public.project_site_command(org,project,'handover','{}');
   raise exception 'FAIL: handover without formal inspections allowed';
 exception when check_violation then null;
 end;
 if (public.project_site_read(org,project)->'materials'->0->>'status') is distinct from 'ordered' then
   raise exception 'Material status history mismatch';
 end if;
 raise notice 'PASS: project delivery gate, designs, staff-recorded approval, material transitions and site checks';
end $$;

-- Watchman can record gate events only, not change design/client approval.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; project uuid=private.seed_uuid('business-os:demo:3bhk');
begin
 perform public.project_site_command(org,project,'gate_add',
  '{"kind":"material_delivery","description":"Cement truck arrived","notes":"Check delivery against PO"}');
 begin
  perform public.project_site_command(org,project,'material_add',
   '{"item":"Steel","quantity":1,"unit":"tonnes"}');
  raise exception 'FAIL: watchman obtained purchasing privilege';
 exception when insufficient_privilege then null;
 end;
 if jsonb_array_length(public.project_site_read(org,project)->'designs')<>0
    or jsonb_array_length(public.project_site_read(org,project)->'materials')<>0 then
   raise exception 'FAIL: watchman can read restricted data';
 end if;
 raise notice 'PASS: watchman restricted to gate records';
end $$;
rollback;
