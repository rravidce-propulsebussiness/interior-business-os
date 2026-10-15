\set ON_ERROR_STOP on
begin;
\ir site-agreement-quotation-fixture.sql
-- Fixture setup is deliberately privileged, before the authenticated role.
update public.projects set industry_id=(
  select id from public.industries where key='construction')
where organization_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  and code='demo-3bhk';
set local role authenticated;
\ir site-agreement-helper.sql
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $quoted_plan$
declare
 org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 project uuid; contract uuid; industry text; hash text;
 created jsonb; again jsonb; stage uuid; quoted_scope uuid; edit jsonb;
begin
 select id into project from public.projects where organization_id=org and code='demo-3bhk';
 perform public.project_site_command(org,project,'initialize','{}'::jsonb);
 contract=pg_temp.site_signed_agreement(org,project);
 select i.key into industry from public.projects p
  join public.industries i on i.id=p.industry_id
  where p.id=project;
 if industry<>'construction' then raise exception 'Fixture industry incorrect';end if;
 select md5(coalesce(string_agg(qi.id::text||chr(31)||coalesce(qi.snapshot->>'name','')||chr(31)||qi.description||chr(31)||case when qi.optional then '1' else '0' end,
    chr(30) order by qi.id),'')) into hash from public.quotation_items qi
    join public.contracts c on c.revision_id=qi.revision_id
    where c.id=contract and qi.organization_id=org;
 created=public.project_quote_timeline_create(org,contract,jsonb_build_object(
   'industry',industry,'quote_hash',hash,
   'template',jsonb_build_object('industry',industry,'version','1.0.1'),
   'zones',jsonb_build_array(jsonb_build_object('code','GROUND','name','Ground Floor')),
   'stages',jsonb_build_array(
     jsonb_build_object('instanceCode','QUOTED_SCOPE','templateCode','QUOTED_SCOPE',
       'phase','preconstruction','floorCode',null,'title','Accepted quotation scope',
       'explanation','Frozen contractual baseline','holdPoint','contract',
       'activities',jsonb_build_array('Review accepted quotation scope'),
       'inspectionTopics','[]'::jsonb,'dependsOn','[]'::jsonb),
     jsonb_build_object('instanceCode','INTERIOR_SAMPLE','templateCode','INTERIOR_SAMPLE',
       'phase','fabrication','floorCode',null,'title','Site joinery execution',
       'explanation','Planned joinery work only','holdPoint','quality',
       'activities',jsonb_build_array('Prepare joinery drawings'),
       'inspectionTopics','[]'::jsonb,'dependsOn',jsonb_build_array('QUOTED_SCOPE')),
     jsonb_build_object('instanceCode','HANDOVER','templateCode','HANDOVER',
       'phase','handover','floorCode',null,'title','Project site handover',
       'explanation','Close documented snags','holdPoint','handover',
       'activities',jsonb_build_array('Final cleaning and handover'),
       'inspectionTopics','[]'::jsonb,'dependsOn',jsonb_build_array('INTERIOR_SAMPLE'))
   )));
 if created->>'workflow_id' is null then raise exception 'Quote timeline not created';end if;
 again=public.project_quote_timeline_create(org,contract,jsonb_build_object(
   'industry',industry,'quote_hash',hash,
   'template',jsonb_build_object('industry',industry,'version','1.0.1'),
   'zones',jsonb_build_array(jsonb_build_object('code','GROUND','name','Ground Floor')),
   'stages',jsonb_build_array(jsonb_build_object('unused',true))));
 -- The second call is idempotent for existing agreement; invalid snapshots
 -- must not be accepted before validation of the request's stage contents.
 if again->>'workflow_id' is null or not (again->>'already_created')::boolean
 then raise exception 'Repeated handoff did not reuse original workflow';end if;
 select id into stage from private.construction_project_stages
  where project_id=project and template_code='INTERIOR_SAMPLE';
 select id into quoted_scope from private.construction_project_stages
  where project_id=project and template_code='QUOTED_SCOPE';
 edit=public.project_stage_owner_edit(org,project,stage,0,jsonb_build_object(
    'title','Updated joinery site plan',
    'explanation','Edited only for execution sequencing',
    'activities',jsonb_build_array('Cut and assemble cabinet', 'Check alignment and hinges'),
    'display_order',2,'reason','Owner rescheduled joinery activities'));
 if (edit->>'version')::integer<>1 then raise exception 'Owner edit not versioned';end if;
 if jsonb_array_length(public.project_stage_owner_read(org,project)->'overrides')<>1
 then raise exception 'Updated stage not projected to timeline';end if;
 if (select count(*) from private.project_stage_owner_history
    where organization_id=org and project_id=project)<>1
 then raise exception 'Owner edit not audited';end if;
 begin
  perform public.project_stage_owner_edit(org,project,quoted_scope,0,jsonb_build_object(
    'title','Altered contracted price','explanation','','activities',
    jsonb_build_array('Alter accepted contract'), 'display_order',1,
    'reason','Test should be denied'));
  raise exception 'FAIL: accepted scope owner edit allowed';
 exception when insufficient_privilege then null;end;
 raise notice 'PASS: accepted quote yields idempotent stage plan, owner edit audited, scope frozen';
end$quoted_plan$;
rollback;
