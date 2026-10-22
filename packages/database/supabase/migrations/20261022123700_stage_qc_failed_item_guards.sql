-- Preserve existing stage/inspection authorization, but prevent open QC defects from being bypassed.

CREATE OR REPLACE FUNCTION private.construction_stage_start_blockers(p_org uuid, p_project uuid, p_stage uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if private.construction_stage_has_open_qc_failures(p_org,p_project,v_pred.id) then
    v_blocks=v_blocks||jsonb_build_array('QC corrections pending: '||v_pred.title);
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION private.construction_stage_current(p_org uuid, p_project uuid, p_stage uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((
  select
   private.project_agreement_authorized(p_org,p_project)
   and c.scope_fingerprint=(
    select private.project_agreement_scope(k.id) from public.contracts k
    where k.organization_id=p_org and k.project_id=p_project and k.status='active'
    limit 1)
   and not private.construction_stage_has_open_qc_failures(p_org,p_project,s.id)
   and exists(select 1 from private.construction_stage_tasks st
      where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=s.id)
   and not exists(select 1 from private.construction_stage_tasks st
      join public.project_tasks task on task.id=st.task_id
      where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=s.id and task.status<>'done')
   and exists(select 1 from private.construction_stage_inspections link
      join public.project_inspections i on i.id=link.inspection_id
      where link.stage_id=s.id and link.organization_id=p_org
       and link.project_id=p_project and i.mandatory)
   and not exists(select 1 from private.construction_stage_inspections link
      where link.stage_id=s.id and link.organization_id=p_org
        and link.project_id=p_project
        and not private.construction_inspection_valid(link.inspection_id))
   and exists(select 1 from private.construction_stage_reviews qr
      where qr.id=c.quality_review_id and qr.stage_id=s.id
       and qr.review_kind='quality' and qr.decision='approved'
       and qr.sequence=(select max(qr2.sequence)
         from private.construction_stage_reviews qr2
         where qr2.stage_id=s.id and qr2.review_kind='quality')
       and private.construction_inspection_valid(qr.inspection_id))
   and (
      s.hold_point is distinct from 'structural'
      or (
        c.structural_review_id is not null
        and c.structural_review_id<>c.quality_review_id
        and exists(select 1 from private.construction_stage_reviews sr
            where sr.id=c.structural_review_id and sr.stage_id=s.id
             and sr.review_kind='structural' and sr.decision='approved'
             and sr.reviewer_id<>(select reviewer_id from private.construction_stage_reviews
                where id=c.quality_review_id)
             and sr.sequence=(select max(sr2.sequence)
               from private.construction_stage_reviews sr2
               where sr2.stage_id=s.id and sr2.review_kind='structural')
             and private.construction_inspection_valid(sr.inspection_id))
      )
   )
  from private.construction_project_stages s
  join private.construction_stage_clearances c
   on c.stage_id=s.id and c.project_id=s.project_id
     and c.organization_id=s.organization_id
  where s.organization_id=p_org and s.project_id=p_project and s.id=p_stage
  order by c.sequence desc limit 1
 ),false);
$function$;

CREATE OR REPLACE FUNCTION public.construction_quality_command(p_org uuid, p_project uuid, p_action text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 stage private.construction_project_stages; inspect public.project_inspections;
 q private.construction_stage_reviews; sr private.construction_stage_reviews;
 actor uuid=auth.uid(); result_id uuid; kind text; decision text; why text;
 reviewer_role text;
begin
 if not private.construction_project_access(p_org,p_project)
 then raise exception 'Unavailable construction project' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or
    octet_length(p_input::text)>12000 or p_action not in (
    'inspection_link','review','stage_clear')
 then raise exception 'Invalid quality operation' using errcode='22023';end if;
 select * into stage from private.construction_project_stages
   where organization_id=p_org and project_id=p_project
     and id=(p_input->>'stage_id')::uuid;
 if stage.id is null then raise exception 'Project stage not found' using errcode='42501';end if;
 -- Serialize records with other commands for this project.
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;

 if p_action='inspection_link' then
    if not private.construction_can_manage(p_org,p_project) or
       p_input-array['stage_id','inspection_id']<>'{}'::jsonb
    then raise exception 'Project manager must attach formal inspection' using errcode='42501';end if;
    select * into inspect from public.project_inspections
     where organization_id=p_org and project_id=p_project
       and id=(p_input->>'inspection_id')::uuid;
    if inspect.id is null or not inspect.mandatory or
       inspect.is_final and stage.phase<>'handover'
    then raise exception 'Active mandatory project inspection required' using errcode='23514';end if;
    insert into private.construction_stage_inspections(
      organization_id,project_id,stage_id,inspection_id,attached_by
    ) values(p_org,p_project,stage.id,inspect.id,actor)
    on conflict(organization_id,project_id,inspection_id) do nothing
    returning inspection_id into result_id;
    if result_id is null then
      if not exists(select 1 from private.construction_stage_inspections
         where organization_id=p_org and project_id=p_project
            and inspection_id=inspect.id and stage_id=stage.id)
      then raise exception 'Inspection already linked to a different stage'
        using errcode='23505';end if;
      result_id=inspect.id;
    end if;

 elsif p_action='review' then
    if p_input-array['stage_id','inspection_id','review_kind','decision','notes']<>'{}'::jsonb
     then raise exception 'Invalid review fields' using errcode='22023';end if;
    kind=p_input->>'review_kind';decision=p_input->>'decision';
    why=trim(coalesce(p_input->>'notes',''));
    if kind not in ('quality','structural') or decision not in ('approved','rejected')
       or length(why) not between 12 and 2500
    then raise exception 'Review kind, decision and evidence note required' using errcode='22023';end if;
    reviewer_role=case when kind='quality' then 'quality_inspector' else 'structural_engineer' end;
    if not exists(select 1 from private.construction_project_roles role
       where role.organization_id=p_org and role.project_id=p_project
       and role.user_id=actor and role.active and role.role=reviewer_role)
    then raise exception 'Independently assigned reviewer role required' using errcode='42501';end if;
    if kind='structural' and stage.hold_point<>'structural'
    then raise exception 'Structural sign-off is only for structural hold points'
      using errcode='22023';end if;
    select i.* into inspect from public.project_inspections i
     join private.construction_stage_inspections link on link.inspection_id=i.id
     where link.organization_id=p_org and link.project_id=p_project
       and link.stage_id=stage.id and i.organization_id=p_org
       and i.project_id=p_project and i.id=(p_input->>'inspection_id')::uuid;
    if inspect.id is null then raise exception 'Attach an existing project inspection'
      using errcode='42501';end if;
    if decision='approved' and not private.construction_inspection_valid(inspect.id)
    then raise exception 'Only latest passed mandatory inspection can be approved'
      using errcode='23514';end if;
    if decision='approved' and exists(
       select 1 from private.construction_stage_tasks st
       join public.project_tasks task on task.id=st.task_id
       where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=stage.id and task.assigned_to=actor)
    then raise exception 'Work performer cannot certify their own stage'
      using errcode='42501';end if;
    insert into private.construction_stage_reviews(
     organization_id,project_id,stage_id,inspection_id,
     review_kind,decision,notes,reviewer_id)
    values(p_org,p_project,stage.id,inspect.id,kind,decision,why,actor)
    returning id into result_id;

 else
    if not private.construction_can_manage(p_org,p_project) or
       p_input-array['stage_id','notes']<>'{}'::jsonb
    then raise exception 'Project manager clearance required' using errcode='42501';end if;
    why=trim(coalesce(p_input->>'notes',''));
    if length(why) not between 12 and 3000
    then raise exception 'Stage certification note required' using errcode='22023';end if;
    perform private.project_agreement_require(p_org,p_project);
    if private.construction_stage_has_open_qc_failures(p_org,p_project,stage.id) then
      raise exception 'QC defects must be corrected and rechecked before stage certification'
        using errcode='23514';
    end if;
    if private.construction_stage_current(p_org,p_project,stage.id)
    then raise exception 'Stage already has a current certified clearance'
      using errcode='23514';end if;
    if not exists(select 1 from public.execution_plans p
       where p.organization_id=p_org and p.project_id=p_project
         and p.status in ('in_progress','punch_list','ready_for_handover'))
    then raise exception 'Operations execution must be active' using errcode='23514';end if;
    if not exists(select 1 from private.construction_stage_tasks st
       where st.organization_id=p_org and st.project_id=p_project
         and st.stage_id=stage.id) or exists(
       select 1 from private.construction_stage_tasks st
       join public.project_tasks task on task.id=st.task_id
       where st.organization_id=p_org and st.project_id=p_project
        and st.stage_id=stage.id and task.status<>'done')
    then raise exception 'All stage tasks must be linked and completed in Operations'
       using errcode='23514';end if;
    if not exists(select 1 from private.construction_stage_inspections l
         where l.organization_id=p_org and l.project_id=p_project
           and l.stage_id=stage.id)
       or exists(select 1 from private.construction_stage_inspections l
         where l.organization_id=p_org and l.project_id=p_project
          and l.stage_id=stage.id
          and not private.construction_inspection_valid(l.inspection_id))
    then raise exception 'Every attached mandatory inspection must have a latest pass'
       using errcode='23514';end if;
    -- Check full prerequisite closure, not merely immediate predecessor.
    if exists(
       with recursive closure(predecessor_id) as (
        select predecessor_id from private.construction_stage_dependencies
        where organization_id=p_org and project_id=p_project and stage_id=stage.id
        union
        select d.predecessor_id from private.construction_stage_dependencies d
        join closure c on c.predecessor_id=d.stage_id
        where d.organization_id=p_org and d.project_id=p_project
       )
       select 1 from closure c
       where not private.construction_stage_current(p_org,p_project,c.predecessor_id)
    ) then raise exception 'Stage prerequisites are not currently certified'
       using errcode='23514';end if;
    select * into q from private.construction_stage_reviews r
      where r.organization_id=p_org and r.project_id=p_project
       and r.stage_id=stage.id and r.review_kind='quality'
      order by r.sequence desc limit 1;
    if q.id is null or q.decision<>'approved'
      or not private.construction_inspection_valid(q.inspection_id)
    then raise exception 'Latest independent quality review must approve' using errcode='23514';end if;
    if stage.hold_point='structural' then
      select * into sr from private.construction_stage_reviews r
       where r.organization_id=p_org and r.project_id=p_project
        and r.stage_id=stage.id and r.review_kind='structural'
       order by r.sequence desc limit 1;
      if sr.id is null or sr.decision<>'approved' or sr.reviewer_id=q.reviewer_id
       or not private.construction_inspection_valid(sr.inspection_id)
      then raise exception 'Independent structural engineer must approve' using errcode='23514';end if;
    end if;
    -- A re-certification after new problems must cite fresh independent reviews.
    if exists(select 1 from private.construction_stage_clearances previous
       join private.construction_stage_reviews oldq on oldq.id=previous.quality_review_id
       where previous.organization_id=p_org and previous.project_id=p_project
         and previous.stage_id=stage.id and oldq.sequence>=q.sequence)
    then raise exception 'A new quality review is required to recertify'
       using errcode='23514';end if;
    if stage.hold_point='structural' and exists(
       select 1 from private.construction_stage_clearances previous
       join private.construction_stage_reviews olds on olds.id=previous.structural_review_id
       where previous.organization_id=p_org and previous.project_id=p_project
        and previous.stage_id=stage.id and olds.sequence>=sr.sequence)
    then raise exception 'A new structural review is required to recertify'
       using errcode='23514';end if;
    insert into private.construction_stage_clearances(
     organization_id,project_id,stage_id,quality_review_id,structural_review_id,
     scope_fingerprint,certificate_note,created_by)
    select p_org,p_project,stage.id,q.id,sr.id,
       private.project_agreement_scope(c.id),why,actor
    from public.contracts c where c.organization_id=p_org and c.project_id=p_project
      and c.status='active'
    returning id into result_id;
    if result_id is null then raise exception 'Active contract required' using errcode='23514';end if;
 end if;
 perform private.site_log(p_org,p_project,'construction.quality.'||p_action,result_id);
 return result_id;
end$function$;

-- Permit an explicitly assigned on-site company QC reviewer to read and upload
-- inspection evidence without granting company-wide project.manage.
CREATE OR REPLACE FUNCTION private.site_allowed(org uuid, project uuid, roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.site_access(org,project) and (
  private.site_owner(org) or
  (private.site_role(org,project) is null and private.has_permission(org,'project.manage')) or
  private.site_role(org,project)=any(roles)
  or exists(select 1 from private.construction_project_roles r
    where r.organization_id=org and r.project_id=project and r.user_id=(select auth.uid())
      and r.active and r.role=any(roles)
      and r.role in ('quality_inspector','structural_engineer'))
 )
$function$;

CREATE OR REPLACE FUNCTION private.site_role(org uuid, project uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(
   (select t.role from private.site_team t
    join public.organization_memberships m on m.organization_id=t.organization_id and m.user_id=t.user_id and m.status='active'
    where t.organization_id=org and t.project_id=project and t.user_id=(select auth.uid()) and t.active
      and t.role<>'watchman' limit 1),
   (select r.role from private.construction_project_roles r
    join public.organization_memberships m on m.organization_id=r.organization_id and m.user_id=r.user_id and m.status='active'
    where r.organization_id=org and r.project_id=project and r.user_id=(select auth.uid())
      and r.active and r.role in ('quality_inspector','structural_engineer')
    order by case when r.role='quality_inspector' then 0 else 1 end limit 1),
   (select t.role from private.site_team t
    join public.organization_memberships m on m.organization_id=t.organization_id and m.user_id=t.user_id and m.status='active'
    where t.organization_id=org and t.project_id=project and t.user_id=(select auth.uid()) and t.active limit 1)
 )
$function$;

