-- Construction OS Phase 6: opt-in stage-linked contractual payment eligibility.
-- Canonical schedule items, requests, invoices, allocations and receipts remain unchanged.
begin;

create table private.construction_payment_stage_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 contract_id uuid not null,
 schedule_item_id uuid not null,
 stage_id uuid not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,schedule_item_id,stage_id),
 foreign key(organization_id,project_id,contract_id)
   references public.contracts(organization_id,project_id,id),
 foreign key(organization_id,contract_id,schedule_item_id)
   references public.payment_schedule_items(organization_id,contract_id,id),
 foreign key(organization_id,project_id,stage_id)
   references private.construction_project_stages(organization_id,project_id,id)
);
create index construction_payment_by_project on private.construction_payment_stage_links(
 organization_id,project_id,schedule_item_id);
alter table private.construction_payment_stage_links enable row level security;
alter table private.construction_payment_stage_links force row level security;
revoke all on private.construction_payment_stage_links from public,anon,authenticated;
create trigger immutable_construction_payment_link before update or delete on
 private.construction_payment_stage_links for each row execute function private.ops_immutable();

-- No default stage percentage or request is synthesized. A milestone becomes
-- stage-gated only if its contractual due_trigger is 'construction_stage', or
-- an authorized manager explicitly binds at least one stage to it.
create function private.construction_payment_ready(
 p_org uuid,p_project uuid,p_item uuid
) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
  select
    i.expected_amount::numeric>0
    and s.status='active' and c.status='active'
    and private.project_agreement_authorized(p_org,p_project)
    and exists(select 1 from private.construction_payment_stage_links l
      where l.organization_id=p_org and l.project_id=p_project
        and l.contract_id=c.id and l.schedule_item_id=i.id)
    and not exists(
      with recursive required(stage_id) as (
        select l.stage_id from private.construction_payment_stage_links l
          where l.organization_id=p_org and l.project_id=p_project
            and l.schedule_item_id=i.id
        union
        select d.predecessor_id from private.construction_stage_dependencies d
          join required r on r.stage_id=d.stage_id
          where d.organization_id=p_org and d.project_id=p_project
      )
      select 1 from required r
      where not private.construction_stage_current(p_org,p_project,r.stage_id)
    )
   from public.payment_schedule_items i
   join public.payment_schedules s
     on s.organization_id=i.organization_id and s.id=i.schedule_id
   join public.contracts c
     on c.organization_id=i.organization_id and c.id=i.contract_id
   where i.organization_id=p_org and c.project_id=p_project and i.id=p_item
 ),false);
$$;

-- This trigger applies to ALL payment-request inserts, including those made
-- via the original public.payment_request_issue RPC. There is no alternate
-- path around a mapped or explicitly stage-triggered schedule item.
create function private.construction_payment_issue_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare p_project uuid; gated boolean;
begin
 select c.project_id into p_project
   from public.contracts c
   where c.organization_id=new.organization_id and c.id=new.contract_id;
 if p_project is null then raise exception 'Contract unavailable'
    using errcode='42501';end if;
 -- Same project locking discipline as stage certification and curing writes.
 perform 1 from public.projects p where p.organization_id=new.organization_id
    and p.id=p_project for update;
 perform 1 from public.payment_schedule_items i
    where i.organization_id=new.organization_id
      and i.contract_id=new.contract_id
      and i.id=new.schedule_item_id for update;
 if not found then raise exception 'Schedule item unavailable' using errcode='42501';end if;
 select (i.due_trigger='construction_stage' or exists(
    select 1 from private.construction_payment_stage_links l
    where l.organization_id=new.organization_id
      and l.schedule_item_id=i.id)) into gated
 from public.payment_schedule_items i
 where i.organization_id=new.organization_id and i.id=new.schedule_item_id;
 if coalesce(gated,false) and not private.construction_payment_ready(
     new.organization_id,p_project,new.schedule_item_id)
 then raise exception 'Stage-linked milestone cannot be requested until all stages and prerequisite inspections/curing are currently certified'
   using errcode='23514';
 end if;
 return new;
end$$;
create trigger construction_payment_request_gate
 before insert on public.payment_requests
 for each row execute function private.construction_payment_issue_guard();

create function public.construction_payment_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare active_contract uuid; active_count integer; can_bind boolean;can_issue boolean;
begin
 if not coalesce(private.construction_can_manage(p_org,p_project),false)
    or not coalesce(private.finance_access(p_org,'payment_schedule.view'),false)
    or not coalesce(private.finance_access(p_org,'payment_request.view'),false)
 then raise exception 'Project commercial milestones unavailable'
   using errcode='42501';end if;
 select count(*) into active_count from public.contracts
   where organization_id=p_org and project_id=p_project and status='active';
 if active_count=1 then
   select id into active_contract from public.contracts
   where organization_id=p_org and project_id=p_project and status='active';
 end if;
 can_bind=coalesce(private.finance_access(p_org,'payment_schedule.manage'),false);
 can_issue=coalesce(private.finance_access(p_org,'payment_request.create'),false);
 return jsonb_build_object(
   'active_contract_id',active_contract,
   'currency',(select currency from public.contracts where id=active_contract),
   'can_bind',can_bind,'can_issue',can_issue,
   'stage_options',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',stage.id,'instance_code',stage.instance_code,'title',stage.title,
       'current',private.construction_stage_current(p_org,p_project,stage.id))
       order by stage.sequence)
     from private.construction_project_stages stage
     where stage.organization_id=p_org and stage.project_id=p_project),'[]'::jsonb),
   'items',coalesce((
     select jsonb_agg(jsonb_build_object(
        'id',item.id,'contract_id',item.contract_id,
        'label',item.label,'expected_amount',item.expected_amount,
        'due_trigger',item.due_trigger,'due_date',item.due_date,
        'schedule_id',item.schedule_id,
        'linked_stage_ids',coalesce((
          select jsonb_agg(link.stage_id order by stage.sequence)
           from private.construction_payment_stage_links link
            join private.construction_project_stages stage on stage.id=link.stage_id
           where link.organization_id=p_org and link.project_id=p_project
             and link.schedule_item_id=item.id),'[]'::jsonb),
        'is_stage_milestone',item.due_trigger='construction_stage'
            or exists(select 1 from private.construction_payment_stage_links link
              where link.organization_id=p_org and link.schedule_item_id=item.id),
        'eligible',private.construction_payment_ready(p_org,p_project,item.id),
        'issued_request_id',(
          select request.id from public.payment_requests request
          where request.organization_id=p_org and request.schedule_item_id=item.id
            and request.status='issued' limit 1))
       order by item.sort_order,item.id)
      from public.payment_schedule_items item
      join public.payment_schedules schedule on schedule.id=item.schedule_id
      where item.organization_id=p_org and item.contract_id=active_contract
        and schedule.status='active'),'[]'::jsonb)
 );
end$$;

-- Linking is an explicit project-commercial management decision.
-- The issuance action delegates the actual financial write to the existing
-- payment_request_issue, retaining numbering, audit, snapshots and idempotency.
create function public.construction_payment_command(
 p_org uuid,p_project uuid,p_action text,p_input jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.payment_schedule_items; stage private.construction_project_stages;
 target uuid; request_note text;due date;
begin
 if not coalesce(private.construction_can_manage(p_org,p_project),false)
 then raise exception 'Project manager required' using errcode='42501';end if;
 if p_action not in ('stage_link','request_issue') or
     jsonb_typeof(p_input) is distinct from 'object' or
     octet_length(p_input::text)>9000
 then raise exception 'Invalid stage payment command' using errcode='22023';end if;
 if (p_action='stage_link' and not coalesce(private.finance_access(p_org,'payment_schedule.manage'),false))
  or (p_action='request_issue' and not coalesce(private.finance_access(p_org,'payment_request.create'),false))
 then raise exception 'Commercial permission required' using errcode='42501';end if;
 if p_action='stage_link' then
   perform private.finance_require(p_org,'payment_schedule.manage');
 else
   perform private.finance_require(p_org,'payment_request.create');
 end if;
 perform 1 from public.projects where organization_id=p_org and id=p_project
   and status='active' for update;
 if not found then raise exception 'Project unavailable' using errcode='42501';end if;
 if p_action='stage_link' and p_input-array['item_id','stage_id']<>'{}'::jsonb
   or p_action='request_issue' and p_input-array['item_id','due_date','note']<>'{}'::jsonb
 then raise exception 'Unexpected payment stage fields' using errcode='22023';end if;
 select i.* into item from public.payment_schedule_items i
   join public.payment_schedules s on s.id=i.schedule_id
   join public.contracts c on c.id=i.contract_id
   where i.organization_id=p_org and c.organization_id=p_org
    and c.project_id=p_project and c.status='active'
    and s.organization_id=p_org and s.status='active'
    and i.id=(p_input->>'item_id')::uuid
   for update of i;
 if item.id is null then raise exception 'Active contracted payment item required'
   using errcode='42501';end if;
 if p_action='stage_link' then
   select * into stage from private.construction_project_stages st
    where st.organization_id=p_org and st.project_id=p_project
     and st.id=(p_input->>'stage_id')::uuid;
   if stage.id is null then raise exception 'Stage is not on this project' using errcode='42501';end if;
   if exists(select 1 from public.payment_requests r
      where r.organization_id=p_org and r.schedule_item_id=item.id)
      or exists(select 1 from public.invoice_items ii
        where ii.organization_id=p_org and ii.source_type='milestone'
          and ii.source_id=item.id)
   then raise exception 'Already billed milestones cannot be retroactively stage-gated'
      using errcode='23514';end if;
   insert into private.construction_payment_stage_links(
     organization_id,project_id,contract_id,schedule_item_id,stage_id,created_by
   ) values(p_org,p_project,item.contract_id,item.id,stage.id,auth.uid())
   on conflict(organization_id,schedule_item_id,stage_id) do nothing
   returning id into target;
   if target is null then
     select id into target from private.construction_payment_stage_links
       where organization_id=p_org and schedule_item_id=item.id and stage_id=stage.id;
   end if;
   perform private.site_log(p_org,p_project,'construction.payment.stage_linked',target);
 else
   request_note=trim(coalesce(p_input->>'note',''));
   if length(request_note)>3000 then raise exception 'Note too long' using errcode='22023';end if;
   due=case when nullif(p_input->>'due_date','') is not null
     then (p_input->>'due_date')::date else null end;
   if not private.construction_payment_ready(p_org,p_project,item.id)
   then raise exception 'Selected payment stage is not certified or has no stage binding'
     using errcode='23514';end if;
   -- Never insert a separate ledger row or generate a payment receipt.
   target=public.payment_request_issue(p_org,item.id,due,request_note);
   perform private.site_log(p_org,p_project,'construction.payment.requested',target);
 end if;
 return target;
end$$;

revoke all on function private.construction_payment_ready(uuid,uuid,uuid),
 private.construction_payment_issue_guard(),
 public.construction_payment_read(uuid,uuid),
 public.construction_payment_command(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.construction_payment_read(uuid,uuid),
 public.construction_payment_command(uuid,uuid,text,jsonb) to authenticated;
commit;
