\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
update public.projects set industry_id=(select id from public.industries where key='construction')
where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' and code='demo-3bhk';
-- Disposable seed fixture, all writes rolled back.
set local role authenticated;
\ir site-agreement-helper.sql
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid;
 first_role uuid;
 second_role uuid;
 wf uuid; contract uuid; quote_hash text;
 read_data jsonb;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 if project is null then raise exception 'Missing project fixture';end if;
 perform set_config('test.construction_project',project::text,true);
 -- Two active roles for one person must coexist.
 first_role=(public.construction_project_command(org,project,'role_assign',
  '{"user_id":"33333333-3333-4333-8333-333333333333","role":"architect"}'))->>'id';
 second_role=(public.construction_project_command(org,project,'role_assign',
  '{"user_id":"33333333-3333-4333-8333-333333333333","role":"quality_inspector"}'))->>'id';
 if first_role=second_role then raise exception 'Distinct role assignments required';end if;
 select public.construction_project_read(org,project) into read_data;
 if jsonb_array_length(read_data->'roles')<>2 then raise exception 'Expected two team roles';end if;
 -- Not an open-ended or client identity granting endpoint.
 begin
   perform public.construction_project_command(org,project,'role_assign',
    '{"user_id":"33333333-3333-4333-8333-333333333333","role":"client"}');
   raise exception 'FAIL: client was added as an employee';
 exception when invalid_parameter_value then null;
 end;
 -- A deliberately small stage sample proves persistent dependency and QC data.
 -- This stage snapshot is issued only through the accepted quotation contract.
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 contract=pg_temp.site_signed_agreement(org,project);
 select md5(coalesce(string_agg(qi.id::text||chr(31)||
   coalesce(qi.snapshot->>'name','')||chr(31)||qi.description||chr(31)||
   case when qi.optional then '1' else '0' end,chr(30) order by qi.id),''))
 into quote_hash from public.quotation_items qi
 where qi.organization_id=org and qi.revision_id=(
   select revision_id from public.contracts where id=contract);
 wf=(public.project_quote_timeline_create(org,contract,
  jsonb_build_object('industry','construction','quote_hash',quote_hash,
   'template',jsonb_build_object('industry','construction','version','1.0.0'),
   'zones',jsonb_build_array(jsonb_build_object('code','GROUND','name','Ground floor')),
   'stages',jsonb_build_array(
     jsonb_build_object('instanceCode','DESIGN','templateCode','DESIGN','phase','design',
       'floorCode',null,'title','Design coordination','explanation','Prepare approved drawings',
       'holdPoint','client_design','dependsOn',jsonb_build_array(),
       'activities',jsonb_build_array('Prepare architectural design'),
       'inspectionTopics',jsonb_build_array('Approved revisions')),
     jsonb_build_object('instanceCode','FOUNDATION','templateCode','FOUNDATION','phase','foundation',
       'floorCode',null,'title','Foundation works','explanation','Inspect work before pour',
       'holdPoint','structural','dependsOn',jsonb_build_array('DESIGN'),
       'activities',jsonb_build_array('Reinforcement and concrete work'),
       'inspectionTopics',jsonb_build_array('Pre-pour structural clearance'))))) )->>'workflow_id';
 if wf is null then raise exception 'Missing workflow';end if;
 select public.construction_project_read(org,project) into read_data;
 if jsonb_array_length(read_data->'stages')<>2
    or not exists(select 1 from jsonb_array_elements(read_data->'stages') stage
       where stage->>'instance_code'='FOUNDATION'
          and stage->'dependencies' @> '["DESIGN"]'::jsonb)
 then raise exception 'Stage dependencies not stored';end if;
 if exists(select 1 from jsonb_array_elements(read_data->'stages') stage
    where stage->>'status'<>'not_started')
 then raise exception 'Planning created fictitious completion';end if;
 -- The old direct workflow creation path must be rejected, even for the owner.
 -- Cannot rewrite an existing frozen planning definition.
 begin
   perform public.construction_project_command(org,project,'workflow_create',
      '{"template":{"industry":"construction","version":"1.0.0"},"floors":[{"code":"GROUND","name":"Ground"}],"stages":[{"instanceCode":"DESIGN","templateCode":"DESIGN","phase":"design","floorCode":null,"title":"Design coordination","explanation":"Frozen scope","holdPoint":"client_design","dependsOn":[],"activities":["Prepare drawings"],"inspectionTopics":[]}]}');
   raise exception 'FAIL: duplicate workflow accepted';
 exception when insufficient_privilege then null;
 end;
 -- Immutable role event log plus optimistic deactivation.
 perform public.construction_project_command(org,project,'role_deactivate',
   jsonb_build_object('id',first_role,'version',1));
 select public.construction_project_read(org,project) into read_data;
 if (select count(*) from jsonb_array_elements(read_data->'roles') r
     where r->>'user_id'='33333333-3333-4333-8333-333333333333'
       and r->>'active'='true')<>1
 then raise exception 'Deactivation removed other active role';end if;
 begin
   perform public.construction_project_command(org,project,'role_deactivate',
      jsonb_build_object('id',first_role,'version',1));
   raise exception 'FAIL: stale role version accepted';
 exception when serialization_failure then null;
 end;
 raise notice 'PASS: scoped multi-role records, dependency persistence, version guards';
end$$;

-- Read-only restrictions: one watchman sees no construction engineering stage.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; project uuid=current_setting('test.construction_project')::uuid;
begin
 perform public.construction_project_command(org,project,'role_assign',
  '{"user_id":"22222222-2222-4222-8222-222222222222","role":"watchman"}');
end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$
declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd'; project uuid=current_setting('test.construction_project')::uuid;
begin
 if public.construction_project_read(org,project)->>'can_manage'<>'false'
 then raise exception 'FAIL: watchman management permission is not explicitly false';end if;
 if jsonb_array_length(public.construction_project_read(org,project)->'stages')<>0
 then raise exception 'FAIL: watchman can read engineering stages';end if;
 begin
   perform public.construction_project_command(org,project,'role_assign',
     '{"user_id":"22222222-2222-4222-8222-222222222222","role":"accounts_officer"}');
   raise exception 'FAIL: watchman can elevate own privileges';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.construction_project_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,project);
   raise exception 'FAIL: foreign tenant project was readable';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: watchman engineering visibility and tenant isolation';
end$$;
rollback;
