-- Single project flow: one chronological, role-first project timeline.
--
-- This migration is ADDITIVE. It extends the canonical records that already
-- drive project execution instead of creating a parallel state engine:
--   * work-item state      -> private.project_stage_activity_progress (extended)
--   * stage start / QC     -> private.construction_stage_execution (unchanged rules)
--   * certification        -> construction_quality_command (unchanged)
--   * stage payments       -> private.certified_stage_payment_requests (unchanged)
--   * curing rounds        -> private.site_gate (kind = 'curing', extended)
--   * material requests    -> private.site_material_needs (extended)
--   * drawings & decisions -> private.site_designs / private.client_design_decisions
-- Nothing here records money, receipts, stock, purchase orders, QC passes or
-- curing rounds on anyone's behalf.
begin;

------------------------------------------------------------------------------
-- 1. Work items: lifecycle, assignment, measurements, owner controls, audit
------------------------------------------------------------------------------
alter table private.project_stage_activity_progress
  drop constraint if exists project_stage_activity_progress_status_check;
alter table private.project_stage_activity_progress
  add constraint project_stage_activity_progress_status_check
  check (status in ('pending','in_progress','on_hold','completed','skipped'));
alter table private.project_stage_activity_progress
  add column if not exists assignee_id uuid references public.profiles(id),
  add column if not exists assigned_crew text not null default ''
    check (length(assigned_crew) <= 120),
  add column if not exists measurements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(measurements) = 'array' and jsonb_array_length(measurements) <= 20),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists skip_reason text not null default ''
    check (length(skip_reason) <= 1000),
  add column if not exists change_order_id uuid references public.change_orders(id);

-- Owner-added optional work. Indexes start at 1000 so they never collide with
-- the frozen quotation activities (max 80 per stage).
create table if not exists private.project_stage_optional_items (
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  item_index integer not null check (item_index between 1000 and 1199),
  title text not null check (length(trim(title)) between 3 and 200),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, project_id, stage_id, item_index),
  foreign key (organization_id, project_id, stage_id)
    references private.construction_project_stages(organization_id, project_id, id) on delete cascade
);

-- Append-only work-item audit. No authenticated table privileges; rows are
-- written only by the security-definer command below.
create table if not exists private.project_work_item_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  item_index integer not null,
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, project_id, stage_id)
    references private.construction_project_stages(organization_id, project_id, id) on delete cascade
);
create index if not exists project_work_item_events_recent
  on private.project_work_item_events(organization_id, project_id, created_at desc);
revoke all on private.project_stage_optional_items from public, anon, authenticated;
revoke all on private.project_work_item_events from public, anon, authenticated;

create or replace function private.project_work_item_title(
  p_org uuid, p_project uuid, p_stage uuid, p_index integer
) returns text language sql stable security definer set search_path = '' as $f$
  select case
    when p_index between 0 and 999 then (
      select s.activities ->> p_index from private.construction_project_stages s
      where s.organization_id = p_org and s.project_id = p_project and s.id = p_stage
        and p_index < jsonb_array_length(s.activities))
    else (
      select o.title from private.project_stage_optional_items o
      where o.organization_id = p_org and o.project_id = p_project
        and o.stage_id = p_stage and o.item_index = p_index)
  end
$f$;
revoke all on function private.project_work_item_title(uuid, uuid, uuid, integer) from public, anon, authenticated;

create or replace function public.project_work_item_command(
  p_org uuid, p_project uuid, p_stage uuid, p_index integer,
  p_action text, p_input jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_stage private.construction_project_stages;
  v_row private.project_stage_activity_progress;
  v_manager boolean;
  v_exec text;
  v_title text;
  v_from text;
  v_to text;
  v_note text := coalesce(p_input ->> 'note', '');
  v_photo uuid;
  v_mime text;
  v_measure jsonb;
  v_m jsonb;
  v_assignee uuid;
  v_crew text;
  v_reason text;
  v_change uuid;
  v_new_index integer;
  v_detail jsonb := '{}'::jsonb;
begin
  if not private.site_access(p_org, p_project) then
    raise exception 'Project unavailable' using errcode = '42501'; end if;
  if p_action not in ('start','pause','resume','measure','complete','reopen','assign','skip','add_optional')
     or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 8000
     or length(v_note) > 2000 then
    raise exception 'Invalid work-item update' using errcode = '22023'; end if;
  v_manager := private.site_is_manager(p_org, p_project);
  if p_action in ('reopen','assign','skip','add_optional') and not v_manager then
    raise exception 'Only the project owner or manager can reschedule, reassign, skip or add work'
      using errcode = '42501'; end if;
  if p_action in ('start','pause','resume','measure','complete')
     and not private.site_allowed(p_org, p_project, array['manager','site_engineer']) then
    raise exception 'Site engineer or project manager required' using errcode = '42501'; end if;
  if (select stage from private.site_state where organization_id = p_org and project_id = p_project)
     is distinct from 'execution' then
    raise exception 'Physical site execution has not been released for this project' using errcode = '42501'; end if;
  perform 1 from public.projects where organization_id = p_org and id = p_project for update;
  select * into v_stage from private.construction_project_stages
   where organization_id = p_org and project_id = p_project and id = p_stage;
  if not found then raise exception 'Stage unavailable' using errcode = '22023'; end if;
  if v_stage.template_code in ('QUOTED_SCOPE','PRECONSTRUCTION','DESIGN','DESIGN_APPROVAL','SITE_SURVEY') then
    raise exception 'Planning and design stages follow the design workflow' using errcode = '23514'; end if;
  select status into v_exec from private.construction_stage_execution
   where organization_id = p_org and project_id = p_project and stage_id = p_stage;
  if private.construction_stage_current(p_org, p_project, p_stage) then v_exec := 'certified'; end if;

  if p_action = 'add_optional' then
    if p_input - array['title','reason'] <> '{}'::jsonb
       or length(trim(coalesce(p_input ->> 'title', ''))) not between 3 and 200
       or length(trim(coalesce(p_input ->> 'reason', ''))) not between 10 and 1000 then
      raise exception 'Optional task needs a title and a reason (10+ characters)' using errcode = '22023'; end if;
    if v_exec in ('ready_for_qc','certified') then
      raise exception 'Reopen the stage before adding work' using errcode = '23514'; end if;
    select coalesce(max(item_index), 999) + 1 into v_new_index from private.project_stage_optional_items
     where organization_id = p_org and project_id = p_project and stage_id = p_stage;
    if v_new_index > 1199 then raise exception 'Too many optional tasks' using errcode = '22023'; end if;
    insert into private.project_stage_optional_items(organization_id, project_id, stage_id, item_index, title, reason, created_by)
    values (p_org, p_project, p_stage, v_new_index, trim(p_input ->> 'title'), trim(p_input ->> 'reason'), auth.uid());
    insert into private.project_work_item_events(organization_id, project_id, stage_id, item_index, action, from_status, to_status, detail, actor_id)
    values (p_org, p_project, p_stage, v_new_index, 'add_optional', null, 'pending',
      jsonb_build_object('title', trim(p_input ->> 'title'), 'reason', trim(p_input ->> 'reason')), auth.uid());
    perform private.site_log(p_org, p_project, 'work_item.add_optional', p_stage);
    return jsonb_build_object('saved', true, 'index', v_new_index, 'status', 'pending');
  end if;

  v_title := private.project_work_item_title(p_org, p_project, p_stage, p_index);
  if v_title is null then raise exception 'Work item does not belong to this stage' using errcode = '22023'; end if;
  select * into v_row from private.project_stage_activity_progress
   where organization_id = p_org and project_id = p_project and stage_id = p_stage and activity_index = p_index
   for update;
  v_from := coalesce(v_row.status, 'pending');
  v_to := v_from;
  -- An assigned work item is updated by its assignee or a manager only.
  if p_action in ('start','pause','resume','measure','complete') and v_row.assignee_id is not null
     and v_row.assignee_id <> auth.uid() and not v_manager then
    raise exception 'This work item is assigned to another engineer' using errcode = '42501'; end if;

  if p_action in ('measure','complete') and p_input ? 'measurements' then
    v_measure := p_input -> 'measurements';
    if jsonb_typeof(v_measure) is distinct from 'array' or jsonb_array_length(v_measure) not between 1 and 20 then
      raise exception 'Provide between 1 and 20 measurements' using errcode = '22023'; end if;
    for v_m in select value from jsonb_array_elements(v_measure) loop
      if jsonb_typeof(v_m) is distinct from 'object' or (v_m - array['label','value','unit']) <> '{}'::jsonb
         or length(trim(coalesce(v_m ->> 'label', ''))) not between 2 and 80
         or coalesce(v_m ->> 'value', '') !~ '^-?[0-9]{1,7}([.][0-9]{1,3})?$'
         or coalesce(v_m ->> 'unit', '') not in ('mm','cm','m','feet','inch','sqm','sqft','cum','cft','kg','tonnes','nos','bags','litres','deg','mpa','percent','hours') then
        raise exception 'Invalid measurement line' using errcode = '22023'; end if;
    end loop;
    v_detail := v_detail || jsonb_build_object('measurements', v_measure);
  end if;
  if p_input ? 'photo_id' and nullif(p_input ->> 'photo_id', '') is not null then
    v_photo := (p_input ->> 'photo_id')::uuid;
    select m.mime into v_mime from private.site_media m
     where m.organization_id = p_org and m.project_id = p_project and m.id = v_photo;
    if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp') then
      raise exception 'Choose a photo uploaded to this project' using errcode = '22023'; end if;
    v_detail := v_detail || jsonb_build_object('photo_id', v_photo);
  end if;

  if p_action = 'start' then
    if p_input - array['note'] <> '{}'::jsonb then raise exception 'Invalid start input' using errcode = '22023'; end if;
    if v_exec is distinct from 'in_progress' then
      raise exception 'Start this stage first; its dependencies and hold points are checked there' using errcode = '23514'; end if;
    if v_from <> 'pending' then raise exception 'Work item already started' using errcode = '40001'; end if;
    v_to := 'in_progress';
  elsif p_action = 'pause' then
    if p_input - array['note'] <> '{}'::jsonb then raise exception 'Invalid pause input' using errcode = '22023'; end if;
    if v_from <> 'in_progress' then raise exception 'Only work in progress can be paused' using errcode = '40001'; end if;
    v_to := 'on_hold';
  elsif p_action = 'resume' then
    if p_input - array['note'] <> '{}'::jsonb then raise exception 'Invalid resume input' using errcode = '22023'; end if;
    if v_exec is distinct from 'in_progress' then
      raise exception 'The stage is not in progress' using errcode = '23514'; end if;
    if v_from <> 'on_hold' then raise exception 'Only paused work can resume' using errcode = '40001'; end if;
    v_to := 'in_progress';
  elsif p_action = 'measure' then
    if p_input - array['measurements','note'] <> '{}'::jsonb or v_measure is null then
      raise exception 'Measurements are required' using errcode = '22023'; end if;
    if v_from not in ('in_progress','on_hold') then
      raise exception 'Record measurements while the work is in progress' using errcode = '23514'; end if;
  elsif p_action = 'complete' then
    if p_input - array['measurements','note','photo_id'] <> '{}'::jsonb then
      raise exception 'Invalid completion input' using errcode = '22023'; end if;
    if v_exec is distinct from 'in_progress' then
      raise exception 'The stage is not in progress' using errcode = '23514'; end if;
    if v_from <> 'in_progress' then raise exception 'Start the work item before completing it' using errcode = '23514'; end if;
    if v_photo is null and v_row.photo_id is null then
      raise exception 'Upload an actual site photo before completing work' using errcode = '23514'; end if;
    v_to := 'completed';
  elsif p_action = 'reopen' then
    if p_input - array['note'] <> '{}'::jsonb then raise exception 'Invalid reopen input' using errcode = '22023'; end if;
    if v_exec in ('ready_for_qc','certified') then
      raise exception 'Reopen the stage from QC before changing its work items' using errcode = '23514'; end if;
    if v_from not in ('completed','skipped','on_hold','in_progress') then
      raise exception 'Nothing to reopen' using errcode = '40001'; end if;
    v_to := 'pending';
  elsif p_action = 'assign' then
    if p_input - array['user_id','crew'] <> '{}'::jsonb or length(coalesce(p_input ->> 'crew', '')) > 120 then
      raise exception 'Invalid assignment' using errcode = '22023'; end if;
    v_assignee := nullif(p_input ->> 'user_id', '')::uuid;
    v_crew := trim(coalesce(p_input ->> 'crew', ''));
    if v_assignee is not null and not exists (
      select 1 from private.site_team t
      join public.organization_memberships m on m.organization_id = t.organization_id and m.user_id = t.user_id and m.status = 'active'
      where t.organization_id = p_org and t.project_id = p_project and t.user_id = v_assignee
        and t.active and t.role in ('manager','site_engineer')) then
      raise exception 'Assign an active site engineer or manager of this project' using errcode = '22023'; end if;
    v_detail := v_detail || jsonb_build_object('assignee_id', v_assignee, 'crew', v_crew,
      'previous_assignee_id', v_row.assignee_id);
  elsif p_action = 'skip' then
    if p_input - array['reason','change_order_id'] <> '{}'::jsonb then
      raise exception 'Invalid skip input' using errcode = '22023'; end if;
    v_reason := trim(coalesce(p_input ->> 'reason', ''));
    if length(v_reason) not between 10 and 1000 then
      raise exception 'Explain why this task does not apply (10+ characters)' using errcode = '22023'; end if;
    if v_exec in ('ready_for_qc','certified') then
      raise exception 'A stage submitted for QC or certified cannot have work skipped' using errcode = '23514'; end if;
    if v_from not in ('pending','on_hold') then
      raise exception 'Started or completed work cannot be skipped' using errcode = '23514'; end if;
    if p_index < 1000 then
      -- Contracted scope: only an approved change order on the active contract
      -- may remove it. The stage still needs its full QC certification.
      v_change := nullif(p_input ->> 'change_order_id', '')::uuid;
      if v_change is null or not exists (
        select 1 from public.change_orders co
        join public.contracts k on k.organization_id = co.organization_id and k.id = co.contract_id
        where co.organization_id = p_org and co.id = v_change and co.status = 'approved'
          and k.project_id = p_project and k.status = 'active') then
        raise exception 'Skipping contracted scope requires an approved change order' using errcode = '23514'; end if;
    end if;
    v_to := 'skipped';
    v_detail := v_detail || jsonb_build_object('reason', v_reason, 'change_order_id', v_change);
  end if;

  insert into private.project_stage_activity_progress(
    organization_id, project_id, stage_id, activity_index, status, notes, photo_id, updated_by,
    assignee_id, assigned_crew, measurements, started_at, completed_at, skip_reason, change_order_id)
  values (p_org, p_project, p_stage, p_index, v_to, v_note, v_photo, auth.uid(),
    v_assignee, coalesce(v_crew, ''), coalesce(v_measure, '[]'::jsonb),
    case when v_to = 'in_progress' then now() end,
    case when v_to = 'completed' then now() end,
    coalesce(v_reason, ''), v_change)
  on conflict (organization_id, project_id, stage_id, activity_index) do update set
    status = excluded.status,
    notes = case when v_note <> '' then excluded.notes else project_stage_activity_progress.notes end,
    photo_id = coalesce(excluded.photo_id, project_stage_activity_progress.photo_id),
    updated_by = excluded.updated_by, updated_at = now(),
    assignee_id = case when p_action = 'assign' then excluded.assignee_id else project_stage_activity_progress.assignee_id end,
    assigned_crew = case when p_action = 'assign' then excluded.assigned_crew else project_stage_activity_progress.assigned_crew end,
    measurements = case when v_measure is not null then excluded.measurements else project_stage_activity_progress.measurements end,
    started_at = case when p_action = 'start' then now() when v_to = 'pending' then null
                      else project_stage_activity_progress.started_at end,
    completed_at = case when v_to = 'completed' then now() when v_to <> 'completed' and p_action = 'reopen' then null
                        else project_stage_activity_progress.completed_at end,
    skip_reason = case when v_to = 'skipped' then excluded.skip_reason when p_action = 'reopen' then ''
                       else project_stage_activity_progress.skip_reason end,
    change_order_id = case when v_to = 'skipped' then excluded.change_order_id when p_action = 'reopen' then null
                           else project_stage_activity_progress.change_order_id end;

  insert into private.project_work_item_events(organization_id, project_id, stage_id, item_index, action, from_status, to_status, detail, actor_id)
  values (p_org, p_project, p_stage, p_index, p_action, v_from, v_to,
    v_detail || case when v_note <> '' then jsonb_build_object('note', v_note) else '{}'::jsonb end, auth.uid());
  perform private.site_log(p_org, p_project, 'work_item.' || p_action, p_stage);
  return jsonb_build_object('saved', true, 'status', v_to, 'index', p_index);
end
$f$;
revoke all on function public.project_work_item_command(uuid, uuid, uuid, integer, text, jsonb) from public, anon;
grant execute on function public.project_work_item_command(uuid, uuid, uuid, integer, text, jsonb) to authenticated;

-- Stage QC submission: same rules as before, plus skipped contracted work
-- (which already carries an approved change order) counts as resolved and
-- owner-added optional work must be completed or skipped.
create or replace function public.construction_stage_execution_command(
 p_org uuid,p_project uuid,p_stage uuid,p_action text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare v_stage private.construction_project_stages;v_existing private.construction_stage_execution;
 v_blocks jsonb;v_total int;v_completed int;v_missing_checks int;v_new text;v_optional int;
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
     and x.activity_index<v_total
     and (x.status='completed' or (x.status='skipped' and x.change_order_id is not null));
    if v_completed<>v_total then
     raise exception 'Complete all % work items before submitting for QC (% recorded)',v_total,v_completed using errcode='23514';end if;
    select count(*) into v_optional from private.project_stage_optional_items o
    where o.organization_id=p_org and o.project_id=p_project and o.stage_id=p_stage
     and not exists(select 1 from private.project_stage_activity_progress x
       where x.organization_id=p_org and x.project_id=p_project and x.stage_id=p_stage
         and x.activity_index=o.item_index and x.status in ('completed','skipped'));
    if v_optional>0 then
     raise exception 'Complete or skip % owner-added tasks before submitting for QC',v_optional using errcode='23514';end if;
    select count(*) into v_missing_checks
    from jsonb_array_elements_text(v_stage.inspection_topics) as required(topic_name)
    where not exists(
     select 1 from private.site_checks c
     join private.construction_stage_record_links l
       on l.organization_id=c.organization_id and l.project_id=c.project_id and l.check_id=c.id
      and l.record_kind='check'
     where l.organization_id=p_org and l.project_id=p_project and l.stage_id=p_stage
       and lower(trim(c.title))=lower(trim(required.topic_name)) and c.status='passed'
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
revoke all on function public.construction_stage_execution_command(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.construction_stage_execution_command(uuid,uuid,uuid,text,text) to authenticated;

-- The legacy checklist toggle must not silently overwrite skipped or
-- lifecycle-managed rows; it keeps its original semantics otherwise.
create or replace function private.project_stage_activity_legacy_guard()
returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  if tg_op = 'UPDATE' and old.status = 'skipped' and new.status = 'completed'
     and new.change_order_id is not distinct from old.change_order_id
     and new.skip_reason = old.skip_reason then
    raise exception 'Reopen the skipped task before recording it as done' using errcode = '23514';
  end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end
$f$;
drop trigger if exists project_stage_activity_legacy_guard on private.project_stage_activity_progress;
create trigger project_stage_activity_legacy_guard
  before insert or update on private.project_stage_activity_progress
  for each row execute function private.project_stage_activity_legacy_guard();

-- Read model: the original fields plus lifecycle, ownership, measurements,
-- owner-added tasks and the recent audit trail.
create or replace function public.project_stage_checklist_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if not private.site_access(p_org,p_project)
   or not private.site_allowed(p_org,p_project,array['manager','site_engineer','quality_inspector'])
 then raise exception 'Project checklist unavailable' using errcode='42501'; end if;
 return jsonb_build_object(
  'work',coalesce((select jsonb_agg(jsonb_build_object(
    'stage_id',w.stage_id,'index',w.activity_index,'status',w.status,
    'notes',w.notes,'photo_id',w.photo_id,'updated_at',w.updated_at,
    'assignee_id',w.assignee_id,'crew',w.assigned_crew,'measurements',w.measurements,
    'started_at',w.started_at,'completed_at',w.completed_at,
    'skip_reason',w.skip_reason,'change_order_id',w.change_order_id
  )) from private.project_stage_activity_progress w
   where w.organization_id=p_org and w.project_id=p_project),'[]'::jsonb),
  'checks',coalesce((select jsonb_agg(jsonb_build_object(
    'stage_id',l.stage_id,'title',c.title,'id',c.id,'status',c.status,
    'notes',c.notes,'photo_id',c.photo_id,'checked_at',c.checked_at
  )) from private.construction_stage_record_links l
    join private.site_checks c on c.organization_id=l.organization_id
      and c.project_id=l.project_id and c.id=l.check_id
    where l.organization_id=p_org and l.project_id=p_project
      and l.record_kind='check'),'[]'::jsonb),
  'optional',coalesce((select jsonb_agg(jsonb_build_object(
    'stage_id',o.stage_id,'index',o.item_index,'title',o.title,'reason',o.reason,
    'created_at',o.created_at) order by o.stage_id,o.item_index)
   from private.project_stage_optional_items o
   where o.organization_id=p_org and o.project_id=p_project),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
    select ev.stage_id,ev.item_index as index,ev.action,ev.from_status,ev.to_status,ev.detail,
      ev.actor_id,ev.created_at
    from private.project_work_item_events ev
    where ev.organization_id=p_org and ev.project_id=p_project
    order by ev.created_at desc,ev.id desc limit 300) e),'[]'::jsonb)
 );
end
$function$;
revoke all on function public.project_stage_checklist_read(uuid,uuid) from public,anon;
grant execute on function public.project_stage_checklist_read(uuid,uuid) to authenticated;

------------------------------------------------------------------------------
-- 2. Curing: plans from approved specifications, one canonical round record
------------------------------------------------------------------------------
create table if not exists private.project_curing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  activity_index integer check (activity_index is null or activity_index >= 0),
  title text not null check (length(trim(title)) between 3 and 160),
  -- The approved specification the schedule comes from (drawing, BOQ clause,
  -- structural note). There are no built-in default durations.
  spec_reference text not null check (length(trim(spec_reference)) between 3 and 300),
  starts_on date not null,
  ends_on date not null,
  round_times time[] not null check (cardinality(round_times) between 1 and 12),
  grace_minutes integer not null check (grace_minutes between 10 and 720),
  status text not null default 'active' check (status in ('active','cancelled')),
  cancel_reason text not null default '' check (length(cancel_reason) <= 1000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 120),
  unique (organization_id, project_id, id),
  foreign key (organization_id, project_id, stage_id)
    references private.construction_project_stages(organization_id, project_id, id) on delete cascade
);
create index if not exists project_curing_plans_project
  on private.project_curing_plans(organization_id, project_id, status);
revoke all on private.project_curing_plans from public, anon, authenticated;

alter table private.site_gate
  add column if not exists curing_plan_id uuid,
  add column if not exists round_at timestamptz,
  add column if not exists photo_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_gate_curing_plan_fkey') then
    alter table private.site_gate add constraint site_gate_curing_plan_fkey
      foreign key (organization_id, project_id, curing_plan_id)
      references private.project_curing_plans(organization_id, project_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_gate_photo_project_fkey') then
    alter table private.site_gate add constraint site_gate_photo_project_fkey
      foreign key (organization_id, project_id, photo_id)
      references private.site_media(organization_id, project_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_gate_curing_round_shape') then
    alter table private.site_gate add constraint site_gate_curing_round_shape
      check ((curing_plan_id is null and round_at is null) or (kind = 'curing' and curing_plan_id is not null and round_at is not null));
  end if;
end $$;
create unique index if not exists site_gate_one_record_per_curing_round
  on private.site_gate(curing_plan_id, round_at) where curing_plan_id is not null;

create or replace function private.project_zone(p_org uuid)
returns text language sql stable security definer set search_path = '' as $f$
  select coalesce((select default_timezone from public.organizations where id = p_org), 'Asia/Kolkata')
$f$;
revoke all on function private.project_zone(uuid) from public, anon, authenticated;

create or replace function public.project_curing_command(
  p_org uuid, p_project uuid, p_action text, p_input jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_plan private.project_curing_plans;
  v_zone text := private.project_zone(p_org);
  v_round timestamptz;
  v_local timestamp;
  v_times time[];
  v_time text;
  v_id uuid;
  v_photo uuid;
  v_mime text;
  v_uploader uuid;
  v_gate private.site_gate;
begin
  if not private.site_access(p_org, p_project) then
    raise exception 'Project unavailable' using errcode = '42501'; end if;
  if p_action not in ('plan_create','plan_cancel','round_record','round_photo')
     or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 6000 then
    raise exception 'Invalid curing command' using errcode = '22023'; end if;
  if (select stage from private.site_state where organization_id = p_org and project_id = p_project)
     is distinct from 'execution' then
    raise exception 'Physical site execution has not been released for this project' using errcode = '42501'; end if;
  perform 1 from public.projects where organization_id = p_org and id = p_project for update;

  if p_action = 'plan_create' then
    if not private.site_is_manager(p_org, p_project) then
      raise exception 'Only the project owner or manager can approve a curing schedule' using errcode = '42501'; end if;
    if p_input - array['stage_id','activity_index','title','spec_reference','starts_on','ends_on','round_times','grace_minutes'] <> '{}'::jsonb
       or jsonb_typeof(p_input -> 'round_times') is distinct from 'array'
       or jsonb_array_length(p_input -> 'round_times') not between 1 and 12
       or coalesce(p_input ->> 'grace_minutes', '') !~ '^[0-9]{1,3}$' then
      raise exception 'Curing schedule needs stage, specification, dates, round times and grace' using errcode = '22023'; end if;
    v_times := array[]::time[];
    for v_time in select value from jsonb_array_elements_text(p_input -> 'round_times') loop
      if v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Round times use HH:MM' using errcode = '22023'; end if;
      v_times := v_times || v_time::time;
    end loop;
    if cardinality(v_times) <> (select count(distinct t) from unnest(v_times) t) then
      raise exception 'Duplicate round times' using errcode = '22023'; end if;
    if not exists (select 1 from private.construction_project_stages s
       where s.organization_id = p_org and s.project_id = p_project and s.id = (p_input ->> 'stage_id')::uuid) then
      raise exception 'Stage unavailable' using errcode = '22023'; end if;
    insert into private.project_curing_plans(organization_id, project_id, stage_id, activity_index, title,
      spec_reference, starts_on, ends_on, round_times, grace_minutes, created_by)
    values (p_org, p_project, (p_input ->> 'stage_id')::uuid, nullif(p_input ->> 'activity_index', '')::integer,
      trim(p_input ->> 'title'), trim(p_input ->> 'spec_reference'), (p_input ->> 'starts_on')::date,
      (p_input ->> 'ends_on')::date, (select array_agg(t order by t) from unnest(v_times) t),
      (p_input ->> 'grace_minutes')::integer, auth.uid())
    returning id into v_id;
    perform private.site_log(p_org, p_project, 'curing.plan_created', v_id);
    return jsonb_build_object('id', v_id);
  elsif p_action = 'plan_cancel' then
    if not private.site_is_manager(p_org, p_project) then
      raise exception 'Only the project owner or manager can cancel a curing schedule' using errcode = '42501'; end if;
    if p_input - array['plan_id','reason'] <> '{}'::jsonb or length(trim(coalesce(p_input ->> 'reason', ''))) not between 10 and 1000 then
      raise exception 'Explain why the schedule is cancelled' using errcode = '22023'; end if;
    update private.project_curing_plans set status = 'cancelled', cancel_reason = trim(p_input ->> 'reason')
     where organization_id = p_org and project_id = p_project and id = (p_input ->> 'plan_id')::uuid and status = 'active'
     returning id into v_id;
    if v_id is null then raise exception 'Active curing schedule not found' using errcode = '40001'; end if;
    perform private.site_log(p_org, p_project, 'curing.plan_cancelled', v_id);
    return jsonb_build_object('id', v_id);
  end if;

  -- Rounds: watchman, site engineer or manager, recorded by the person on site.
  if not private.site_allowed(p_org, p_project, array['manager','site_engineer','watchman']) then
    raise exception 'Only assigned watchmen, site engineers or managers record curing' using errcode = '42501'; end if;

  if p_action = 'round_record' then
    if p_input - array['plan_id','round_at','remarks'] <> '{}'::jsonb
       or length(trim(coalesce(p_input ->> 'remarks', ''))) not between 3 and 1000 then
      raise exception 'Curing round needs the scheduled round and remarks' using errcode = '22023'; end if;
    select * into v_plan from private.project_curing_plans
     where organization_id = p_org and project_id = p_project and id = (p_input ->> 'plan_id')::uuid;
    if v_plan.id is null or v_plan.status <> 'active' then
      raise exception 'Active curing schedule not found' using errcode = '22023'; end if;
    v_round := (p_input ->> 'round_at')::timestamptz;
    v_local := v_round at time zone v_zone;
    if v_local::date not between v_plan.starts_on and v_plan.ends_on
       or not (v_local::time = any(v_plan.round_times)) then
      raise exception 'That time is not a scheduled curing round' using errcode = '22023'; end if;
    -- A round cannot be recorded in advance, and very old rounds stay missed.
    if v_round > now() + interval '30 minutes' then
      raise exception 'A curing round cannot be recorded before it is due' using errcode = '23514'; end if;
    if v_round < now() - interval '24 hours' then
      raise exception 'This round is older than 24 hours and remains missed' using errcode = '23514'; end if;
    begin
      insert into private.site_gate(organization_id, project_id, kind, description, notes, created_by, curing_plan_id, round_at)
      values (p_org, p_project, 'curing', left(v_plan.title || ': ' || trim(p_input ->> 'remarks'), 1500),
        trim(p_input ->> 'remarks'), auth.uid(), v_plan.id, v_round)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'This curing round has already been recorded' using errcode = '23505';
    end;
    perform private.site_log(p_org, p_project, 'gate.curing', v_id);
    return jsonb_build_object('id', v_id, 'late', now() > v_round + make_interval(mins => v_plan.grace_minutes));
  end if;

  -- round_photo: attach evidence to an existing round recorded by the caller
  -- (or any round, for managers / engineers).
  if p_input - array['gate_id','photo_id'] <> '{}'::jsonb then
    raise exception 'Invalid curing photo input' using errcode = '22023'; end if;
  select * into v_gate from private.site_gate
   where organization_id = p_org and project_id = p_project and id = (p_input ->> 'gate_id')::uuid
     and curing_plan_id is not null for update;
  if v_gate.id is null then raise exception 'Curing round not found' using errcode = '22023'; end if;
  if v_gate.photo_id is not null then raise exception 'Photo already attached' using errcode = '40001'; end if;
  v_photo := (p_input ->> 'photo_id')::uuid;
  select mime, uploaded_by into v_mime, v_uploader from private.site_media
   where organization_id = p_org and project_id = p_project and id = v_photo;
  if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Choose a curing photo uploaded to this project' using errcode = '22023'; end if;
  if private.site_role(p_org, p_project) = 'watchman' and not private.site_is_manager(p_org, p_project)
     and (v_gate.created_by <> auth.uid() or v_uploader <> auth.uid()) then
    raise exception 'Watchmen attach only their own photos to their own rounds' using errcode = '42501'; end if;
  update private.site_gate set photo_id = v_photo where id = v_gate.id;
  perform private.site_log(p_org, p_project, 'gate.curing_photo', v_gate.id);
  return jsonb_build_object('id', v_gate.id);
end
$f$;
revoke all on function public.project_curing_command(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.project_curing_command(uuid, uuid, text, jsonb) to authenticated;

-- Scheduled rounds between two dates with their actual state. Missing rounds
-- are reported, never filled in.
create or replace function public.project_curing_read(
  p_org uuid, p_project uuid, p_from date default null, p_to date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare
  v_zone text := private.project_zone(p_org);
  v_today date := (now() at time zone private.project_zone(p_org))::date;
  v_from date := coalesce(p_from, (now() at time zone private.project_zone(p_org))::date - 1);
  v_to date := coalesce(p_to, (now() at time zone private.project_zone(p_org))::date + 1);
  v_supervisor boolean;
begin
  if not private.site_allowed(p_org, p_project, array['manager','site_engineer','watchman','quality_inspector']) then
    raise exception 'Curing records unavailable' using errcode = '42501'; end if;
  if v_to < v_from or v_to - v_from > 31 then
    raise exception 'Choose up to 31 days' using errcode = '22023'; end if;
  v_supervisor := private.site_is_manager(p_org, p_project)
    or private.site_role(p_org, p_project) in ('site_engineer','quality_inspector','manager');
  return jsonb_build_object(
    'today', v_today, 'timezone', v_zone, 'supervisor', v_supervisor,
    'can_record', private.site_allowed(p_org, p_project, array['manager','site_engineer','watchman']),
    'can_plan', private.site_is_manager(p_org, p_project),
    'plans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'stage_id', p.stage_id, 'activity_index', p.activity_index, 'title', p.title,
        'spec_reference', p.spec_reference, 'starts_on', p.starts_on, 'ends_on', p.ends_on,
        'round_times', to_jsonb(p.round_times), 'grace_minutes', p.grace_minutes, 'status', p.status)
        order by p.starts_on, p.title)
      from private.project_curing_plans p
      where p.organization_id = p_org and p.project_id = p_project), '[]'::jsonb),
    'rounds', coalesce((select jsonb_agg(jsonb_build_object(
        'plan_id', s.plan_id, 'title', s.title, 'round_at', s.round_at,
        'status', case when g.id is not null then 'recorded'
                       when now() > s.round_at + make_interval(mins => s.grace_minutes) then 'missed'
                       when now() >= s.round_at then 'due' else 'upcoming' end,
        'gate_id', g.id, 'recorded_at', g.created_at, 'recorded_by', g.created_by,
        'recorded_by_me', g.created_by = auth.uid(),
        'late', g.id is not null and g.created_at > s.round_at + make_interval(mins => s.grace_minutes),
        'remarks', g.notes, 'photo_id',
          case when g.photo_id is null then null
               when v_supervisor or g.created_by = auth.uid() then g.photo_id end,
        'has_photo', g.photo_id is not null)
        order by s.round_at, s.title)
      from (
        select p.id as plan_id, p.title, p.grace_minutes,
          ((d::date + t) at time zone v_zone) as round_at
        from private.project_curing_plans p
        cross join lateral generate_series(greatest(p.starts_on, v_from), least(p.ends_on, v_to), interval '1 day') d
        cross join lateral unnest(p.round_times) t
        where p.organization_id = p_org and p.project_id = p_project and p.status = 'active'
      ) s
      left join private.site_gate g on g.curing_plan_id = s.plan_id and g.round_at = s.round_at), '[]'::jsonb),
    'missed_total', case when v_supervisor then (
      select count(*) from private.project_curing_plans p
      cross join lateral generate_series(p.starts_on, least(p.ends_on, v_today), interval '1 day') d
      cross join lateral unnest(p.round_times) t
      where p.organization_id = p_org and p.project_id = p_project and p.status = 'active'
        and now() > ((d::date + t) at time zone v_zone) + make_interval(mins => p.grace_minutes)
        and not exists (select 1 from private.site_gate g where g.curing_plan_id = p.id
          and g.round_at = ((d::date + t) at time zone v_zone))) else null end
  );
end
$f$;
revoke all on function public.project_curing_read(uuid, uuid, date, date) from public, anon;
grant execute on function public.project_curing_read(uuid, uuid, date, date) to authenticated;

------------------------------------------------------------------------------
-- 3. Materials: one Request Material action per work item (BOQ or manual)
------------------------------------------------------------------------------
alter table private.site_material_needs
  add column if not exists required_date date,
  add column if not exists boq_item_id uuid references public.quotation_items(id);

create or replace function private.project_contract_revision(p_org uuid, p_project uuid)
returns uuid language sql stable security definer set search_path = '' as $f$
  select k.revision_id from public.contracts k
  where k.organization_id = p_org and k.project_id = p_project and k.status in ('pending','active')
  order by case when k.status = 'active' then 0 else 1 end, k.created_at desc limit 1
$f$;
revoke all on function private.project_contract_revision(uuid, uuid) from public, anon, authenticated;

-- BOQ lines of the agreed quotation revision. Quantities and names only:
-- site roles never receive prices from this projection.
create or replace function public.project_boq_items_read(p_org uuid, p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare v_revision uuid;
begin
  if not private.site_allowed(p_org, p_project, array['manager','site_engineer','procurement']) then
    raise exception 'Project BOQ unavailable' using errcode = '42501'; end if;
  v_revision := private.project_contract_revision(p_org, p_project);
  if v_revision is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', qi.id, 'name', coalesce(nullif(qi.snapshot ->> 'name', ''), left(qi.description, 200)),
      'quantity', qi.snapshot ->> 'quantity',
      'unit', coalesce(qi.snapshot -> 'unit' ->> 'label', qi.snapshot -> 'unit' ->> 'key', ''))
      order by qi.created_at, qi.id)
    from public.quotation_items qi
    where qi.organization_id = p_org and qi.revision_id = v_revision), '[]'::jsonb);
end
$f$;
revoke all on function public.project_boq_items_read(uuid, uuid) from public, anon;
grant execute on function public.project_boq_items_read(uuid, uuid) to authenticated;

create or replace function public.project_work_item_material_request(
  p_org uuid, p_project uuid, p_stage uuid, p_index integer, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $f$
declare v_item jsonb; v_id uuid; v_qty numeric; v_unit text; v_name text; v_total integer := 0;
  v_revision uuid; v_boq uuid; v_date date;
  v_today date := (now() at time zone private.project_zone(p_org))::date;
begin
  if not private.site_access(p_org, p_project)
     or not private.site_allowed(p_org, p_project, array['manager','site_engineer','procurement']) then
    raise exception 'Project material access denied' using errcode = '42501'; end if;
  if (select stage from private.site_state where organization_id = p_org and project_id = p_project)
     is distinct from 'execution' then
    raise exception 'Activate construction before requesting materials' using errcode = '42501'; end if;
  if private.project_work_item_title(p_org, p_project, p_stage, p_index) is null then
    raise exception 'Work item does not belong to this stage' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12
     or octet_length(p_items::text) > 12000 then
    raise exception 'Choose between 1 and 12 materials' using errcode = '22023'; end if;
  perform 1 from public.projects where organization_id = p_org and id = p_project for update;
  v_revision := private.project_contract_revision(p_org, p_project);
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or (v_item - array['item','quantity','unit','notes','required_date','boq_item_id']) <> '{}'::jsonb
       or length(coalesce(v_item ->> 'notes', '')) > 3000
       or coalesce(v_item ->> 'quantity', '') !~ '^[0-9]{1,9}([.][0-9]{1,3})?$'
       or coalesce(v_item ->> 'required_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Each material needs quantity, unit and required date' using errcode = '22023'; end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    v_unit := v_item ->> 'unit';
    v_date := (v_item ->> 'required_date')::date;
    if v_qty <= 0 or v_qty > 100000000 or v_unit not in
       ('bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet') then
      raise exception 'Invalid quantity or unit' using errcode = '22023'; end if;
    if v_date < v_today or v_date > v_today + 365 then
      raise exception 'Required date must be today or later' using errcode = '22023'; end if;
    v_boq := nullif(v_item ->> 'boq_item_id', '')::uuid;
    v_name := trim(coalesce(v_item ->> 'item', ''));
    if v_boq is not null then
      select coalesce(nullif(v_name, ''), nullif(qi.snapshot ->> 'name', ''), left(qi.description, 200))
        into v_name from public.quotation_items qi
       where qi.organization_id = p_org and qi.id = v_boq and qi.revision_id = v_revision;
      if not found then raise exception 'BOQ line is not part of this project agreement' using errcode = '22023'; end if;
    end if;
    if length(coalesce(v_name, '')) not between 2 and 200 then
      raise exception 'Name the material' using errcode = '22023'; end if;
    insert into private.site_material_needs(organization_id, project_id, item, quantity, unit, notes,
      requested_by, activity_index, required_date, boq_item_id)
    values (p_org, p_project, left(v_name, 200), v_qty, v_unit, coalesce(v_item ->> 'notes', ''),
      auth.uid(), p_index, v_date, v_boq)
    returning id into v_id;
    insert into private.construction_stage_record_links(organization_id, project_id, stage_id, record_kind, material_id, linked_by)
    values (p_org, p_project, p_stage, 'material', v_id, auth.uid());
    insert into private.project_work_item_events(organization_id, project_id, stage_id, item_index, action, detail, actor_id)
    values (p_org, p_project, p_stage, p_index, 'material_request',
      jsonb_build_object('material_id', v_id, 'item', left(v_name, 200), 'quantity', v_qty, 'unit', v_unit,
        'required_date', v_date, 'boq_item_id', v_boq), auth.uid());
    perform private.site_log(p_org, p_project, 'material.requested', v_id);
    v_total := v_total + 1;
  end loop;
  return jsonb_build_object('count', v_total, 'stage_id', p_stage);
end
$f$;
revoke all on function public.project_work_item_material_request(uuid, uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.project_work_item_material_request(uuid, uuid, uuid, integer, jsonb) to authenticated;

------------------------------------------------------------------------------
-- 4. Design sequence: floor plan → homeowner approval → structural and 3D
------------------------------------------------------------------------------
alter table private.site_designs
  add column if not exists client_approved_at timestamptz,
  add column if not exists client_approval_source text
    check (client_approval_source is null or client_approval_source in ('portal','staff_evidence','package','backfill'));
alter table private.client_design_decisions
  add column if not exists design_id uuid references private.site_designs(id),
  add column if not exists source text not null default 'portal'
    check (source in ('portal','staff_evidence'));

-- Projects already past homeowner approval keep their approved drawings.
update private.site_designs d
   set client_approved_at = coalesce(s.client_approval_recorded_at, s.updated_at, now()),
       client_approval_source = 'backfill'
  from private.site_state s
 where s.organization_id = d.organization_id and s.project_id = d.project_id
   and s.stage in ('client_approved','execution','handover')
   and d.status = 'approved' and d.client_approved_at is null;

create or replace function private.project_floor_plan_kind(p_org uuid, p_project uuid)
returns text language sql stable security definer set search_path = '' as $f$
  select case when exists (select 1 from public.projects p join public.industries i on i.id = p.industry_id
     where p.organization_id = p_org and p.id = p_project and i.key = 'interior')
   then 'interior_layout' else 'architectural_plan' end
$f$;
revoke all on function private.project_floor_plan_kind(uuid, uuid) from public, anon, authenticated;

create or replace function private.site_design_sequence_guard()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare v_base text; v_status text; v_client timestamptz;
begin
  if new.kind not in ('structural_design','3d_design') then return new; end if;
  v_base := private.project_floor_plan_kind(new.organization_id, new.project_id);
  select d.status, d.client_approved_at into v_status, v_client from private.site_designs d
   where d.organization_id = new.organization_id and d.project_id = new.project_id and d.kind = v_base
   order by d.revision desc limit 1;
  if v_status is distinct from 'approved' or v_client is null then
    raise exception 'The current floor plan must be technically approved and approved by the homeowner before % starts',
      replace(new.kind, '_', ' ') using errcode = '23514';
  end if;
  return new;
end
$f$;
drop trigger if exists site_design_sequence_guard on private.site_designs;
create trigger site_design_sequence_guard before insert on private.site_designs
  for each row execute function private.site_design_sequence_guard();


-- Per-project policy: when set, no drawing can be submitted until the
-- agreement gate (signed agreement + Finance-verified advance) is satisfied.
-- Default false keeps the existing "design may start on signing" behaviour.
alter table private.project_advance_requirements
  add column if not exists before_design boolean not null default false,
  add column if not exists policy_set_by uuid references public.profiles(id),
  add column if not exists policy_set_at timestamptz;

create or replace function public.project_advance_policy_set(p_org uuid, p_project uuid, p_before_design boolean)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare v_count integer;
begin
  if not private.site_owner(p_org) and not (private.site_is_manager(p_org, p_project)
       and private.finance_access(p_org, 'contract.manage')) then
    raise exception 'Owner or contract manager required' using errcode = '42501'; end if;
  if p_before_design is null then raise exception 'Choose a policy' using errcode = '22023'; end if;
  update private.project_advance_requirements set before_design = p_before_design,
    policy_set_by = auth.uid(), policy_set_at = now()
   where organization_id = p_org and project_id = p_project;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Prepare the project agreement first' using errcode = '23514'; end if;
  perform private.site_log(p_org, p_project, 'advance.policy_' || case when p_before_design then 'before_design' else 'before_site' end);
  return jsonb_build_object('before_design', p_before_design);
end
$f$;
revoke all on function public.project_advance_policy_set(uuid, uuid, boolean) from public, anon;
grant execute on function public.project_advance_policy_set(uuid, uuid, boolean) to authenticated;

create or replace function private.site_design_advance_guard()
returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  if exists (select 1 from private.project_advance_requirements r
      where r.organization_id = new.organization_id and r.project_id = new.project_id and r.before_design)
     and not private.project_agreement_authorized(new.organization_id, new.project_id) then
    raise exception 'This project requires the advance to be verified by Finance before design starts'
      using errcode = '23514';
  end if;
  return new;
end
$f$;
drop trigger if exists site_design_advance_guard on private.site_designs;
create trigger site_design_advance_guard before insert on private.site_designs
  for each row execute function private.site_design_advance_guard();

-- Staff-recorded homeowner decision on one drawing (meeting, email, call).
create or replace function public.project_design_client_decision(
  p_org uuid, p_project uuid, p_design uuid, p_decision text, p_evidence text
) returns jsonb language plpgsql security definer set search_path = '' as $f$
declare v_row private.site_designs; v_customer uuid; v_email text;
begin
  if not private.site_allowed(p_org, p_project, array['manager']) then
    raise exception 'Manager must record homeowner decisions' using errcode = '42501'; end if;
  if p_decision not in ('approved','changes_requested')
     or length(trim(coalesce(p_evidence, ''))) not between 10 and 2000 then
    raise exception 'Record the decision and its evidence (10+ characters)' using errcode = '22023'; end if;
  perform 1 from public.projects where organization_id = p_org and id = p_project for update;
  if (select stage from private.site_state where organization_id = p_org and project_id = p_project) is distinct from 'design' then
    raise exception 'Project is not in design' using errcode = '23514'; end if;
  select * into v_row from private.site_designs
   where organization_id = p_org and project_id = p_project and id = p_design for update;
  if v_row.id is null or v_row.revision <> (select max(revision) from private.site_designs
       where organization_id = p_org and project_id = p_project and kind = v_row.kind) then
    raise exception 'Only the current drawing revision can be decided' using errcode = '23514'; end if;
  if v_row.status <> 'approved' or v_row.client_approved_at is not null then
    raise exception 'The drawing must be technically approved and awaiting the homeowner' using errcode = '23514'; end if;
  if p_decision = 'approved' then
    update private.site_designs set client_approved_at = now(), client_approval_source = 'staff_evidence' where id = v_row.id;
  else
    update private.site_designs set status = 'changes_requested', review_note = trim(p_evidence),
      reviewed_by = auth.uid(), reviewed_at = now() where id = v_row.id;
  end if;
  select customer_id into v_customer from public.projects where organization_id = p_org and id = p_project;
  select lower(email) into v_email from auth.users where id = auth.uid();
  insert into private.client_design_decisions(organization_id, project_id, customer_id, user_id, email,
    decision, design_kind, note, design_id, source)
  values (p_org, p_project, v_customer, auth.uid(), coalesce(v_email, 'staff'), p_decision, v_row.kind,
    left(trim(p_evidence), 1000), v_row.id, 'staff_evidence');
  perform private.site_log(p_org, p_project, 'client.design_' || p_decision, v_row.id);
  return jsonb_build_object('id', v_row.id, 'decision', p_decision);
end
$f$;
revoke all on function public.project_design_client_decision(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.project_design_client_decision(uuid, uuid, uuid, text, text) to authenticated;

-- Homeowner portal: decide one drawing at a time, or approve the full set.
create or replace function public.client_portal_design_decide(
 p_project_id uuid,p_decision text,p_kind text default null,p_note text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_customer uuid;v_email text;v_kind text;v_current private.site_designs;
begin
 if not private.client_portal_accessible(p_project_id) then
  raise exception 'Client project access required' using errcode='42501';end if;
 select organization_id,customer_id into v_org,v_customer from public.projects where id=p_project_id for update;
 v_email=private.client_portal_verified_email();
 if not exists (select 1 from private.site_state
  where project_id=p_project_id and organization_id=v_org and stage='design')
 then raise exception 'Project is not awaiting design approval' using errcode='23514';end if;
 if p_decision not in ('approved','changes_requested') then
  raise exception 'Invalid design decision' using errcode='22023';end if;
 v_kind=nullif(coalesce(p_kind,''),'');
 if v_kind is not null and v_kind not in ('architectural_plan','3d_design','structural_design',
    'interior_layout','electrical_plan','plumbing_plan') then
  raise exception 'Choose a drawing' using errcode='22023';end if;
 if p_decision='changes_requested' or v_kind is not null then
  if v_kind is null then raise exception 'Choose a drawing' using errcode='22023';end if;
  select * into v_current from private.site_designs
  where organization_id=v_org and project_id=p_project_id and kind=v_kind
  order by revision desc limit 1 for update;
  if v_current.id is null or v_current.status<>'approved' then
    raise exception 'A technically reviewed drawing is required' using errcode='23514';end if;
  if p_decision='changes_requested' then
   if length(trim(coalesce(p_note,''))) not between 10 and 1000 then
    raise exception 'Describe the requested changes' using errcode='22023';end if;
   update private.site_designs set status='changes_requested',
    review_note=trim(p_note),reviewed_at=now()
    where id=v_current.id;
   update private.site_state set client_approval_recorded_at=null,
     client_approval_recorded_by=null,updated_at=now() where project_id=p_project_id;
  else
   if v_current.client_approved_at is not null then
    raise exception 'This drawing is already approved' using errcode='23514';end if;
   update private.site_designs set client_approved_at=now(),client_approval_source='portal'
    where id=v_current.id;
  end if;
 else
  if exists(
    select 1 from unnest(case when exists(
      select 1 from public.projects p join public.industries i on i.id=p.industry_id
      where p.id=p_project_id and i.key='interior'
    ) then array['interior_layout','3d_design']::text[]
      else array['architectural_plan','3d_design','structural_design']::text[] end
    ) needed(kind)
    left join lateral(
      select status from private.site_designs d
      where d.organization_id=v_org and d.project_id=p_project_id
      and d.kind=needed.kind order by d.revision desc limit 1
    ) latest on true
    where latest.status is distinct from 'approved'
  ) then raise exception 'Required drawings still need technical review' using errcode='23514';end if;
  update private.site_designs d set client_approved_at=now(),client_approval_source='package'
   where d.organization_id=v_org and d.project_id=p_project_id and d.status='approved'
     and d.client_approved_at is null
     and d.revision=(select max(x.revision) from private.site_designs x
       where x.organization_id=d.organization_id and x.project_id=d.project_id and x.kind=d.kind);
  update private.site_state set stage='client_approved',
     approval_evidence='Client confirmed latest designs in verified portal: '||v_email,
     client_approval_recorded_at=now(),client_approval_recorded_by=null,
     updated_at=now()
    where organization_id=v_org and project_id=p_project_id and stage='design';
 end if;
 insert into private.client_design_decisions
   (organization_id,project_id,customer_id,user_id,email,decision,design_kind,note,design_id,source)
 values(v_org,p_project_id,v_customer,auth.uid(),v_email,p_decision,v_kind,
   left(coalesce(p_note,''),1000),v_current.id,'portal');
end; $$;
revoke all on function public.client_portal_design_decide(uuid,text,text,text) from public,anon;
grant execute on function public.client_portal_design_decide(uuid,text,text,text) to authenticated;


------------------------------------------------------------------------------
-- 4b. Homeowner: the agreed advance request with its verified status.
-- The portal invoice list only covers GST sales invoices; the advance is a
-- proforma request. "Received" comes only from recorded Finance payments.
------------------------------------------------------------------------------
create or replace function public.client_portal_advance_request(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare v_org uuid; v_contract public.contracts; v_link private.project_advance_proformas;
  v_invoice public.invoices; v_received numeric := 0; v_total numeric;
begin
  if not private.client_portal_accessible(p_project_id) then
    raise exception 'Project invitation required' using errcode = '42501'; end if;
  select organization_id into v_org from public.projects where id = p_project_id;
  select * into v_contract from public.contracts
   where organization_id = v_org and project_id = p_project_id and status in ('pending','active')
   order by created_at desc limit 1;
  if v_contract.id is null then return null; end if;
  select * into v_link from private.project_advance_proformas
   where organization_id = v_org and contract_id = v_contract.id;
  if v_link.invoice_id is null then return null; end if;
  select * into v_invoice from public.invoices where organization_id = v_org and id = v_link.invoice_id;
  if v_invoice.id is null or v_invoice.status <> 'issued' then return null; end if;
  v_total := private.finance_decimal(v_invoice.total);
  select coalesce(sum(private.finance_decimal(amount)), 0) into v_received from public.payments
   where organization_id = v_org and contract_id = v_contract.id and status = 'recorded';
  return jsonb_build_object('id', v_invoice.id, 'number', v_invoice.invoice_number,
    'issued_at', v_invoice.issue_date, 'percent', v_link.advance_percent,
    'total', trim_scale(v_total)::text,
    'received', trim_scale(least(v_received, v_total))::text,
    'status', case when v_received >= v_total then 'received'
                   when v_received > 0 then 'partially_received' else 'payment_requested' end);
end
$f$;
revoke all on function public.client_portal_advance_request(uuid) from public, anon;
grant execute on function public.client_portal_advance_request(uuid) to authenticated;


------------------------------------------------------------------------------
-- 4c. Fix: certified stage payment requests never fired for app-authored
-- quotations. The quotation studio saves the plan as
-- "[STAGE_PAYMENT_PLAN]\n<lines>\n[/STAGE_PAYMENT_PLAN]"; the previous body
-- trimmed only spaces, so the first split line was empty and the function
-- returned 0. Only the trim characters change; every other rule is identical
-- (sync_signed_quotation_schedule already trims the same way).
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.certified_stage_payment_requests(p_org uuid, p_project uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 contract public.contracts%ROWTYPE;
 revision public.quotation_revisions%ROWTYPE;
 schedule public.payment_schedules%ROWTYPE;
 item public.payment_schedule_items%ROWTYPE;
 quote_lines text[];
 quote_line text;
 parts text[];
 bindings jsonb;
 bind_row jsonb;
 code text;
 stage_id uuid;
 existing_link uuid;
 qualified boolean;
 request_id uuid;
 number text;
 snapshot jsonb;
 issued_count integer:=0;
 total_percent numeric:=0;
 expected_percent numeric;
 index_no integer;
BEGIN
 -- Serialize concurrent certification and link activity against the contract.
 SELECT * INTO contract FROM public.contracts
 WHERE organization_id=p_org AND project_id=p_project AND status='active'
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF (SELECT count(*) FROM public.contracts
      WHERE organization_id=p_org AND project_id=p_project AND status='active')<>1
 THEN RETURN 0; END IF;
 IF contract.id IS NULL OR NOT private.project_agreement_authorized(p_org,p_project)
 THEN RETURN 0; END IF;
 SELECT * INTO revision FROM public.quotation_revisions
 WHERE organization_id=p_org AND id=contract.revision_id
   AND status='issued';
 IF revision.id IS NULL THEN RETURN 0; END IF;
 SELECT * INTO schedule FROM public.payment_schedules
 WHERE organization_id=p_org AND contract_id=contract.id AND status='active'
 ORDER BY activated_at DESC NULLS LAST,id LIMIT 1;
 IF schedule.id IS NULL OR
   private.finance_decimal(schedule.basis_value)<>private.contract_value(contract.id)
 THEN RETURN 0; END IF;
 -- Payment milestones MUST be the signed quotation's exact lines, not a
 -- similarly named hand-entered finance schedule or a newer sales quote.
 IF (length(revision.terms)-length(replace(revision.terms,'[STAGE_PAYMENT_PLAN]','')))
    <>length('[STAGE_PAYMENT_PLAN]') OR
    (length(revision.terms)-length(replace(revision.terms,'[/STAGE_PAYMENT_PLAN]','')))
    <>length('[/STAGE_PAYMENT_PLAN]')
 THEN RETURN 0; END IF;
 quote_lines:=regexp_split_to_array(btrim(split_part(split_part(
   revision.terms,'[STAGE_PAYMENT_PLAN]',2),'[/STAGE_PAYMENT_PLAN]',1),E' \t\r\n'),
   E'\r?\n');
 IF array_length(quote_lines,1) IS NULL OR array_length(quote_lines,1)>40
 THEN RETURN 0; END IF;

 -- Optional stage-code mapping captured in the immutable accepted quote.
 -- Without it, a manager can link the existing payment item to the LAST
 -- certifiable stage via construction_stage_record_command.
 IF strpos(revision.terms,'[STAGE_PAYMENT_LINKS]')>0 THEN
   BEGIN
    bindings:=btrim(split_part(split_part(revision.terms,
       '[STAGE_PAYMENT_LINKS]',2),'[/STAGE_PAYMENT_LINKS]',1))::jsonb;
   EXCEPTION WHEN invalid_text_representation THEN RETURN 0;
   END;
   IF jsonb_typeof(bindings)<>'array' OR
      jsonb_array_length(bindings)<>array_length(quote_lines,1)
   THEN RETURN 0; END IF;
 END IF;
 IF (SELECT count(*) FROM public.payment_schedule_items
     WHERE organization_id=p_org AND contract_id=contract.id
       AND schedule_id=schedule.id) <> array_length(quote_lines,1)
 THEN RETURN 0; END IF;

 -- Validate ALL quoted rows before creating ANY request.
 FOR item IN SELECT * FROM public.payment_schedule_items
    WHERE organization_id=p_org AND contract_id=contract.id
      AND schedule_id=schedule.id ORDER BY sort_order LOOP
   index_no:=item.sort_order+1;
   IF index_no NOT BETWEEN 1 AND array_length(quote_lines,1)
   THEN RETURN 0; END IF;
   quote_line:=btrim(quote_lines[index_no]);
   parts:=regexp_match(quote_line,'^(.+)\|([0-9]+(\.[0-9]{1,2})?)$');
   IF parts IS NULL OR item.label<>btrim(parts[1])
     OR item.calculation_type<>'percentage'
     OR private.finance_decimal(item.value)<>parts[2]::numeric
   THEN RETURN 0; END IF;
   total_percent:=total_percent+parts[2]::numeric;
 END LOOP;
 IF abs(total_percent-100)>0.001 THEN RETURN 0; END IF;

 FOR item IN SELECT * FROM public.payment_schedule_items
    WHERE organization_id=p_org AND contract_id=contract.id
      AND schedule_id=schedule.id ORDER BY sort_order LOOP
  qualified:=false;
  index_no:=item.sort_order;
  -- Agreement and advance belong to the pre-construction payment flow,
  -- not to construction stage certification. Existing advance proformas
  -- are the only payment request for those pre-work milestones.
  IF index_no=0 AND (item.label ~* '(advance|agreement|booking)'
    OR item.due_trigger ~* '(advance|agreement|booking)') THEN
    CONTINUE;
  END IF;
  bind_row:=CASE WHEN bindings IS NOT NULL THEN bindings->index_no ELSE NULL END;
  IF bind_row IS NOT NULL AND jsonb_typeof(bind_row)<>'array' THEN
   CONTINUE;
  END IF;
  IF bind_row IS NOT NULL AND jsonb_array_length(bind_row)>0 THEN
   qualified:=true;
   -- Every bound stage must exist in this precise project, and possess
   -- CURRENT independent QC certification. Never treat UI status as proof.
   FOR code IN SELECT value FROM jsonb_array_elements_text(bind_row) LOOP
    SELECT id INTO stage_id FROM private.construction_project_stages
    WHERE organization_id=p_org AND project_id=p_project AND instance_code=code;
    IF stage_id IS NULL OR NOT private.construction_stage_current(
      p_org,p_project,stage_id)
    THEN qualified:=false; EXIT; END IF;
   END LOOP;
  ELSE
   -- Legacy contract: only an explicitly manager-linked payment milestone.
   SELECT l.stage_id INTO existing_link
   FROM private.construction_stage_record_links l
   WHERE l.organization_id=p_org AND l.project_id=p_project
     AND l.record_kind='payment' AND l.contract_id=contract.id
     AND l.payment_item_id=item.id
   ORDER BY l.sequence DESC LIMIT 1;
   qualified:=existing_link IS NOT NULL
     AND private.construction_stage_current(p_org,p_project,existing_link);
  END IF;
  IF NOT qualified THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_requests r
    WHERE r.organization_id=p_org AND r.schedule_item_id=item.id)
  -- A manually voided request must NOT be recreated by an unrelated
  -- certification. Finance can resolve the cancellation deliberately.
  THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.invoice_items il
    JOIN public.invoices inv ON inv.id=il.invoice_id
      AND inv.organization_id=il.organization_id
    WHERE il.organization_id=p_org AND il.source_type='milestone'
      AND il.source_id=item.id AND inv.status='issued')
  THEN CONTINUE; END IF;
  -- Legacy GST invoice authored for this exact quotation stage also wins.
  IF EXISTS(SELECT 1 FROM private.gst_stage_invoice_links l
    JOIN private.gst_business_documents d ON d.id=l.invoice_id
      AND d.organization_id=l.organization_id
    WHERE l.organization_id=p_org AND l.project_id=p_project
      AND l.revision_id=contract.revision_id AND l.stage_number=index_no+1
      AND d.status='issued')
  THEN CONTINUE; END IF;

  number:=private.finance_number(p_org,'payment_request','PR');
  snapshot:=private.finance_header(contract.id)||jsonb_build_object(
   'kind','payment_request','number',number,'date',current_date,
   'due_date',item.due_date,'notes',
   'Automatically requested after the last linked construction stage received independent quality certification. Not a GST tax invoice or a receipt.',
   'terms','Quoted milestone '||trim_scale(private.finance_decimal(item.value))||'%',
   'total',item.expected_amount,
   'lines',jsonb_build_array(jsonb_build_object(
     'description',item.label,'quantity','1','unit','milestone',
     'rate',item.expected_amount,'amount',item.expected_amount)));
  INSERT INTO public.payment_requests(
   organization_id,contract_id,schedule_item_id,request_number,amount,
   due_date,note,document_snapshot,created_by
  ) VALUES(
   p_org,contract.id,item.id,number,item.expected_amount,item.due_date,
   'Automatically issued from signed quotation and certified project stages',
   snapshot,auth.uid())
  ON CONFLICT DO NOTHING RETURNING id INTO request_id;
  IF request_id IS NOT NULL THEN
   issued_count:=issued_count+1;
   PERFORM private.crm_audit(p_org,'payment_request.issued_after_stage_certification',
      'payment_requests',request_id);
  END IF;
 END LOOP;
 RETURN issued_count;
END;
$function$;
revoke all on function private.certified_stage_payment_requests(uuid,uuid) from public,anon,authenticated;

-- Staff "client_approve" of the whole package stamps the drawings it covered.
create or replace function private.site_state_package_approval_stamp()
returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  if new.stage = 'client_approved' and old.stage is distinct from 'client_approved' then
    update private.site_designs d set client_approved_at = coalesce(new.client_approval_recorded_at, now()),
      client_approval_source = 'package'
    where d.organization_id = new.organization_id and d.project_id = new.project_id
      and d.status = 'approved' and d.client_approved_at is null
      and d.revision = (select max(x.revision) from private.site_designs x
        where x.organization_id = d.organization_id and x.project_id = d.project_id and x.kind = d.kind);
  end if;
  return new;
end
$f$;
drop trigger if exists site_state_package_approval_stamp on private.site_state;
create trigger site_state_package_approval_stamp after update of stage on private.site_state
  for each row execute function private.site_state_package_approval_stamp();

------------------------------------------------------------------------------
-- 5. Owner test-data reset covers the new project-scoped tables
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.test_reset_targets()
 RETURNS regclass[]
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT pg_catalog.array_remove(ARRAY[
  'private.automation_email_payloads'::regclass,
  'private.client_design_decisions'::regclass,
  'private.client_payment_proofs'::regclass,
  'private.client_project_access'::regclass,
  'private.construction_project_roles'::regclass,
  'private.construction_project_stages'::regclass,
  'private.construction_project_workflows'::regclass,
  'private.construction_role_history'::regclass,
  'private.construction_stage_clearances'::regclass,
  'private.construction_stage_dependencies'::regclass,
  'private.construction_stage_execution'::regclass,
  'private.construction_stage_inspections'::regclass,
  'private.construction_stage_qc_item_reviews'::regclass,
  'private.construction_stage_record_links'::regclass,
  'private.construction_stage_reviews'::regclass,
  'private.construction_stage_tasks'::regclass,
  'private.gst_business_documents'::regclass,
  'private.gst_customer_invoice_links'::regclass,
  'private.gst_invoice_document_layouts'::regclass,
  'private.gst_stage_invoice_links'::regclass,
  'private.gst_won_lead_invoice_links'::regclass,
  'private.labour_disbursements'::regclass,
  'private.lead_quotation_links'::regclass,
  'private.project_advance_proformas'::regclass,
  'private.project_advance_requirements'::regclass,
  'private.project_agreement_events'::regclass,
  pg_catalog.to_regclass('private.project_client_requests'),
  'private.project_preflight'::regclass,
  'private.project_curing_plans'::regclass,
  'private.project_stage_optional_items'::regclass,
  'private.project_work_item_events'::regclass,
  'private.project_quote_timeline_sources'::regclass,
  'private.project_stage_activity_progress'::regclass,
  'private.project_stage_item_schedule'::regclass,
  'private.project_stage_item_schedule_history'::regclass,
  'private.project_stage_guidance'::regclass,
  'private.project_stage_owner_history'::regclass,
  'private.project_stage_owner_overrides'::regclass,
  'private.quotation_final_selections'::regclass,
  'private.quotation_public_limits'::regclass,
  'private.quotation_share_secrets'::regclass,
  'private.site_checks'::regclass,
  'private.site_designs'::regclass,
  'private.site_events'::regclass,
  'private.site_gate'::regclass,
  'private.site_manager_updates'::regclass,
  'private.site_material_needs'::regclass,
  'private.site_material_quantity_revisions'::regclass,
  'private.site_media'::regclass,
  'private.site_report_reviews'::regclass,
  'private.site_reports'::regclass,
  'private.site_state'::regclass,
  'private.site_team'::regclass,
  'public.change_order_items'::regclass,
  'public.change_orders'::regclass,
  'public.communication_consents'::regclass,
  'public.contracts'::regclass,
  'public.customer_contacts'::regclass,
  'public.customers'::regclass,
  'public.email_deliveries'::regclass,
  'public.estimation_recipe_item_costs'::regclass,
  'public.estimation_recipe_items'::regclass,
  'public.execution_estimate_documents'::regclass,
  'public.execution_estimate_line_costs'::regclass,
  'public.execution_estimate_lines'::regclass,
  'public.execution_estimate_revisions'::regclass,
  'public.execution_estimate_scope_items'::regclass,
  'public.execution_estimates'::regclass,
  'public.execution_plan_revisions'::regclass,
  'public.execution_plans'::regclass,
  'public.goods_receipt_items'::regclass,
  'public.goods_receipts'::regclass,
  'public.handover_records'::regclass,
  'public.inventory_counts'::regclass,
  'public.inventory_locations'::regclass,
  'public.inventory_lot_costs'::regclass,
  'public.inventory_lots'::regclass,
  'public.inventory_movements'::regclass,
  'public.inventory_transactions'::regclass,
  'public.invoice_items'::regclass,
  'public.invoices'::regclass,
  'public.lead_activities'::regclass,
  'public.lead_followups'::regclass,
  'public.leads'::regclass,
  'public.material_cost_revisions'::regclass,
  'public.material_issue_request_items'::regclass,
  'public.material_issue_requests'::regclass,
  'public.material_unit_conversions'::regclass,
  'public.material_variants'::regclass,
  'public.materials'::regclass,
  'public.payment_allocations'::regclass,
  'public.payment_requests'::regclass,
  'public.payment_schedule_items'::regclass,
  'public.payment_schedules'::regclass,
  'public.payments'::regclass,
  'public.project_areas'::regclass,
  'public.project_execution_events'::regclass,
  'public.project_execution_members'::regclass,
  'public.project_inspections'::regclass,
  'public.project_milestones'::regclass,
  'public.project_snags'::regclass,
  'public.project_tasks'::regclass,
  'public.projects'::regclass,
  'public.purchase_order_costs'::regclass,
  'public.purchase_order_item_costs'::regclass,
  'public.purchase_order_items'::regclass,
  'public.purchase_orders'::regclass,
  'public.purchase_requisition_items'::regclass,
  'public.purchase_requisition_sources'::regclass,
  'public.purchase_requisitions'::regclass,
  'public.quotation_customer_responses'::regclass,
  'public.quotation_item_costs'::regclass,
  'public.quotation_items'::regclass,
  'public.quotation_revisions'::regclass,
  'public.quotation_share_links'::regclass,
  'public.quotation_studio_attachments'::regclass,
  'public.quotations'::regclass,
  'public.receipts'::regclass,
  'public.rfq_items'::regclass,
  'public.rfq_vendors'::regclass,
  'public.rfqs'::regclass,
  'public.site_visits'::regclass,
  'public.subcontractor_work_order_costs'::regclass,
  'public.subcontractor_work_orders'::regclass,
  'public.task_dependencies'::regclass,
  'public.vendor_contacts'::regclass,
  'public.vendor_execution_profiles'::regclass,
  'public.vendor_materials'::regclass,
  'public.vendor_quote_items'::regclass,
  'public.vendor_quotes'::regclass,
  'public.vendors'::regclass,
  'public.work_measurement_costs'::regclass,
  'public.work_measurements'::regclass,
  'public.work_packages'::regclass
]::regclass[],NULL) $function$;


commit;
