-- Restrict staff work-date edits without changing existing project planning
-- or creating another checklist. Owners/managers retain long-range control.
-- "Today" uses the Hyderabad project operating timezone, not UTC.
create or replace function public.project_stage_item_schedule_save(
 p_org uuid,p_project uuid,p_stage uuid,p_kind text,p_index integer,
 p_title text,p_start date,p_finish date,p_note text default '',
 p_expected_version integer default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_stage private.construction_project_stages;
 v_existing private.project_stage_item_schedule;
 v_expected text;
 v_items jsonb;
 v_version integer;
 v_full_planner boolean;
 v_today date;
begin
 if auth.uid() is null or not private.project_can_plan_item(p_org,p_project)
 then raise exception 'Only an authorized owner, project manager or site engineer may plan work'
 using errcode='42501';end if;
 -- Business owners and project managers may plan the full agreed timeline.
 -- A site engineer/supervisor has a rolling two-day window (today/tomorrow).
 -- This is a database permission, not just a disabled date-picker.
 v_full_planner=coalesce(private.construction_can_manage(p_org,p_project),false);
 v_today=(now() at time zone 'Asia/Kolkata')::date;
 if not v_full_planner and
    (p_start<v_today or p_finish>v_today+1) then
  raise exception 'Site engineers may plan only today and tomorrow. Ask the owner or project manager for longer-range plans'
   using errcode='42501';
 end if;
 if p_kind not in ('work','check','test','qc','material')
  or p_index is null or p_index<0 or p_index>=50
  or p_title is null or length(trim(p_title)) not between 2 and 180
  or p_start is null or p_finish is null or p_finish<p_start
  or length(coalesce(p_note,''))>500
  or p_expected_version is null or p_expected_version<0
 then raise exception 'Invalid planned work dates' using errcode='22023';end if;

 perform 1 from public.projects
  where organization_id=p_org and id=p_project and status='active' for update;
 if not found then raise exception 'Active project not found' using errcode='42501';end if;
 select * into v_stage from private.construction_project_stages
  where organization_id=p_org and project_id=p_project and id=p_stage;
 if not found then raise exception 'Stage not found in this project' using errcode='22023';end if;
 -- Verify that submitted work/check titles refer to the ORIGINAL stage item.
 -- They must never fabricate a second execution checklist record.
 if p_kind='work' then
  v_items=v_stage.activities;
 elsif p_kind in ('check','test','qc') then
  v_items=v_stage.inspection_topics;
 else
  select materials into v_items from private.project_stage_guidance
   where organization_id=p_org and project_id=p_project and stage_id=p_stage;
 end if;
 if p_kind<>'material' or v_items is not null then
  if p_index>=jsonb_array_length(coalesce(v_items,'[]'::jsonb)) then
   raise exception 'Schedule references a removed stage item' using errcode='22023';end if;
  v_expected=v_items->>p_index;
  if v_expected is distinct from trim(p_title) then
   raise exception 'Stage item changed; refresh the project timeline' using errcode='40001';end if;
 end if;
 -- Materials without a frozen quote-specific list use the standard stage
 -- guidance already displayed in the project page, addressed by index/title.
 -- Only their dates are recorded here; no new procurement record is created.
 select * into v_existing from private.project_stage_item_schedule
  where organization_id=p_org and project_id=p_project and stage_id=p_stage
   and item_kind=p_kind and item_index=p_index for update;
 if coalesce(v_existing.version,0)<>p_expected_version then
  raise exception 'Schedule changed; refresh before editing' using errcode='40001';end if;
 v_version=p_expected_version+1;
 insert into private.project_stage_item_schedule(
  organization_id,project_id,stage_id,item_kind,item_index,item_title,
  planned_start,planned_finish,note,version,updated_by)
 values(p_org,p_project,p_stage,p_kind,p_index,trim(p_title),
  p_start,p_finish,coalesce(p_note,''),v_version,auth.uid())
 on conflict(organization_id,project_id,stage_id,item_kind,item_index)
 do update set item_title=excluded.item_title,planned_start=excluded.planned_start,
  planned_finish=excluded.planned_finish,note=excluded.note,
  version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
 insert into private.project_stage_item_schedule_history(
  organization_id,project_id,stage_id,item_kind,item_index,item_title,
  planned_start,planned_finish,note,version,changed_by)
 values(p_org,p_project,p_stage,p_kind,p_index,trim(p_title),
  p_start,p_finish,coalesce(p_note,''),v_version,auth.uid());
 return jsonb_build_object('saved',true,'version',v_version);
end;
$$;
-- Preserve existing authenticated grant; do not grant direct table access.
revoke all on function public.project_stage_item_schedule_save(uuid,uuid,uuid,text,integer,text,date,date,text,integer) from public,anon;
grant execute on function public.project_stage_item_schedule_save(uuid,uuid,uuid,text,integer,text,date,date,text,integer) to authenticated;
