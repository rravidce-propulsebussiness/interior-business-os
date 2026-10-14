\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
set local role authenticated;
\ir site-agreement-helper.sql
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $setup$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;contract uuid;stages jsonb;first_stage uuid;second_stage uuid;
begin
 select id into project from public.projects
 where organization_id=org and code='demo-3bhk';
 perform set_config('test.link_project',project::text,true);
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 perform public.project_site_command(org,project,'assign',
   '{"user_id":"22222222-2222-4222-8222-222222222222","role":"watchman","active":true}'::jsonb);
 contract=pg_temp.site_signed_agreement(org,project);
 perform set_config('test.link_contract',contract::text,true);
 perform public.construction_project_command(org,project,'workflow_create',
  jsonb_build_object('template',jsonb_build_object('industry','construction','version','1.0.0'),
   'floors',jsonb_build_array(jsonb_build_object('code','GROUND','name','Ground')),
   'stages',jsonb_build_array(
     jsonb_build_object('instanceCode','FOUNDATION','templateCode','FOUNDATION',
       'phase','foundation','title','Foundation stage','explanation','Footing reinforcement work',
       'floorCode',null,'dependsOn',jsonb_build_array(),
       'holdPoint','structural','activities',jsonb_build_array('Prepare footing steel'),
       'inspectionTopics',jsonb_build_array('Steel cover')),
     jsonb_build_object('instanceCode','PLINTH','templateCode','PLINTH',
       'phase','plinth','title','Plinth stage','explanation','Ground beam casting stage',
       'floorCode',null,'dependsOn',jsonb_build_array('FOUNDATION'),
       'holdPoint','structural','activities',jsonb_build_array('Cast plinth beam'),
       'inspectionTopics',jsonb_build_array('Beam cover')))));
 select public.construction_project_read(org,project)->'stages' into stages;
 first_stage=(stages->0->>'id')::uuid;
 second_stage=(stages->1->>'id')::uuid;
 perform set_config('test.link_first',first_stage::text,true);
 perform set_config('test.link_second',second_stage::text,true);
end$setup$;

-- Source records below are created only in the disposable regression transaction.
reset role;
do $records$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.link_project')::uuid;
 item uuid;photo uuid;report uuid;check_id uuid;gate_id uuid;
begin
 insert into private.site_reports(organization_id,project_id,report_date,
   completed_work,tomorrow_plan,worker_count,created_by)
 values(org,project,current_date,'Footing steel laid and checked',
   'Prepare shuttering and inspect starter bars',5,
   '11111111-1111-4111-8111-111111111111')
 returning id into report;
 perform set_config('test.link_report',report::text,true);
 insert into private.site_material_needs(organization_id,project_id,
   item,quantity,unit,requested_by)
 values(org,project,'TMT steel',1.5,'tonnes',
   '11111111-1111-4111-8111-111111111111')
 returning id into item;
 perform set_config('test.link_material',item::text,true);
 insert into private.site_media(organization_id,project_id,
   filename,mime,bytes,category,caption,uploaded_by)
 values(org,project,'footing.png','image/png',decode('89504e470d0a1a0a','hex'),
   'site','Footing bars before concrete',
   '11111111-1111-4111-8111-111111111111')
 returning id into photo;
 perform set_config('test.link_photo',photo::text,true);
 insert into private.site_checks(organization_id,project_id,title,created_by)
 values(org,project,'Check steel cover',
   '11111111-1111-4111-8111-111111111111')
 returning id into check_id;
 perform set_config('test.link_check',check_id::text,true);
 insert into private.site_gate(organization_id,project_id,kind,description,created_by)
 values(org,project,'curing','Footing curing at east side',
   '11111111-1111-4111-8111-111111111111')
 returning id into gate_id;
 perform set_config('test.link_round',gate_id::text,true);
end$records$;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

do $owner$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.link_project')::uuid;
 stage uuid=current_setting('test.link_first')::uuid;
 second_stage uuid=current_setting('test.link_second')::uuid;
 contract uuid=current_setting('test.link_contract')::uuid;
 item uuid;record_data jsonb;
begin
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',stage,'kind','material',
     'record_id',current_setting('test.link_material')::uuid));
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',stage,'kind','media',
     'record_id',current_setting('test.link_photo')::uuid));
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',stage,'kind','report',
     'record_id',current_setting('test.link_report')::uuid));
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',stage,'kind','check',
     'record_id',current_setting('test.link_check')::uuid));
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',stage,'kind','curing_round',
     'record_id',current_setting('test.link_round')::uuid));
 select id into item from public.payment_schedule_items
  where organization_id=org and contract_id=contract limit 1;
 if item is null then raise exception 'No active agreement schedule item';end if;
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',stage,'kind','payment','record_id',item,
     'contract_id',contract));
 record_data=public.construction_stage_record_read(org,project);
 if jsonb_array_length(record_data->'links')<>6
    or jsonb_array_length(record_data->'payments')<>1
    or jsonb_array_length(record_data->'options')<1
 then raise exception 'Stage record associations were not projected';end if;
 if record_data->'payments'->0->>'request_number' is not null
 then raise exception 'An unrequested milestone showed an invented payment request';end if;
 if exists(select 1 from public.payment_requests where organization_id=org and contract_id=contract)
 then raise exception 'Stage mapping created payment requests';end if;
 if exists(select 1 from public.payments where organization_id=org and contract_id=contract)
 then raise exception 'Stage mapping manufactured a payment receipt';end if;
 -- Append only reassignment keeps the old event, projects the current stage.
 perform public.construction_stage_record_command(org,project,'link',
   jsonb_build_object('stage_id',second_stage,'kind','material',
      'record_id',current_setting('test.link_material')::uuid));
 if not exists (select 1 from jsonb_array_elements(
      public.construction_stage_record_read(org,project)->'links') entry
      where entry->>'kind'='material' and entry->>'stage_id'=second_stage::text)
 then raise exception 'Latest stage association was not projected';end if;
 begin
  perform public.construction_stage_record_command(org,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'link',
    jsonb_build_object('stage_id',stage,'kind','material',
      'record_id',current_setting('test.link_material')::uuid));
  raise exception 'FAIL: foreign project record accepted';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: canonical site records + payment lines linked with immutable history';
end$owner$;

-- Inspect immutable association history only with privileged disposable fixture role.
reset role;
do $audit$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.link_project')::uuid;
begin
 if (select count(*) from private.construction_stage_record_links
     where organization_id=org and project_id=project and record_kind='material')<>2
 then raise exception 'Previous stage assignment history was lost';end if;
end$audit$;
set local role authenticated;

-- The assigned security role must never see payment amounts or issue links.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $watchman$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid=current_setting('test.link_project')::uuid;
 stage uuid=current_setting('test.link_first')::uuid;
begin
 begin
  perform public.construction_stage_record_command(org,project,'link',
    jsonb_build_object('stage_id',stage,'kind','payment',
     'record_id',gen_random_uuid(),'contract_id',current_setting('test.link_contract')::uuid));
  raise exception 'FAIL: watchman linked a payment';
 exception when insufficient_privilege then null;end;
 if jsonb_array_length(public.construction_stage_record_read(org,project)->'payments')<>0
 then raise exception 'FAIL: watchman saw financial information';end if;
end$watchman$;
rollback;
