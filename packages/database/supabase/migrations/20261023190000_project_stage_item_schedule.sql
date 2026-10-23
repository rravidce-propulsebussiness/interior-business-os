-- Planned dates for existing construction work/check/material/QC references.
-- A schedule does not activate a stage, approve QC, order materials or request payment.
-- Organization and project isolation remain in private schema and RPC guards.
create table if not exists private.project_stage_item_schedule(
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  item_kind text not null check(item_kind in ('work','check','test','qc','material')),
  item_index integer not null check(item_index between 0 and 49),
  item_title text not null check(length(trim(item_title)) between 2 and 180),
  planned_start date not null,
  planned_finish date not null,
  note text not null default '' check(length(note)<=500),
  version integer not null default 1 check(version>0),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(organization_id,project_id,stage_id,item_kind,item_index),
  foreign key(organization_id,project_id,stage_id)
    references private.construction_project_stages(organization_id,project_id,id)
    on delete cascade,
  constraint schedule_date_order check(planned_finish>=planned_start)
);
create index if not exists project_stage_item_schedule_dates
  on private.project_stage_item_schedule(organization_id,project_id,planned_start,planned_finish);
alter table private.project_stage_item_schedule enable row level security;
revoke all on private.project_stage_item_schedule from public,anon,authenticated;

create table if not exists private.project_stage_item_schedule_history(
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  item_kind text not null,
  item_index integer not null,
  item_title text not null,
  planned_start date not null,
  planned_finish date not null,
  note text not null,
  version integer not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  foreign key(organization_id,project_id,stage_id)
    references private.construction_project_stages(organization_id,project_id,id)
    on delete cascade
);
create index if not exists project_stage_item_schedule_history_project
  on private.project_stage_item_schedule_history(organization_id,project_id,changed_at desc);
alter table private.project_stage_item_schedule_history enable row level security;
revoke all on private.project_stage_item_schedule_history from public,anon,authenticated;

create or replace function private.project_can_plan_item(org uuid,project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.construction_project_access(org,project)
  and (
   private.construction_can_manage(org,project)
   or private.site_allowed(org,project,array['manager','site_engineer','supervisor'])
   or exists(
      select 1 from private.construction_project_roles r
      where r.organization_id=org and r.project_id=project
        and r.user_id=(select auth.uid()) and r.active
        and r.role in ('site_engineer','site_supervisor','project_manager')
   )
  ),false);
$$;

create or replace function public.project_stage_item_schedule_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.construction_project_access(p_org,p_project)
 then raise exception 'Project schedule unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'stage_id',s.stage_id,'kind',s.item_kind,'index',s.item_index,
   'title',s.item_title,'planned_start',s.planned_start,
   'planned_finish',s.planned_finish,'note',s.note,'version',s.version)
   order by s.planned_start,s.stage_id,s.item_kind,s.item_index)
   from private.project_stage_item_schedule s
   where s.organization_id=p_org and s.project_id=p_project),'[]'::jsonb);
end;
$$;

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
begin
 if auth.uid() is null or not private.project_can_plan_item(p_org,p_project)
 then raise exception 'Only an authorized owner, project manager or site engineer may plan work'
 using errcode='42501';end if;
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
revoke all on function private.project_can_plan_item(uuid,uuid) from public,anon;
revoke all on function public.project_stage_item_schedule_read(uuid,uuid) from public,anon;
revoke all on function public.project_stage_item_schedule_save(uuid,uuid,uuid,text,integer,text,date,date,text,integer) from public,anon;
grant execute on function public.project_stage_item_schedule_read(uuid,uuid) to authenticated;
grant execute on function public.project_stage_item_schedule_save(uuid,uuid,uuid,text,integer,text,date,date,text,integer) to authenticated;
