-- Construction OS Phase 9: structured labour presence linked to canonical site gate events.
-- This is not HR attendance, payroll, site progress, or an invoice.
begin;

create table private.construction_gate_labor (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 gate_id uuid not null unique references private.site_gate(id),
 work_date date not null check(isfinite(work_date)),
 trade text not null check(length(trim(trade)) between 2 and 70),
 direction text not null check(direction in ('arrival','departure')),
 workers integer not null check(workers between 1 and 500),
 notes text not null default '' check(length(notes)<=1500),
 recorded_by uuid not null references public.profiles(id),
 recorded_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index construction_gate_labor_by_day on private.construction_gate_labor(
 organization_id,project_id,work_date,trade,sequence desc);
create table private.construction_gate_labor_reviews (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 work_date date not null check(isfinite(work_date)),
 decision text not null check(decision in ('verified','discrepancy')),
 reason text not null check(length(trim(reason)) between 12 and 2500),
 observed_sequence bigint not null check(observed_sequence>0),
 reviewed_by uuid not null references public.profiles(id),
 reviewed_at timestamptz not null default now(),
 foreign key(organization_id,project_id) references public.projects(organization_id,id)
);
create index construction_gate_review_date on private.construction_gate_labor_reviews(
 organization_id,project_id,work_date,sequence desc);
do $$
declare tab text;
begin
 foreach tab in array array['construction_gate_labor','construction_gate_labor_reviews'] loop
  execute format('alter table private.%I enable row level security',tab);
  execute format('alter table private.%I force row level security',tab);
  execute format('revoke all on private.%I from public,anon,authenticated',tab);
  execute format('create trigger construction_gate_immutable before update or delete on private.%I for each row execute function private.ops_immutable()',tab);
 end loop;
end$$;

create function private.construction_gate_staff(p_org uuid,p_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.construction_project_access(p_org,p_project)
   and (
     private.construction_can_manage(p_org,p_project)
     or private.site_role(p_org,p_project)='watchman'
     or exists(select 1 from private.construction_project_roles r
       where r.organization_id=p_org and r.project_id=p_project
        and r.user_id=(select auth.uid()) and r.active and r.role='watchman')
   ),false);
$$;

create function public.construction_gate_labor_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean;
begin
 if not private.construction_gate_staff(p_org,p_project)
 then raise exception 'Security gate workspace unavailable' using errcode='42501';end if;
 manager=coalesce(private.construction_can_manage(p_org,p_project),false);
 return jsonb_build_object(
   'can_review',manager,
   'events',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',e.id,'work_date',e.work_date,'trade',e.trade,
       'direction',e.direction,'workers',e.workers,
       'notes',e.notes,'recorded_at',e.recorded_at
       ) order by e.work_date desc,e.sequence desc)
     from private.construction_gate_labor e
     where e.organization_id=p_org and e.project_id=p_project
       and e.work_date between current_date-7 and current_date+1
       and (manager or e.recorded_by=auth.uid())
   ),'[]'::jsonb),
   'comparison',case when manager then coalesce((
     with scheduled as (
       select p.work_date,lower(trim(worker->>'trade')) as trade,
          sum((worker->>'workers')::integer)::integer as planned
       from private.construction_tomorrow_plans p
       cross join lateral jsonb_array_elements(p.labor_plan) worker
       where p.organization_id=p_org and p.project_id=p_project
         and p.work_date between current_date-7 and current_date+1
         and private.construction_tomorrow_state(p_org,p_project,p.id)='approved'
       group by p.work_date,lower(trim(worker->>'trade'))
     ), actual as (
       select e.work_date,lower(trim(e.trade)) as trade,
         sum(case when e.direction='arrival' then e.workers else 0 end)::integer arrivals,
         sum(case when e.direction='departure' then e.workers else 0 end)::integer departures
       from private.construction_gate_labor e
       where e.organization_id=p_org and e.project_id=p_project
         and e.work_date between current_date-7 and current_date+1
       group by e.work_date,lower(trim(e.trade))
     )
     select jsonb_agg(jsonb_build_object(
       'work_date',coalesce(s.work_date,a.work_date),
       'trade',coalesce(s.trade,a.trade),'planned',coalesce(s.planned,0),
       'arrived',coalesce(a.arrivals,0),'departed',coalesce(a.departures,0),
       'on_site',coalesce(a.arrivals,0)-coalesce(a.departures,0))
       order by coalesce(s.work_date,a.work_date) desc,coalesce(s.trade,a.trade))
     from scheduled s full join actual a
       on a.work_date=s.work_date and a.trade=s.trade
   ),'[]'::jsonb) else '[]'::jsonb end,
   'reviews',case when manager then coalesce((
     select jsonb_agg(jsonb_build_object(
       'work_date',rev.work_date,'decision',rev.decision,
       'reason',rev.reason,'reviewed_at',rev.reviewed_at,
       'is_current',rev.observed_sequence=(
          select max(events.sequence) from private.construction_gate_labor events
          where events.organization_id=p_org and events.project_id=p_project
            and events.work_date=rev.work_date))
       order by rev.work_date desc,rev.sequence desc)
     from private.construction_gate_labor_reviews rev
     where rev.organization_id=p_org and rev.project_id=p_project
       and rev.work_date between current_date-7 and current_date
       and rev.sequence=(
         select max(newer.sequence)
         from private.construction_gate_labor_reviews newer
         where newer.organization_id=p_org and newer.project_id=p_project
           and newer.work_date=rev.work_date)
   ),'[]'::jsonb) else '[]'::jsonb end
 );
end$$;

create function public.construction_gate_labor_command(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare manager boolean; trade_name text; v_direction text; count_workers integer;
 date_work date;note text;log_id uuid;result_id uuid;on_site integer;rev_sequence bigint;
begin
 if not private.construction_gate_staff(p_org,p_project)
 then raise exception 'Assigned security gate staff required' using errcode='42501';end if;
 if p_action not in ('arrival','departure','review') or
    jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>6000
 then raise exception 'Unknown security gate action' using errcode='22023';end if;
 manager=coalesce(private.construction_can_manage(p_org,p_project),false);
 perform 1 from public.projects p
  where p.organization_id=p_org and p.id=p_project and p.status='active' for update;
 if not found then raise exception 'Project not active' using errcode='42501';end if;
 -- This is actual site security data and requires an authorized physical site.
 perform private.project_agreement_require(p_org,p_project);
 if not exists(select 1 from private.site_state site
   where site.organization_id=p_org and site.project_id=p_project and site.stage='execution')
 then raise exception 'Site execution must be active' using errcode='23514';end if;

 if p_action='review' then
   if not manager or p_input-array['work_date','decision','reason']<>'{}'::jsonb
   then raise exception 'Project manager review required' using errcode='42501';end if;
   date_work=(p_input->>'work_date')::date;
   if date_work not between current_date-7 and current_date
      or p_input->>'decision' not in ('verified','discrepancy')
   then raise exception 'Review day or decision unavailable' using errcode='22023';end if;
   note=trim(coalesce(p_input->>'reason',''));
   if length(note) not between 12 and 2500
   then raise exception 'Attendance reconciliation note required' using errcode='22023';end if;
   select max(e.sequence) into rev_sequence from private.construction_gate_labor e
    where e.organization_id=p_org and e.project_id=p_project and e.work_date=date_work;
   if rev_sequence is null then raise exception 'No site gate events to review'
      using errcode='23514';end if;
   insert into private.construction_gate_labor_reviews(
     organization_id,project_id,work_date,decision,reason,observed_sequence,reviewed_by
   ) values(p_org,p_project,date_work,p_input->>'decision',note,rev_sequence,auth.uid())
   returning id into result_id;
 else
   if p_input-array['work_date','trade','workers','notes']<>'{}'::jsonb
   then raise exception 'Unknown workforce arrival/departure fields' using errcode='22023';end if;
   date_work=(p_input->>'work_date')::date;
   trade_name=trim(coalesce(p_input->>'trade',''));
   note=trim(coalesce(p_input->>'notes',''));
   if date_work not between current_date-1 and current_date
      or trade_name !~ '^[A-Za-z][A-Za-z /-]{1,69}$'
      or (p_input->>'workers') !~ '^[0-9]{1,3}$'
      or length(note)>1500
   then raise exception 'Work date, trade or workforce quantity invalid'
     using errcode='22023';end if;
   count_workers=(p_input->>'workers')::integer;
   if count_workers not between 1 and 500
   then raise exception 'Worker count must be 1 to 500' using errcode='22023';end if;
   v_direction=p_action;
   if v_direction='departure' then
     select coalesce(sum(case when e.direction='arrival' then e.workers
       else -e.workers end),0) into on_site
     from private.construction_gate_labor e
     where e.organization_id=p_org and e.project_id=p_project
       and e.work_date=date_work and lower(e.trade)=lower(trade_name);
     if on_site<count_workers then
       raise exception 'Departure exceeds recorded site arrivals for this trade'
        using errcode='23514';end if;
   end if;
   insert into private.site_gate(
     organization_id,project_id,kind,description,notes,created_by
   ) values(p_org,p_project,'labour',
     'Worker '||v_direction||': '||trade_name||' ('||count_workers||')',
     note,auth.uid()) returning id into log_id;
   insert into private.construction_gate_labor(
     organization_id,project_id,gate_id,work_date,trade,direction,
     workers,notes,recorded_by
   ) values(p_org,p_project,log_id,date_work,trade_name,v_direction,
     count_workers,note,auth.uid()) returning id into result_id;
 end if;
 perform private.site_log(p_org,p_project,'construction.labour.'||p_action,result_id);
 return result_id;
end$$;

revoke all on function private.construction_gate_staff(uuid,uuid),
 public.construction_gate_labor_read(uuid,uuid),
 public.construction_gate_labor_command(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_gate_labor_read(uuid,uuid),
 public.construction_gate_labor_command(uuid,uuid,text,jsonb) to authenticated;
commit;
