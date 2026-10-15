\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
-- Uses seeded disposable Demo Interiors tenant and project; leaves no records.
set local role authenticated;
\ir site-agreement-helper.sql
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;
 design_id uuid;need_id uuid;check_id uuid;agreement_media uuid;contract uuid;
 kind text;
 result jsonb;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Missing seeded project';end if;
 perform set_config('test.project_site_id',project::text,true);
 if not private.has_permission(org,'project.manage') then
   raise exception 'Project owner fixture lacks project.manage grant';
 end if;
 result=public.project_site_command(org,project,'initialize','{}');
 agreement_media=public.project_site_media_put(org,project,'agreement','paper-agreement.pdf',
   'application/pdf',encode(convert_to('%PDF-1.7'||chr(10)||
      'Preloaded paper agreement record for regression','UTF8'),'base64'),
   'Paper agreement reference; record as signed only after authorization');
 perform set_config('test.agreement_media_id',agreement_media::text,true);
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
 -- Approved drawings must not start physical work without a signed agreement.
 begin
   perform public.project_site_command(org,project,'execution_start','{}');
   raise exception 'FAIL: no agreement permitted site work';
 exception when check_violation then null;end;
 contract=pg_temp.site_signed_agreement(org,project,agreement_media);
 if (public.project_agreement_read(org,project)->>'execution_authorized')<>'false'
 then raise exception 'FAIL: signed agreement bypassed recorded advance';end if;
 perform pg_temp.site_record_advance(org,contract);
 if (public.project_agreement_read(org,project)->>'execution_authorized')<>'true'
 then raise exception 'Signed agreement and active schedule not recognized';end if;
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
   jsonb_build_object('report_date',current_date::text,'completed_work','Site clearing and marking','tomorrow_plan','Footing gridline inspection','worker_count',8,'tomorrow_workers',12));
 if (public.project_site_read(org,project)->'reports'->0->>'tomorrow_workers') <> '12' then
   raise exception 'Tomorrow labour requirement was not saved separately';
 end if;
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

-- An assigned architect can read design drawings, but never agreement PDF bytes.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.project_site_id')::uuid;
 agreement_media uuid=current_setting('test.agreement_media_id')::uuid;
begin
 if exists(select 1 from jsonb_array_elements(
    public.project_site_read(org,project)->'media') row
    where row->>'category'='agreement')
 then raise exception 'FAIL: architect can list agreement document';end if;
 begin
   perform public.project_site_media_get(org,project,agreement_media);
   raise exception 'FAIL: architect can download signed agreement';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: commercial agreement metadata and bytes isolated from architectural role';
end$$;

-- Watchman can record gate events only, not change design/client approval.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $watchman$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; project uuid=current_setting('test.project_site_id')::uuid;
 curing_photo uuid;
 png text=encode(decode('89504e470d0a1a0a','hex'),'base64');
begin
 begin
   perform public.project_site_media_put(org,project,'curing','curing.png',
     'image/png',png,'Footing curing at 06:00 ground level');
   raise exception 'FAIL: watchman uploaded curing photo without a curing round';
 exception when check_violation then null; end;
 perform public.project_site_command(org,project,'gate_add',
   '{"kind":"curing","description":"Footing curing morning round","notes":"06:00, east grid"}');
 curing_photo=public.project_site_media_put(org,project,'curing','curing.png',
   'image/png',png,'Footing curing at 06:00 ground level');
 if not exists (select 1 from jsonb_array_elements(
   public.project_site_read(org,project)->'media') m where m->>'id'=curing_photo::text)
 then raise exception 'FAIL: curing photo missing from watchman private gallery'; end if;
 if public.project_site_media_get(org,project,curing_photo)->>'mime' <> 'image/png'
 then raise exception 'FAIL: watchman cannot read own curing photo'; end if;
 begin
   perform public.project_site_media_put(org,project,'site','work.png',
     'image/png',png,'Non curing project photo');
   raise exception 'FAIL: watchman uploaded unrelated site photo';
 exception when insufficient_privilege then null; end;
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
 raise notice 'PASS: watchman restricted to gate events and own curing photos';
end $watchman$;
rollback;
