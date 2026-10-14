-- Construction OS Phase 9 hardening: idempotent site labor group submissions.
-- Additive to the already-reviewed 01000 procurement, 01100 handover,
-- and 01200 labor history. Never delete or rewrite a recorded gate event.
begin;

alter table private.construction_gate_labor
  add column request_id uuid;
create unique index construction_gate_labor_request_id
 on private.construction_gate_labor(organization_id,project_id,request_id)
 where request_id is not null;

-- Reuse the existing project lock and immutable canonical Site Delivery event.
-- Replaying an event with the same ID returns the original UUID; changing the
-- details of an already-accepted ID is rejected. Old callers remain supported.
create or replace function public.construction_gate_labor_command(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare manager boolean; trade_name text; v_direction text; count_workers integer;
 date_work date;note text;log_id uuid;result_id uuid;on_site integer;rev_sequence bigint;
 v_request_id uuid; prior private.construction_gate_labor;
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
   if p_input-array['work_date','trade','workers','notes','request_id']<>'{}'::jsonb
   then raise exception 'Unknown workforce arrival/departure fields' using errcode='22023';end if;
   date_work=(p_input->>'work_date')::date;
   trade_name=trim(coalesce(p_input->>'trade',''));
   note=trim(coalesce(p_input->>'notes',''));
   v_request_id=nullif(trim(coalesce(p_input->>'request_id','')),'')::uuid;
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
   if v_request_id is not null then
     select * into prior from private.construction_gate_labor existing
       where existing.organization_id=p_org and existing.project_id=p_project
         and existing.request_id=v_request_id;
     if prior.id is not null then
       if prior.recorded_by is distinct from auth.uid()
         or prior.work_date<>date_work or prior.trade<>trade_name
         or prior.direction<>v_direction or prior.workers<>count_workers
         or prior.notes<>note then
         raise exception 'Duplicate gate request ID has conflicting event details'
           using errcode='23514';
       end if;
       return prior.id;
     end if;
   end if;
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
     workers,notes,recorded_by,request_id
   ) values(p_org,p_project,log_id,date_work,trade_name,v_direction,
     count_workers,note,auth.uid(),v_request_id) returning id into result_id;
 end if;
 perform private.site_log(p_org,p_project,'construction.labour.'||p_action,result_id);
 return result_id;
end$$;

commit;
