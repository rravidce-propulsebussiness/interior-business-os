-- Construction OS Phase 8: approved next-day stage work, labor and linked material needs.
-- Site daily reports, actual procurement, task progress, and stock stay canonical.
begin;

create table private.construction_tomorrow_plans (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 work_date date not null check(isfinite(work_date)),
 revision integer not null check(revision between 1 and 1000),
 work_summary text not null check(length(trim(work_summary)) between 10 and 3000),
 labor_plan jsonb not null check(jsonb_typeof(labor_plan)='array'
    and jsonb_array_length(labor_plan) between 1 and 20),
 instructions text not null default '' check(length(instructions)<=2500),
 proposed_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,project_id,stage_id,work_date,revision),
 unique(organization_id,project_id,id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id)
);
create index construction_tomorrow_date on private.construction_tomorrow_plans
 (organization_id,project_id,work_date,created_at desc);

-- These are references to existing site_material_needs; not purchase orders.
create table private.construction_tomorrow_materials (
 organization_id uuid not null,
 project_id uuid not null,
 plan_id uuid not null,
 material_id uuid not null references private.site_material_needs(id),
 required_quantity numeric(16,3) not null check(required_quantity>0 and required_quantity<=100000000),
 primary key(organization_id,project_id,plan_id,material_id),
 foreign key(organization_id,project_id,plan_id)
    references private.construction_tomorrow_plans(organization_id,project_id,id)
);
create index construction_tomorrow_material_lookup on
 private.construction_tomorrow_materials(organization_id,project_id,material_id);

create table private.construction_tomorrow_decisions (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 plan_id uuid not null,
 decision text not null check(decision in ('approved','changes_requested','withdrawn')),
 reason text not null check(length(trim(reason)) between 12 and 2500),
 reviewed_by uuid not null references public.profiles(id),
 reviewed_at timestamptz not null default now(),
 foreign key(organization_id,project_id,plan_id)
    references private.construction_tomorrow_plans(organization_id,project_id,id)
);
create index construction_tomorrow_review_order on
 private.construction_tomorrow_decisions(plan_id,sequence desc);

do $$
declare t text;
begin
 foreach t in array array[
  'construction_tomorrow_plans','construction_tomorrow_materials',
  'construction_tomorrow_decisions'
 ] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
  execute format('create trigger construction_tomorrow_immutable before update or delete on private.%I for each row execute function private.ops_immutable()',t);
 end loop;
end$$;

create function private.construction_tomorrow_staff(p_org uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.construction_can_manage(p_org,p_project)
  or private.site_role(p_org,p_project)='site_engineer'
  or exists(select 1 from private.construction_project_roles role
     where role.organization_id=p_org and role.project_id=p_project
       and role.user_id=(select auth.uid()) and role.active
       and role.role in ('site_engineer','supervisor')),false);
$$;

create function private.construction_tomorrow_state(p_org uuid,p_project uuid,p_plan uuid)
returns text language sql stable security definer set search_path='' as $$
 select case
   when not exists(select 1 from private.construction_tomorrow_plans p
      where p.organization_id=p_org and p.project_id=p_project and p.id=p_plan)
     then 'unavailable'
   when exists(
      select 1 from private.construction_tomorrow_plans newer
      join private.construction_tomorrow_plans base on
         base.organization_id=newer.organization_id and
         base.project_id=newer.project_id and
         base.stage_id=newer.stage_id and base.work_date=newer.work_date
       where base.id=p_plan and newer.revision>base.revision)
     then 'superseded'
   else coalesce((
      select d.decision from private.construction_tomorrow_decisions d
      where d.organization_id=p_org and d.project_id=p_project
        and d.plan_id=p_plan order by d.sequence desc limit 1),'submitted')
 end;
$$;

create function public.construction_tomorrow_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean;
begin
 if not private.construction_tomorrow_staff(p_org,p_project)
 then raise exception 'Not assigned to project planning' using errcode='42501';end if;
 manager=private.construction_can_manage(p_org,p_project);
 return jsonb_build_object(
  'can_approve',manager,
  'can_submit',true,
  'material_choices',case when manager or
      private.site_role(p_org,p_project)='site_engineer'
      or exists(select 1 from private.construction_project_roles role
       where role.organization_id=p_org and role.project_id=p_project
        and role.user_id=auth.uid() and role.active and role.role='site_engineer')
    then coalesce((
      select jsonb_agg(jsonb_build_object(
       'id',m.id,'item',m.item,'quantity',m.quantity,'unit',m.unit,
       'status',m.status) order by m.created_at desc,m.id desc)
      from private.site_material_needs m
      where m.organization_id=p_org and m.project_id=p_project),'[]'::jsonb)
    else '[]'::jsonb end,
  'plans',coalesce((
   select jsonb_agg(jsonb_build_object(
      'id',p.id,'stage_id',p.stage_id,'work_date',p.work_date,
      'revision',p.revision,'work_summary',p.work_summary,
      'labor_plan',p.labor_plan,'instructions',p.instructions,
      'status',private.construction_tomorrow_state(p_org,p_project,p.id),
      'submitted_at',p.created_at,
      'materials',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',m.id,'item',m.item,'unit',m.unit,'status',m.status,
          'required_quantity',link.required_quantity)
          order by m.item,m.id)
        from private.construction_tomorrow_materials link
        join private.site_material_needs m on m.id=link.material_id
        where link.organization_id=p_org and link.project_id=p_project
         and link.plan_id=p.id),'[]'::jsonb))
      order by p.work_date,p.revision desc,p.created_at desc)
     from private.construction_tomorrow_plans p
     where p.organization_id=p_org and p.project_id=p_project
       and p.work_date between current_date-2 and current_date+14
       and (
         manager or p.proposed_by=auth.uid()
         or private.construction_tomorrow_state(p_org,p_project,p.id)='approved'
       )),'[]'::jsonb));
end$$;

create function public.construction_tomorrow_command(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 manager boolean;actor uuid=auth.uid();p private.construction_tomorrow_plans;
 stage private.construction_project_stages;task jsonb;material jsonb;trade text;
 summary text;directions text;target uuid;revision_no int;v_date date;v_reason text;
begin
 if not private.construction_tomorrow_staff(p_org,p_project)
 then raise exception 'Not assigned to site planning' using errcode='42501';end if;
 if p_action not in ('submit','review') or
    jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>15000
 then raise exception 'Invalid planning action' using errcode='22023';end if;
 manager=private.construction_can_manage(p_org,p_project);
 perform 1 from public.projects where organization_id=p_org
   and id=p_project and status='active' for update;
 if not found then raise exception 'Project not active' using errcode='42501';end if;
 perform private.project_agreement_require(p_org,p_project);
 if not exists(select 1 from private.site_state site where site.organization_id=p_org
      and site.project_id=p_project and site.stage='execution')
   and not exists(select 1 from public.execution_plans where organization_id=p_org
      and project_id=p_project and status in ('in_progress','punch_list','ready_for_handover'))
 then raise exception 'Physical execution has not begun' using errcode='23514';end if;

 if p_action='submit' then
   if p_input-array['stage_id','work_date','work_summary','labor','materials','instructions']<>'{}'::jsonb
   then raise exception 'Unexpected plan fields' using errcode='22023';end if;
   select * into stage from private.construction_project_stages
    where organization_id=p_org and project_id=p_project
      and id=(p_input->>'stage_id')::uuid;
   if stage.id is null then raise exception 'Stage unavailable' using errcode='42501';end if;
   v_date=(p_input->>'work_date')::date;
   if v_date not between current_date+1 and current_date+14
   then raise exception 'Plan for a future day within 14 days' using errcode='22023';end if;
   summary=trim(coalesce(p_input->>'work_summary',''));
   directions=trim(coalesce(p_input->>'instructions',''));
   if length(summary) not between 10 and 3000 or length(directions)>2500
      or jsonb_typeof(p_input->'labor') is distinct from 'array'
      or jsonb_array_length(p_input->'labor') not between 1 and 20
      or jsonb_typeof(p_input->'materials') is distinct from 'array'
      or jsonb_array_length(p_input->'materials')>30
   then raise exception 'Valid work, labour and material requirements required'
     using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(p_input->'labor') as x(item)
     where jsonb_typeof(x.item)<>'object'
      or x.item-array['trade','workers']<>'{}'::jsonb
      or trim(coalesce(x.item->>'trade','')) !~ '^[A-Za-z][A-Za-z /-]{1,69}$'
      or jsonb_typeof(x.item->'workers')<>'number'
      or (x.item->>'workers')::numeric<>floor((x.item->>'workers')::numeric)
      or (x.item->>'workers')::numeric not between 1 and 300
   ) or exists(select 1 from jsonb_array_elements(p_input->'materials') as x(item)
     where jsonb_typeof(x.item)<>'object'
      or x.item-array['id','quantity']<>'{}'::jsonb
      or (x.item->>'id') !~ '^[0-9a-fA-F-]{36}$'
      or jsonb_typeof(x.item->'quantity')<>'number'
      or (x.item->>'quantity')::numeric<=0
      or (x.item->>'quantity')::numeric>100000000
   )
   then raise exception 'Invalid labour allocation or material reference'
     using errcode='22023';end if;
   if exists(select 1 from (
      select trim(x.item->>'trade') as trade from jsonb_array_elements(p_input->'labor') x(item)
   ) entries group by lower(entries.trade) having count(*)>1)
   then raise exception 'Duplicate labour trades are not allowed' using errcode='22023';end if;
   if exists(select 1 from (
      select x.item->>'id' as id from jsonb_array_elements(p_input->'materials') x(item)
   ) entries group by entries.id having count(*)>1)
   then raise exception 'Duplicate material requirements are not allowed' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(p_input->'materials') x(item)
      where not exists(select 1 from private.site_material_needs m
        where m.organization_id=p_org and m.project_id=p_project
          and m.id=(x.item->>'id')::uuid and m.status<>'rejected'))
   then raise exception 'Material must already exist in project procurement requests'
       using errcode='42501';end if;
   select coalesce(max(existing.revision),0)+1 into revision_no
     from private.construction_tomorrow_plans existing
     where existing.organization_id=p_org and existing.project_id=p_project
       and existing.stage_id=stage.id and existing.work_date=v_date;
   if revision_no>1000 then raise exception 'Too many revisions' using errcode='22023';end if;
   insert into private.construction_tomorrow_plans(
      organization_id,project_id,stage_id,work_date,revision,
      work_summary,labor_plan,instructions,proposed_by
   ) values(p_org,p_project,stage.id,v_date,revision_no,
      summary,p_input->'labor',directions,actor) returning id into target;
   insert into private.construction_tomorrow_materials(
      organization_id,project_id,plan_id,material_id,required_quantity)
   select p_org,p_project,target,(x.item->>'id')::uuid,
      (x.item->>'quantity')::numeric
   from jsonb_array_elements(p_input->'materials') x(item);
 else
   if not manager or p_input-array['plan_id','decision','reason']<>'{}'::jsonb
   then raise exception 'Project manager review required' using errcode='42501';end if;
   select * into p from private.construction_tomorrow_plans
     where organization_id=p_org and project_id=p_project
       and id=(p_input->>'plan_id')::uuid;
   if p.id is null then raise exception 'Plan unavailable' using errcode='42501';end if;
   if private.construction_tomorrow_state(p_org,p_project,p.id)='superseded'
   then raise exception 'Only the latest plan revision can be reviewed'
     using errcode='23514';end if;
   if p_input->>'decision' not in ('approved','changes_requested','withdrawn')
   then raise exception 'Unknown plan decision' using errcode='22023';end if;
   v_reason=trim(coalesce(p_input->>'reason',''));
   if length(v_reason) not between 12 and 2500
   then raise exception 'Review notes required' using errcode='22023';end if;
   insert into private.construction_tomorrow_decisions(
      organization_id,project_id,plan_id,decision,reason,reviewed_by)
   values(p_org,p_project,p.id,p_input->>'decision',v_reason,actor)
   returning id into target;
 end if;
 perform private.site_log(p_org,p_project,'construction.tomorrow.'||p_action,target);
 return target;
end$$;

revoke all on function private.construction_tomorrow_staff(uuid,uuid),
 private.construction_tomorrow_state(uuid,uuid,uuid),
 public.construction_tomorrow_read(uuid,uuid),
 public.construction_tomorrow_command(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_tomorrow_read(uuid,uuid),
 public.construction_tomorrow_command(uuid,uuid,text,jsonb) to authenticated;
commit;
