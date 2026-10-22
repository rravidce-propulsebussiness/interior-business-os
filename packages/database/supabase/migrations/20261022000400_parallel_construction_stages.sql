-- Parallel stage field execution: the frozen signed-quotation stage definitions remain immutable.
-- This register records start/pause/resume/field-finished independently of formal QC certification.
create table if not exists private.construction_stage_execution (
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 status text not null check(status in('in_progress','on_hold','ready_for_qc')),
 started_at timestamptz not null default now(),
 started_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id),
 field_finished_at timestamptz,
 notes text not null default '' check(length(notes)<=1000),
 primary key(organization_id,project_id,stage_id),
 foreign key(organization_id,project_id,stage_id)
 references private.construction_project_stages(organization_id,project_id,id) on delete cascade
);
create index if not exists construction_stage_execution_project_status
 on private.construction_stage_execution(organization_id,project_id,status);

-- Dependencies are floor-specific, not a global "next stage" cursor.
-- A structural predecessor MUST have its existing independent certified clearance.
-- Other field stages must have all their recorded work and required site checks
-- submitted, even if their separate independent certification is still pending.
create or replace function private.construction_stage_start_blockers(
 p_org uuid,p_project uuid,p_stage uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_stage private.construction_project_stages;v_pred record;v_count int;v_total int;
 v_missing int;v_blocks jsonb:='[]'::jsonb;v_status text;
begin
 select * into v_stage from private.construction_project_stages
 where organization_id=p_org and project_id=p_project and id=p_stage;
 if not found then return jsonb_build_array('Stage not found');end if;
 if v_stage.template_code in ('QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','DESIGN_APPROVAL','SITE_SURVEY')
 then return jsonb_build_array('Planning and design stages follow their existing approval workflow');end if;
 if (select stage from private.site_state where organization_id=p_org and project_id=p_project)
   is distinct from 'execution' then
  v_blocks=v_blocks||jsonb_build_array('Complete the signed-agreement and design execution gate');
 end if;
 if not private.project_agreement_authorized(p_org,p_project) then
  v_blocks=v_blocks||jsonb_build_array('Authorized signed agreement required');
 end if;
 for v_pred in
   select pred.* from private.construction_stage_dependencies dep
    join private.construction_project_stages pred
      on pred.id=dep.predecessor_id and pred.organization_id=dep.organization_id
        and pred.project_id=dep.project_id
    where dep.organization_id=p_org and dep.project_id=p_project
      and dep.stage_id=p_stage
 loop
  -- Site execution activation already proves design and agreement readiness.
  if v_pred.template_code in ('QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','DESIGN_APPROVAL','SITE_SURVEY')
    then continue;end if;
  select status into v_status from private.construction_stage_execution
   where organization_id=p_org and project_id=p_project and stage_id=v_pred.id;
  if v_status is distinct from 'ready_for_qc' and not private.construction_stage_current(p_org,p_project,v_pred.id) then
    v_blocks=v_blocks||jsonb_build_array('Finish prerequisite: '||v_pred.title);
  elsif v_pred.hold_point='structural' and not private.construction_stage_current(p_org,p_project,v_pred.id) then
    v_blocks=v_blocks||jsonb_build_array('Structural sign-off required: '||v_pred.title);
  end if;
 end loop;
 return v_blocks;
end
$f$;

create or replace function public.construction_stage_execution_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.site_access(p_org,p_project)
 then raise exception 'Project execution unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'stage_id',s.id,
  'status',coalesce(e.status,case when private.construction_stage_current(p_org,p_project,s.id) then 'certified' else 'not_started' end),
  'started_at',e.started_at,'updated_at',e.updated_at,'field_finished_at',e.field_finished_at,
  'blockers',private.construction_stage_start_blockers(p_org,p_project,s.id)
 ) order by s.sequence)
 from private.construction_project_stages s
 left join private.construction_stage_execution e on e.organization_id=s.organization_id
   and e.project_id=s.project_id and e.stage_id=s.id
 where s.organization_id=p_org and s.project_id=p_project),'[]'::jsonb);
end
$f$;

create or replace function public.construction_stage_execution_command(
 p_org uuid,p_project uuid,p_stage uuid,p_action text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_stage private.construction_project_stages;v_existing private.construction_stage_execution;
 v_blocks jsonb;v_total int;v_completed int;v_missing_checks int;v_new text;
begin
 if not private.site_allowed(p_org,p_project,array['manager','site_engineer']) then
   raise exception 'Project owner, site engineer or manager required' using errcode='42501';end if;
 if p_action not in('start','pause','resume','submit_for_qc','reopen')
  or length(coalesce(p_note,''))>1000
 then raise exception 'Invalid stage action' using errcode='22023';end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;
 select * into v_stage from private.construction_project_stages
  where organization_id=p_org and project_id=p_project and id=p_stage;
 if not found then raise exception 'Stage not found' using errcode='22023';end if;
 if v_stage.template_code in ('QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','DESIGN_APPROVAL','SITE_SURVEY')
 then raise exception 'Planning and design stages cannot be manually activated' using errcode='23514';end if;
 select * into v_existing from private.construction_stage_execution
  where organization_id=p_org and project_id=p_project and stage_id=p_stage for update;
 if p_action='start' then
   if v_existing.stage_id is not null then
    raise exception 'Stage already started; use resume or reopen' using errcode='23514';end if;
   v_blocks=private.construction_stage_start_blockers(p_org,p_project,p_stage);
   if jsonb_array_length(v_blocks)>0 then
     raise exception 'Cannot start: %',v_blocks using errcode='23514';end if;
   insert into private.construction_stage_execution(
     organization_id,project_id,stage_id,status,started_by,updated_by,notes)
   values(p_org,p_project,p_stage,'in_progress',auth.uid(),auth.uid(),coalesce(p_note,''));
   v_new='in_progress';
 else
   if v_existing.stage_id is null then
    raise exception 'Start this stage before changing its execution status' using errcode='23514';end if;
   if p_action='pause' and v_existing.status='in_progress' then v_new='on_hold';
   elsif p_action='resume' and v_existing.status='on_hold' then v_new='in_progress';
   elsif p_action='reopen' and v_existing.status='ready_for_qc' then v_new='in_progress';
   elsif p_action='submit_for_qc' and v_existing.status='in_progress' then
    select jsonb_array_length(v_stage.activities) into v_total;
    select count(*) into v_completed from private.project_stage_activity_progress x
    where x.organization_id=p_org and x.project_id=p_project and x.stage_id=p_stage
     and x.activity_index<v_total and x.status='completed';
    if v_completed<>v_total then
     raise exception 'Complete all % work items before submitting for QC (% recorded)',v_total,v_completed using errcode='23514';end if;
    select count(*) into v_missing_checks
    from jsonb_array_elements_text(v_stage.inspection_topics) topic
    where not exists(
     select 1 from private.site_checks c
     join private.construction_stage_record_links l
       on l.organization_id=c.organization_id and l.project_id=c.project_id and l.check_id=c.id
      and l.record_kind='check'
     where l.organization_id=p_org and l.project_id=p_project and l.stage_id=p_stage
       and lower(trim(c.title))=lower(trim(topic)) and c.status='passed'
       and c.photo_id is not null
    );
    if v_missing_checks>0 then
     raise exception 'Complete % required stage checks with photos before requesting QC',v_missing_checks using errcode='23514';end if;
    v_new='ready_for_qc';
   else raise exception 'Invalid or stale stage status transition' using errcode='40001';end if;
   update private.construction_stage_execution
   set status=v_new,updated_at=now(),updated_by=auth.uid(),notes=coalesce(p_note,''),
    field_finished_at=case when v_new='ready_for_qc' then now() else null end
   where organization_id=p_org and project_id=p_project and stage_id=p_stage;
 end if;
 perform private.site_log(p_org,p_project,'construction.stage.'||p_action,p_stage);
 return jsonb_build_object('saved',true,'status',v_new);
end
$f$;
revoke all on function public.construction_stage_execution_read(uuid,uuid) from public,anon;
revoke all on function public.construction_stage_execution_command(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.construction_stage_execution_read(uuid,uuid) to authenticated;
grant execute on function public.construction_stage_execution_command(uuid,uuid,uuid,text,text) to authenticated;
