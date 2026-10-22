-- In-house/assigned QC engineer visits the site and reviews each existing stage check.
-- QC findings are append-only; no duplicate work or site checklist is created.
create table if not exists private.construction_stage_qc_item_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null references private.construction_project_stages(id),
 check_index integer not null check (check_index >= 0),
 check_title text not null,
 decision text not null check (decision in ('passed','failed')),
 notes text not null default '',
 photo_id uuid not null,
 reviewed_by uuid not null,
 onsite_confirmed boolean not null check (onsite_confirmed),
 reviewed_at timestamptz not null default now()
);
create index if not exists stage_qc_reviews_latest_idx
 on private.construction_stage_qc_item_reviews
 (organization_id,project_id,stage_id,check_index,reviewed_at desc,id desc);
alter table private.construction_stage_qc_item_reviews enable row level security;
revoke all on private.construction_stage_qc_item_reviews from public,anon,authenticated;

create or replace function private.construction_stage_has_open_qc_failures(
 p_org uuid,p_project uuid,p_stage uuid
) returns boolean
language sql stable security definer set search_path = ''
as $body$
 select exists (
   select 1 from (
     select distinct on (r.check_index) r.decision
     from private.construction_stage_qc_item_reviews r
     where r.organization_id=p_org and r.project_id=p_project and r.stage_id=p_stage
     order by r.check_index,r.reviewed_at desc,r.id desc
   ) latest where latest.decision='failed'
 )
$body$;
revoke all on function private.construction_stage_has_open_qc_failures(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.construction_stage_qc_item_read(
 p_org uuid,p_project uuid
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $body$
begin
 if auth.uid() is null or not private.construction_project_access(p_org,p_project) then
  raise exception 'Project unavailable' using errcode='42501';
 end if;
 if not private.site_allowed(p_org,p_project,
   array['manager','site_engineer','quality_inspector','structural_engineer'])
   and not exists (select 1 from private.construction_project_roles member
     where member.organization_id=p_org and member.project_id=p_project
       and member.user_id=auth.uid() and member.active
       and member.role in ('quality_inspector','structural_engineer')) then
  return jsonb_build_object('can_review',false,'reviews','[]'::jsonb);
 end if;
 return jsonb_build_object(
  'can_review',exists(select 1 from private.construction_project_roles member
    where member.organization_id=p_org and member.project_id=p_project
      and member.user_id=auth.uid() and member.active and member.role='quality_inspector'),
  'reviews',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',r.id,'stage_id',r.stage_id,'index',r.check_index,
   'title',r.check_title,'decision',r.decision,'notes',r.notes,
   'photo_id',r.photo_id,'reviewed_by',r.reviewed_by,
   'reviewed_at',r.reviewed_at
  ) order by r.reviewed_at desc,r.id desc)
  from (select * from private.construction_stage_qc_item_reviews
    where organization_id=p_org and project_id=p_project
    order by reviewed_at desc,id desc limit 1000) r
 ),'[]'::jsonb));
end
$body$;
revoke all on function public.construction_stage_qc_item_read(uuid,uuid) from public,anon;
grant execute on function public.construction_stage_qc_item_read(uuid,uuid) to authenticated;

create or replace function public.construction_stage_qc_item_command(
 p_org uuid,p_project uuid,p_stage uuid,p_index integer,
 p_decision text,p_notes text,p_photo uuid,p_visited boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $body$
declare
 v_stage private.construction_project_stages;
 v_existing private.construction_stage_execution;
 v_check private.site_checks;
 v_title text;
 v_media text;
 v_id uuid;
 v_actor uuid := auth.uid();
begin
 if v_actor is null or not private.construction_project_access(p_org,p_project) then
  raise exception 'Project unavailable' using errcode='42501';
 end if;
 -- QC may be performed by a company employee assigned as QC inspector for this project.
 -- No external inspector or special outside-agency account is required.
 if not exists (
   select 1 from private.construction_project_roles role
   where role.organization_id=p_org and role.project_id=p_project
    and role.user_id=v_actor and role.active and role.role='quality_inspector'
 ) then raise exception 'Assign this project QC inspector before recording on-site QC' using errcode='42501';
 end if;
 if p_visited is distinct from true
   or p_decision not in ('passed','failed')
   or p_index is null or p_index < 0 or p_photo is null
   or length(trim(coalesce(p_notes,'')))>2000
   or (p_decision='failed' and length(trim(coalesce(p_notes,'')))<10)
 then raise exception 'Visit the site, include inspection photo, and explain any failure' using errcode='22023';
 end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;
 select * into v_stage from private.construction_project_stages
 where organization_id=p_org and project_id=p_project and id=p_stage;
 if not found or p_index >= jsonb_array_length(coalesce(v_stage.inspection_topics,'[]'::jsonb)) then
  raise exception 'Stage checklist item unavailable' using errcode='22023';
 end if;
 select * into v_existing from private.construction_stage_execution
 where organization_id=p_org and project_id=p_project and stage_id=p_stage for update;
 if v_existing.status is distinct from 'ready_for_qc' then
  raise exception 'Site engineer must submit field work for QC before inspection' using errcode='23514';
 end if;
 if private.construction_stage_current(p_org,p_project,p_stage) then
  raise exception 'Certified stage requires a formal corrective-action workflow' using errcode='23514';
 end if;
 v_title := v_stage.inspection_topics->>p_index;
 select c.* into v_check from private.site_checks c
 join private.construction_stage_record_links l on
   l.organization_id=c.organization_id and l.project_id=c.project_id
   and l.check_id=c.id and l.stage_id=p_stage and l.record_kind='check'
 where c.organization_id=p_org and c.project_id=p_project
   and lower(trim(c.title))=lower(trim(v_title))
 order by c.created_at desc,c.id desc limit 1;
 if v_check.id is null then
  raise exception 'Complete the corresponding site check before QC inspection' using errcode='23514';
 end if;
 if p_decision='passed' and v_check.status<>'passed' then
  raise exception 'Site check must be passed again after correction' using errcode='23514';
 end if;
 if p_decision='passed' and v_check.checked_by=v_actor then
  raise exception 'Site check performer cannot QC-approve the same item' using errcode='42501';
 end if;
 select m.mime into v_media from private.site_media m
 where m.organization_id=p_org and m.project_id=p_project and m.id=p_photo;
 if v_media is distinct from 'image/jpeg' and v_media is distinct from 'image/png'
   and v_media is distinct from 'image/webp' then
  raise exception 'Select inspection photo from this project' using errcode='22023';
 end if;
 insert into private.construction_stage_qc_item_reviews(
  organization_id,project_id,stage_id,check_index,check_title,
  decision,notes,photo_id,reviewed_by,onsite_confirmed
 ) values(p_org,p_project,p_stage,p_index,v_title,p_decision,trim(coalesce(p_notes,'')),
   p_photo,v_actor,true) returning id into v_id;
 if p_decision='failed' then
   -- Reopen exactly the failed site-check item; previous QC findings remain immutable.
   update private.site_checks set status='recheck'
    where organization_id=p_org and project_id=p_project and id=v_check.id;
   update private.construction_stage_execution
     set status='in_progress',field_finished_at=null,
         updated_by=v_actor,updated_at=now()
     where organization_id=p_org and project_id=p_project and stage_id=p_stage;
 end if;
 perform private.site_log(p_org,p_project,'construction.qc.item.'||p_decision,v_id);
 return jsonb_build_object('saved',true,'review_id',v_id,'decision',p_decision,
   'rework_required',p_decision='failed');
end
$body$;
revoke all on function public.construction_stage_qc_item_command(
 uuid,uuid,uuid,integer,text,text,uuid,boolean) from public,anon;
grant execute on function public.construction_stage_qc_item_command(
 uuid,uuid,uuid,integer,text,text,uuid,boolean) to authenticated;
