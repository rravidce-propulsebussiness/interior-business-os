-- Quote-first construction and interior execution. Never create work from an
-- arbitrary project-only template. A signed agreement gate remains separate.
begin;
alter table private.construction_project_stages
  drop constraint if exists construction_project_stages_phase_check;
alter table private.construction_project_stages
  add constraint construction_project_stages_phase_check check(phase in (
    'preconstruction','design','site_preparation','foundation','plinth',
    'superstructure','masonry','finishes','handover',
    'survey','procurement','civil','services','fabrication','installation','quality'));

create table private.project_quote_timeline_sources(
 organization_id uuid not null,
 project_id uuid primary key,
 workflow_id uuid not null,
 contract_id uuid not null,
 revision_id uuid not null,
 industry_key text not null check(industry_key in ('construction','interior')),
 quote_hash text not null check(quote_hash ~ '^[a-f0-9]{32}$'),
 created_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),
 foreign key(organization_id,project_id,workflow_id)
   references private.construction_project_workflows(organization_id,project_id,id),
 foreign key(organization_id,contract_id)
   references public.contracts(organization_id,id),
 foreign key(organization_id,revision_id,project_id)
   references public.quotation_revisions(organization_id,id,project_id)
);
create table private.project_stage_owner_overrides(
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid primary key,
 version integer not null default 1,
 title text not null check(length(trim(title)) between 3 and 180),
 explanation text not null default '' check(length(explanation)<=800),
 activities jsonb not null check(jsonb_typeof(activities)='array'
   and jsonb_array_length(activities) between 1 and 80),
 display_order integer not null check(display_order between 1 and 900),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id)
);
create table private.project_stage_owner_history(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 version integer not null,
 original jsonb not null,
 replacement jsonb not null,
 reason text not null check(length(trim(reason)) between 8 and 1000),
 changed_at timestamptz not null default now(),
 changed_by uuid not null references public.profiles(id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id)
);
alter table private.project_stage_owner_history enable row level security;
alter table private.project_stage_owner_history force row level security;
alter table private.project_stage_owner_overrides enable row level security;
alter table private.project_stage_owner_overrides force row level security;
alter table private.project_quote_timeline_sources enable row level security;
alter table private.project_quote_timeline_sources force row level security;
revoke all on private.project_quote_timeline_sources,
 private.project_stage_owner_overrides,private.project_stage_owner_history
 from public,anon,authenticated;
create trigger project_stage_owner_history_immutable
 before update or delete on private.project_stage_owner_history
 for each row execute function private.ops_immutable();

create function public.project_quote_timeline_create(p_org uuid,p_contract uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.contracts; p public.projects; rev public.quotation_revisions;
 v_industry text; v_hash text; v_workflow uuid; v_stage uuid; v_count integer=0;
 x jsonb; predecessor text;
begin
 if jsonb_typeof(p_input) is distinct from 'object'
   or p_input-array['industry','template','zones','stages','quote_hash']<>'{}'::jsonb
   or octet_length(p_input::text)>800000
   or jsonb_typeof(p_input->'template') is distinct from 'object'
   or jsonb_typeof(p_input->'zones') is distinct from 'array'
   or jsonb_typeof(p_input->'stages') is distinct from 'array'
   or jsonb_array_length(p_input->'zones') not between 1 and 64
   or jsonb_array_length(p_input->'stages') not between 1 and 900
 then raise exception 'Invalid quote-derived timeline' using errcode='22023';end if;
 select * into c from public.contracts where organization_id=p_org and id=p_contract;
 if c.id is null or c.status in ('cancelled','closed') then
    raise exception 'Accepted active agreement required' using errcode='42501';end if;
 -- The creator of the approved agreement may initialize its planned
 -- stages even when their role is Finance-only. They cannot edit or certify
 -- those stages; owner edits use the separate owner-only RPC below.
 if not (private.construction_can_manage(p_org,c.project_id)
   or (c.created_by=auth.uid() and private.finance_access(p_org,'contract.create')))
 then raise exception 'Project manager or agreement creator required'
    using errcode='42501';end if;
 select * into p from public.projects
    where organization_id=p_org and id=c.project_id and status='active' for update;
 select * into rev from public.quotation_revisions
    where organization_id=p_org and id=c.revision_id and project_id=p.id;
 if p.id is null or rev.id is null or rev.status not in ('issued','superseded')
   or not exists(select 1 from public.quotation_customer_responses a
       where a.organization_id=p_org and a.id=c.acceptance_id
         and a.revision_id=rev.id and a.action='approved')
 then raise exception 'Only an accepted issued quotation can create stages'
      using errcode='42501';end if;
 select i.key into v_industry from public.industries i where i.id=p.industry_id;
 if v_industry is null or v_industry not in ('interior','construction')
   or p_input->>'industry' is distinct from v_industry
   or p_input->'template'->>'industry' is distinct from v_industry
 then raise exception 'Quote industry differs from project industry'
      using errcode='22023';end if;
 select md5(coalesce(string_agg(
   qi.id::text||chr(31)||coalesce(qi.snapshot->>'name','')||chr(31)||qi.description||chr(31)||case when qi.optional then '1' else '0' end,
   chr(30) order by qi.id),'')) into v_hash
 from public.quotation_items qi
 where qi.organization_id=p_org and qi.revision_id=rev.id;
 if p_input->>'quote_hash' is distinct from v_hash then
  raise exception 'Source quote has changed; reopen the accepted revision'
    using errcode='40001';end if;
 select workflow_id into v_workflow from private.project_quote_timeline_sources
   where organization_id=p_org and project_id=p.id;
 if v_workflow is not null then
   return jsonb_build_object('workflow_id',v_workflow,'already_created',true);end if;
 if exists(select 1 from private.construction_project_workflows
   where organization_id=p_org and project_id=p.id)
 then raise exception 'Existing project timeline must be preserved, not overwritten'
    using errcode='23505';end if;
 -- No duplicate project or site workspace is created.
 insert into private.site_state(organization_id,project_id)
   values(p_org,p.id) on conflict(project_id) do nothing;
 insert into private.construction_project_workflows(
   organization_id,project_id,template_code,template_version,
   template_snapshot,floor_snapshot,created_by)
 values(p_org,p.id,
  case when v_industry='interior' then 'INTERIOR_QUOTE'
    else 'CONSTRUCTION_QUOTE' end,
  coalesce(p_input->'template'->>'version','1.0.0'),
  p_input->'template',p_input->'zones',auth.uid())
 returning id into v_workflow;
 for x in select value from jsonb_array_elements(p_input->'stages') loop
   v_count=v_count+1;
   if jsonb_typeof(x) is distinct from 'object'
     or x-array['instanceCode','templateCode','phase','title','explanation',
       'floorCode','dependsOn','holdPoint','activities','inspectionTopics']<>'{}'::jsonb
     or jsonb_typeof(x->'activities') is distinct from 'array'
     or jsonb_array_length(x->'activities') not between 1 and 80
     or jsonb_typeof(x->'inspectionTopics') is distinct from 'array'
     or jsonb_typeof(x->'dependsOn') is distinct from 'array'
     or jsonb_array_length(x->'dependsOn')>40
   then raise exception 'Invalid quoted stage' using errcode='22023';end if;
   insert into private.construction_project_stages (
     organization_id,project_id,workflow_id,instance_code,template_code,
     phase,floor_code,title,explanation,hold_point,activities,inspection_topics,sequence)
   values(p_org,p.id,v_workflow,x->>'instanceCode',x->>'templateCode',
     x->>'phase',nullif(x->>'floorCode',''),
     x->>'title',x->>'explanation',nullif(x->>'holdPoint',''),
     x->'activities',x->'inspectionTopics',v_count);
 end loop;
 for x in select value from jsonb_array_elements(p_input->'stages') loop
   select id into v_stage from private.construction_project_stages
     where organization_id=p_org and project_id=p.id
       and instance_code=x->>'instanceCode';
   for predecessor in select value from jsonb_array_elements_text(x->'dependsOn') loop
     insert into private.construction_stage_dependencies
       (organization_id,project_id,stage_id,predecessor_id)
     select p_org,p.id,v_stage,prior.id
       from private.construction_project_stages prior
       where prior.organization_id=p_org and prior.project_id=p.id
         and prior.instance_code=predecessor;
     if not found then raise exception 'Unknown stage dependency'
       using errcode='23514';end if;
   end loop;
 end loop;
 -- Require dependencies to point backward in the displayed sequence.
 if exists(select 1 from private.construction_stage_dependencies d
  join private.construction_project_stages s on s.id=d.stage_id
  join private.construction_project_stages pred on pred.id=d.predecessor_id
   where d.organization_id=p_org and d.project_id=p.id
    and s.sequence<=pred.sequence)
 then raise exception 'Quoted stages have invalid dependency order'
   using errcode='23514';end if;
 insert into private.project_quote_timeline_sources
   (organization_id,project_id,workflow_id,contract_id,revision_id,
     industry_key,quote_hash,created_by)
 values(p_org,p.id,v_workflow,c.id,rev.id,v_industry,v_hash,auth.uid());
 perform private.site_log(p_org,p.id,'quote.timeline_created',v_workflow);
 return jsonb_build_object('workflow_id',v_workflow,'already_created',false);
end$$;

create function public.project_stage_owner_edit(
 p_org uuid,p_project uuid,p_stage uuid,p_expected_version integer,
 p_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.construction_project_stages;
 prior private.project_stage_owner_overrides;
 v_title text; v_notes text; v_activities jsonb; v_order integer;
 v_reason text; v_before jsonb; v_after jsonb; v_version integer;
begin
 if not private.site_owner(p_org) or
   not private.construction_can_manage(p_org,p_project) then
   raise exception 'Company owner required' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object'
   or p_input-array['title','explanation','activities','display_order','reason']<>'{}'::jsonb
   or octet_length(p_input::text)>16000
 then raise exception 'Invalid stage planning edit' using errcode='22023';end if;
 select * into s from private.construction_project_stages
  where organization_id=p_org and project_id=p_project and id=p_stage for update;
 if s.id is null then raise exception 'Unknown project stage' using errcode='42501';end if;
 if s.template_code like 'QUOTED_SCOPE%' then
   raise exception 'Accepted quoted scope cannot be edited; use change orders'
   using errcode='42501';end if;
 if exists(select 1 from private.construction_stage_tasks
     where organization_id=p_org and project_id=p_project and stage_id=p_stage)
   or exists(select 1 from private.construction_stage_inspections
     where organization_id=p_org and project_id=p_project and stage_id=p_stage)
   or exists(select 1 from private.construction_stage_clearances
     where organization_id=p_org and project_id=p_project and stage_id=p_stage)
 then raise exception 'Executed or inspected stages cannot be rewritten'
   using errcode='42501';end if;
 select * into prior from private.project_stage_owner_overrides
  where organization_id=p_org and project_id=p_project and stage_id=p_stage for update;
 if coalesce(prior.version,0) is distinct from p_expected_version then
   raise exception 'Stage changed; refresh before editing' using errcode='40001';end if;
 v_title=btrim(p_input->>'title');
 v_notes=coalesce(p_input->>'explanation','');
 v_activities=p_input->'activities';
 v_order=(p_input->>'display_order')::integer;
 v_reason=btrim(p_input->>'reason');
 if length(v_title) not between 3 and 180
  or length(v_notes)>800 or length(v_reason) not between 8 and 1000
  or jsonb_typeof(v_activities) is distinct from 'array'
  or jsonb_array_length(v_activities) not between 1 and 80
  or exists(select 1 from jsonb_array_elements(v_activities) v
    where jsonb_typeof(v) is distinct from 'string'
      or length(btrim(v#>>'{}')) not between 3 and 240)
  or v_order not between 1 and 900
 then raise exception 'Invalid owner stage edits' using errcode='22023';end if;
 -- Visual ordering cannot put a dependency after a successor; authoring
 -- custom stage order never removes physical QC/structural dependencies.
 if exists(select 1 from private.construction_stage_dependencies d
   join private.construction_project_stages pred on pred.id=d.predecessor_id
   left join private.project_stage_owner_overrides ov on ov.stage_id=pred.id
   where d.stage_id=p_stage and coalesce(ov.display_order,pred.sequence)>=v_order)
  or exists(select 1 from private.construction_stage_dependencies d
   join private.construction_project_stages successor on successor.id=d.stage_id
   left join private.project_stage_owner_overrides ov on ov.stage_id=successor.id
   where d.predecessor_id=p_stage and coalesce(ov.display_order,successor.sequence)<=v_order)
 then raise exception 'Cannot reorder before prerequisites or after dependent work'
   using errcode='23514';end if;
 v_before=case when prior.stage_id is null then
   jsonb_build_object('title',s.title,'explanation',s.explanation,
     'activities',s.activities,'display_order',s.sequence)
 else jsonb_build_object('title',prior.title,'explanation',prior.explanation,
     'activities',prior.activities,'display_order',prior.display_order) end;
 v_version=coalesce(prior.version,0)+1;
 insert into private.project_stage_owner_overrides
  (organization_id,project_id,stage_id,version,title,explanation,
   activities,display_order,updated_by)
 values(p_org,p_project,p_stage,v_version,v_title,v_notes,
   v_activities,v_order,auth.uid())
 on conflict(stage_id) do update set
  version=excluded.version,title=excluded.title,explanation=excluded.explanation,
  activities=excluded.activities,display_order=excluded.display_order,
  updated_by=excluded.updated_by,updated_at=now();
 v_after=jsonb_build_object('title',v_title,'explanation',v_notes,
   'activities',v_activities,'display_order',v_order);
 insert into private.project_stage_owner_history
   (organization_id,project_id,stage_id,version,original,replacement,reason,changed_by)
 values(p_org,p_project,p_stage,v_version,v_before,v_after,v_reason,auth.uid());
 perform private.site_log(p_org,p_project,'quote.timeline_owner_edit',p_stage);
 return jsonb_build_object('stage_id',p_stage,'version',v_version);
end$$;

create function public.project_stage_owner_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_allowed boolean;
begin
 v_allowed=private.construction_project_access(p_org,p_project);
 if not v_allowed then raise exception 'Project not available'
   using errcode='42501';end if;
 return jsonb_build_object(
  'can_edit',private.site_owner(p_org) and private.construction_can_manage(p_org,p_project),
  'overrides',case when
     not private.construction_can_manage(p_org,p_project)
     and private.site_role(p_org,p_project)='watchman' then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object('stage_id',stage_id,
        'title',title,'explanation',explanation,'activities',activities,
        'display_order',display_order,'version',version)
      order by display_order,stage_id)
      from private.project_stage_owner_overrides
      where organization_id=p_org and project_id=p_project
    ),'[]'::jsonb) end);
end$$;
revoke all on function public.project_quote_timeline_create(uuid,uuid,jsonb),
 public.project_stage_owner_edit(uuid,uuid,uuid,integer,jsonb),
 public.project_stage_owner_read(uuid,uuid) from public,anon;
grant execute on function public.project_quote_timeline_create(uuid,uuid,jsonb),
 public.project_stage_owner_edit(uuid,uuid,uuid,integer,jsonb),
 public.project_stage_owner_read(uuid,uuid) to authenticated;
commit;