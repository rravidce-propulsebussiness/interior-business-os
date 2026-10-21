-- Stage work is recorded per item; checks reuse the canonical site_checks register.
-- Quotation payment schedules and stage finance links are deliberately untouched.
create table if not exists private.project_stage_activity_progress (
  organization_id uuid not null,
  project_id uuid not null,
  stage_id uuid not null,
  activity_index integer not null check (activity_index >= 0),
  status text not null default 'completed' check (status in ('completed','pending')),
  notes text not null default '' check (length(notes) <= 2000),
  photo_id uuid,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id,project_id,stage_id,activity_index),
  foreign key (organization_id,project_id,stage_id) references private.construction_project_stages(organization_id,project_id,id) on delete cascade,
  foreign key (organization_id,project_id,photo_id) references private.site_media(organization_id,project_id,id)
);
alter table private.site_checks add column if not exists photo_id uuid;
do $$
begin
 if not exists (select 1 from pg_constraint where conname='site_checks_photo_project_fkey') then
  alter table private.site_checks add constraint site_checks_photo_project_fkey
    foreign key (organization_id,project_id,photo_id)
    references private.site_media(organization_id,project_id,id);
 end if;
end $$;

-- The form now sends the same canonical unit spelling used in the database.
-- No constraint weakening or previously stored material mutation is needed.
create or replace function public.project_stage_checklist_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if not private.site_access(p_org,p_project)
   or not private.site_allowed(p_org,p_project,array['manager','site_engineer','quality_inspector'])
 then raise exception 'Project checklist unavailable' using errcode='42501'; end if;
 return jsonb_build_object(
  'work',coalesce((select jsonb_agg(jsonb_build_object(
    'stage_id',w.stage_id,'index',w.activity_index,'status',w.status,
    'notes',w.notes,'photo_id',w.photo_id,'updated_at',w.updated_at
  )) from private.project_stage_activity_progress w
   where w.organization_id=p_org and w.project_id=p_project),'[]'::jsonb),
  'checks',coalesce((select jsonb_agg(jsonb_build_object(
    'stage_id',l.stage_id,'title',c.title,'id',c.id,'status',c.status,
    'notes',c.notes,'photo_id',c.photo_id,'checked_at',c.checked_at
  )) from private.construction_stage_record_links l
    join private.site_checks c on c.organization_id=l.organization_id
      and c.project_id=l.project_id and c.id=l.check_id
    where l.organization_id=p_org and l.project_id=p_project
      and l.record_kind='check'),'[]'::jsonb)
 );
end
$function$;

create or replace function public.project_stage_checklist_command(
 p_org uuid,p_project uuid,p_stage uuid,p_kind text,p_index integer,
 p_title text,p_action text,p_note text default '',p_photo uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_stage private.construction_project_stages;v_photo text;v_check uuid;
 v_label text;v_status text;
begin
 if not private.site_access(p_org,p_project) then
  raise exception 'Project unavailable' using errcode='42501';end if;
 if (select stage from private.site_state
   where organization_id=p_org and project_id=p_project) is distinct from 'execution'
 then raise exception 'Project execution must be active' using errcode='42501';end if;
 if p_kind not in ('work','check') or p_action not in ('done','reopen','failed')
   or length(coalesce(p_note,''))>2000 then
  raise exception 'Invalid checklist update' using errcode='22023';end if;
 if not private.site_allowed(p_org,p_project,
   case when p_kind='work' then array['manager','site_engineer']
        else array['manager','site_engineer','quality_inspector'] end)
 then raise exception 'Insufficient site role' using errcode='42501';end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project for update;
 select * into v_stage from private.construction_project_stages
  where organization_id=p_org and project_id=p_project and id=p_stage;
 if not found then raise exception 'Stage unavailable' using errcode='22023';end if;
 if p_photo is not null then
  select m.mime into v_photo from private.site_media m
   where m.organization_id=p_org and m.project_id=p_project
     and m.id=p_photo;
  if v_photo not in ('image/jpeg','image/png','image/webp') or v_photo is null then
   raise exception 'Select a photo uploaded to this project' using errcode='22023';end if;
 end if;
 if p_kind='work' then
  if p_action='failed' or p_index is null or p_index<0
    or p_index>=jsonb_array_length(coalesce(v_stage.activities,'[]'::jsonb)) then
   raise exception 'Invalid stage activity' using errcode='22023';end if;
  insert into private.project_stage_activity_progress(
    organization_id,project_id,stage_id,activity_index,status,notes,photo_id,updated_by)
  values(p_org,p_project,p_stage,p_index,
    case when p_action='done' then 'completed' else 'pending' end,
    coalesce(p_note,''),p_photo,auth.uid())
  on conflict (organization_id,project_id,stage_id,activity_index)
  do update set status=excluded.status,notes=excluded.notes,
    photo_id=coalesce(excluded.photo_id,project_stage_activity_progress.photo_id),
    updated_by=excluded.updated_by,updated_at=now();
  perform private.site_log(p_org,p_project,'stage.activity.'||p_action,p_stage);
 else
  v_label=trim(coalesce(p_title,''));
  if length(v_label) not between 3 and 200 or p_action='done' and p_photo is null then
   raise exception 'Check title and photo evidence are required' using errcode='22023';end if;
  -- A stage check always updates the canonical site_checks record, never a parallel checklist.
  select c.id into v_check from private.site_checks c
   join private.construction_stage_record_links l
    on l.organization_id=c.organization_id and l.project_id=c.project_id
     and l.check_id=c.id and l.record_kind='check'
   where c.organization_id=p_org and c.project_id=p_project
    and l.stage_id=p_stage and lower(c.title)=lower(v_label)
   order by c.created_at desc limit 1;
  if v_check is null then
   -- Reuse an earlier check with the same name if it is not attached to a different stage.
   select c.id into v_check from private.site_checks c
    where c.organization_id=p_org and c.project_id=p_project and lower(c.title)=lower(v_label)
      and not exists(select 1 from private.construction_stage_record_links l
       where l.organization_id=p_org and l.project_id=p_project and l.check_id=c.id
        and l.record_kind='check')
    order by c.created_at desc limit 1;
  end if;
  if v_check is null then
   insert into private.site_checks(organization_id,project_id,title,notes,created_by)
    values(p_org,p_project,v_label,'',auth.uid()) returning id into v_check;
  end if;
  if not exists(select 1 from private.construction_stage_record_links
    where organization_id=p_org and project_id=p_project and stage_id=p_stage
      and record_kind='check' and check_id=v_check) then
    insert into private.construction_stage_record_links(
      organization_id,project_id,stage_id,record_kind,check_id,linked_by)
    values(p_org,p_project,p_stage,'check',v_check,auth.uid());
  end if;
  v_status=case p_action when 'done' then 'passed' when 'failed' then 'failed'
    else 'recheck' end;
  update private.site_checks set status=v_status,notes=coalesce(p_note,''),
    photo_id=coalesce(p_photo,photo_id),checked_by=auth.uid(),checked_at=now()
    where organization_id=p_org and project_id=p_project and id=v_check;
  perform private.site_log(p_org,p_project,'check.'||v_status,v_check);
 end if;
 return jsonb_build_object('saved',true);
end
$function$;
revoke all on function public.project_stage_checklist_read(uuid,uuid) from public,anon;
revoke all on function public.project_stage_checklist_command(uuid,uuid,uuid,text,integer,text,text,text,uuid) from public,anon;
grant execute on function public.project_stage_checklist_read(uuid,uuid) to authenticated;
grant execute on function public.project_stage_checklist_command(uuid,uuid,uuid,text,integer,text,text,text,uuid) to authenticated;


-- One material request may contain several separately tracked quantities.
-- All rows are inserted in a single database transaction.
create or replace function public.project_site_material_batch(
 p_org uuid,p_project uuid,p_items jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_item jsonb;v_id uuid;v_qty numeric;v_unit text;v_total integer:=0;
begin
 if not private.site_access(p_org,p_project) or
  not private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement'])
 then raise exception 'Material access denied' using errcode='42501';end if;
 if (select stage from private.site_state where organization_id=p_org and project_id=p_project)
  is distinct from 'execution'
 then raise exception 'Project execution must be active' using errcode='42501';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 12
  or octet_length(p_items::text)>12000 then
  raise exception 'Choose between 1 and 12 materials' using errcode='22023';end if;
 perform 1 from public.projects where id=p_project and organization_id=p_org for update;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item) is distinct from 'object'
    or (v_item - array['item','quantity','unit','notes']) <> '{}'::jsonb
    or length(trim(coalesce(v_item->>'item',''))) not between 2 and 200
    or length(coalesce(v_item->>'notes',''))>3000
    or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,8}([.][0-9]{1,3})?$'
  then raise exception 'Invalid material line' using errcode='22023';end if;
  v_qty=(v_item->>'quantity')::numeric;
  v_unit=v_item->>'unit';
  if v_qty<=0 or v_unit not in
    ('bags','kg','tonnes','litres','nos','sqft','sqm','cft','cum','yards','metres','feet')
  then raise exception 'Invalid material quantity or unit' using errcode='22023';end if;
  insert into private.site_material_needs(
    organization_id,project_id,item,quantity,unit,notes,requested_by)
   values(p_org,p_project,trim(v_item->>'item'),v_qty,v_unit,
    coalesce(v_item->>'notes',''),auth.uid()) returning id into v_id;
  perform private.site_log(p_org,p_project,'material.requested',v_id);
  v_total=v_total+1;
 end loop;
 return jsonb_build_object('count',v_total);
end
$function$;
revoke all on function public.project_site_material_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.project_site_material_batch(uuid,uuid,jsonb) to authenticated;
