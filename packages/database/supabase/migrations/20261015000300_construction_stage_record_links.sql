-- Construction OS Phase 6: explicit, append-only associations to canonical
-- site records and real payment schedule lines. No duplicate financial ledger.
begin;

-- Composite FKs prevent cross-project substitutions even with leaked UUIDs.
create unique index if not exists stage_report_org_project_id
  on private.site_reports(organization_id,project_id,id);
create unique index if not exists stage_material_org_project_id
  on private.site_material_needs(organization_id,project_id,id);
create unique index if not exists stage_check_org_project_id
  on private.site_checks(organization_id,project_id,id);
create unique index if not exists stage_gate_org_project_id
  on private.site_gate(organization_id,project_id,id);
create unique index if not exists stage_payment_item_org_contract_id
  on public.payment_schedule_items(organization_id,contract_id,id);

create table private.construction_stage_record_links (
 id uuid primary key default gen_random_uuid(),
 sequence bigint generated always as identity unique,
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 record_kind text not null check(record_kind in
   ('report','material','media','check','curing_round','payment')),
 report_id uuid,
 material_id uuid,
 media_id uuid,
 check_id uuid,
 gate_id uuid,
 contract_id uuid,
 payment_item_id uuid,
 linked_by uuid not null references public.profiles(id),
 linked_at timestamptz not null default now(),
 check (
   num_nonnulls(report_id,material_id,media_id,check_id,gate_id,payment_item_id)=1
   and (
    (record_kind='report' and report_id is not null) or
    (record_kind='material' and material_id is not null) or
    (record_kind='media' and media_id is not null) or
    (record_kind='check' and check_id is not null) or
    (record_kind='curing_round' and gate_id is not null) or
    (record_kind='payment' and payment_item_id is not null)
   )
   and (payment_item_id is not null) = (contract_id is not null)
 ),
 foreign key(organization_id,project_id,stage_id)
    references private.construction_project_stages(organization_id,project_id,id),
 foreign key(organization_id,project_id,report_id)
    references private.site_reports(organization_id,project_id,id),
 foreign key(organization_id,project_id,material_id)
    references private.site_material_needs(organization_id,project_id,id),
 foreign key(organization_id,project_id,media_id)
    references private.site_media(organization_id,project_id,id),
 foreign key(organization_id,project_id,check_id)
    references private.site_checks(organization_id,project_id,id),
 foreign key(organization_id,project_id,gate_id)
    references private.site_gate(organization_id,project_id,id),
 foreign key(organization_id,project_id,contract_id)
    references public.contracts(organization_id,project_id,id),
 foreign key(organization_id,contract_id,payment_item_id)
    references public.payment_schedule_items(organization_id,contract_id,id)
);
create index construction_stage_record_recent on
 private.construction_stage_record_links(organization_id,project_id,sequence desc);
create index construction_stage_record_stage on
 private.construction_stage_record_links(organization_id,project_id,stage_id);
alter table private.construction_stage_record_links enable row level security;
alter table private.construction_stage_record_links force row level security;
revoke all on private.construction_stage_record_links from public,anon,authenticated;
create trigger construction_stage_record_immutable
 before update or delete on private.construction_stage_record_links
 for each row execute function private.ops_immutable();

-- Only qualified managers can associate payment milestones. Non-manager site
-- engineers may attach their own site reports/photos/material requests, never
-- another worker's record or a financial line. Watchmen have no stage view.
create function public.construction_stage_record_command(
 p_organization_id uuid, p_project_id uuid, p_action text,
 p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_manager boolean; v_role text; v_kind text; v_record uuid;
 v_stage uuid; v_contract uuid; v_result uuid; v_existing uuid;
begin
 if not private.construction_project_access(p_organization_id,p_project_id) then
   raise exception 'Project not available' using errcode='42501';end if;
 if p_action <> 'link' or jsonb_typeof(p_input) is distinct from 'object'
   or p_input-array['stage_id','kind','record_id','contract_id'] <> '{}'::jsonb
   or octet_length(p_input::text)>3000
 then raise exception 'Invalid link action' using errcode='22023';end if;
 v_stage=(p_input->>'stage_id')::uuid;
 v_kind=p_input->>'kind';
 v_record=(p_input->>'record_id')::uuid;
 v_contract=nullif(p_input->>'contract_id','')::uuid;
 if v_stage is null or v_record is null
   or v_kind not in ('report','material','media','check','curing_round','payment')
 then raise exception 'Record and stage required' using errcode='22023';end if;

 -- Serialize assignment changes against the current project and stage.
 perform 1 from public.projects where organization_id=p_organization_id
   and id=p_project_id and status='active' for update;
 if not found then raise exception 'Inactive project' using errcode='42501';end if;
 perform 1 from private.construction_project_stages where organization_id=p_organization_id
   and project_id=p_project_id and id=v_stage;
 if not found then raise exception 'Invalid project stage' using errcode='42501';end if;
 v_manager=private.construction_can_manage(p_organization_id,p_project_id);
 v_role=private.site_role(p_organization_id,p_project_id);
 if not v_manager and v_role<>'site_engineer' then
   raise exception 'Project manager or site engineer required' using errcode='42501';end if;
 if not v_manager and v_kind not in ('report','material','media') then
   raise exception 'Manager required to link inspections, curing or payments' using errcode='42501';end if;

 if v_kind='report' then
   if not exists(select 1 from private.site_reports r where
      r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.id=v_record and (v_manager or r.created_by=auth.uid()))
   then raise exception 'Report unavailable' using errcode='42501';end if;
 elsif v_kind='material' then
   if not exists(select 1 from private.site_material_needs r where
      r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.id=v_record and (v_manager or r.requested_by=auth.uid()))
   then raise exception 'Material request unavailable' using errcode='42501';end if;
 elsif v_kind='media' then
   if not exists(select 1 from private.site_media r where
      r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.id=v_record and r.category<>'agreement'
      and (v_manager or (r.uploaded_by=auth.uid()
        and r.category in ('site','daily','inspection'))))
   then raise exception 'Media unavailable' using errcode='42501';end if;
 elsif v_kind='check' then
   if not exists(select 1 from private.site_checks r where
      r.organization_id=p_organization_id and r.project_id=p_project_id and r.id=v_record)
   then raise exception 'Site check unavailable' using errcode='42501';end if;
 elsif v_kind='curing_round' then
   if not exists(select 1 from private.site_gate r where
      r.organization_id=p_organization_id and r.project_id=p_project_id
      and r.id=v_record and r.kind='curing')
   then raise exception 'Curing round unavailable' using errcode='42501';end if;
 elsif v_kind='payment' then
   if not v_manager or not private.finance_access(p_organization_id,'payment_schedule.view')
   then raise exception 'Payment schedule access required' using errcode='42501';end if;
   if v_contract is null or not exists(
     select 1 from public.payment_schedule_items i
       join public.payment_schedules s on s.id=i.schedule_id
           and s.organization_id=i.organization_id and s.contract_id=i.contract_id
       join public.contracts c on c.id=i.contract_id and c.organization_id=i.organization_id
     where i.organization_id=p_organization_id and i.contract_id=v_contract
       and i.id=v_record and c.project_id=p_project_id and s.status='active'
       and c.status in ('active','held','completed')
   ) then raise exception 'An active payment schedule item for this project is required'
      using errcode='42501';end if;
 else raise exception 'Unknown record kind' using errcode='22023';end if;
 if v_kind<>'payment' and v_contract is not null then
   raise exception 'Non-financial links cannot carry a contract' using errcode='22023';end if;

 -- No duplicate latest assignment, but history is immutable on a legitimate correction.
 select l.stage_id into v_existing from private.construction_stage_record_links l
   where l.organization_id=p_organization_id and l.project_id=p_project_id
     and l.record_kind=v_kind
     and coalesce(l.report_id,l.material_id,l.media_id,l.check_id,
       l.gate_id,l.payment_item_id)=v_record
   order by l.sequence desc limit 1;
 if v_existing=v_stage then
   return jsonb_build_object('stage_id',v_stage,'already_linked',true);
 end if;
 insert into private.construction_stage_record_links(
   organization_id,project_id,stage_id,record_kind,
   report_id,material_id,media_id,check_id,gate_id,contract_id,payment_item_id,linked_by
 ) values(p_organization_id,p_project_id,v_stage,v_kind,
   case when v_kind='report' then v_record end,
   case when v_kind='material' then v_record end,
   case when v_kind='media' then v_record end,
   case when v_kind='check' then v_record end,
   case when v_kind='curing_round' then v_record end,
   case when v_kind='payment' then v_contract end,
   case when v_kind='payment' then v_record end,
   auth.uid()) returning id into v_result;
 perform private.site_log(p_organization_id,p_project_id,'construction.link_'||v_kind,v_result);
 return jsonb_build_object('id',v_result,'stage_id',v_stage,'kind',v_kind);
end$$;

-- Read is confined to the exact project, stage-access policy, and site roles.
-- Financial amounts and all payment metadata require independent Billing access.
create function public.construction_stage_record_read(
 p_organization_id uuid,p_project_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_manager boolean; v_role text; v_finance boolean; v_links jsonb; v_payments jsonb; v_options jsonb;
begin
 if not private.construction_project_access(p_organization_id,p_project_id) then
   raise exception 'Project unavailable' using errcode='42501';end if;
 v_manager=private.construction_can_manage(p_organization_id,p_project_id);
 v_role=private.site_role(p_organization_id,p_project_id);
 -- A watchman must not gain structural plans, site reports or financial data.
 if not v_manager and v_role not in ('site_engineer','quality_inspector','procurement')
 then return jsonb_build_object('links','[]'::jsonb,'payments','[]'::jsonb,'options','[]'::jsonb);end if;
 v_finance=coalesce(private.finance_access(p_organization_id,'payment_schedule.view'),false);
 with latest as (
   select distinct on (record_kind,coalesce(report_id,material_id,media_id,check_id,gate_id,payment_item_id))
      stage_id,record_kind,coalesce(report_id,material_id,media_id,check_id,gate_id,payment_item_id) record_id
    from private.construction_stage_record_links
    where organization_id=p_organization_id and project_id=p_project_id
      and (record_kind<>'payment' or v_finance)
      and (v_manager
        or (v_role='site_engineer' and record_kind in ('report','material','media','check','curing_round'))
        or (v_role='quality_inspector' and record_kind in ('check','media'))
        or (v_role='procurement' and record_kind='material'))
    order by record_kind,coalesce(report_id,material_id,media_id,check_id,gate_id,payment_item_id),sequence desc
 )
 select coalesce(jsonb_agg(jsonb_build_object('stage_id',l.stage_id,
       'kind',l.record_kind,'record_id',l.record_id) order by l.stage_id,l.record_kind),'[]'::jsonb)
 into v_links from latest l;
 if v_finance then
   with latest as (
    select distinct on(payment_item_id) stage_id,contract_id,payment_item_id
    from private.construction_stage_record_links
    where organization_id=p_organization_id and project_id=p_project_id and record_kind='payment'
    order by payment_item_id,sequence desc
   )
   select coalesce(jsonb_agg(jsonb_build_object(
     'stage_id',l.stage_id,'item_id',i.id,'contract_id',c.id,
     'label',i.label,'amount',i.expected_amount,'due_date',i.due_date,
     'currency',c.currency,'contract_number',c.contract_number,
     'request_number',req.request_number,'request_status',req.status
   ) order by l.stage_id,i.sort_order),'[]'::jsonb)
   into v_payments
   from latest l join public.payment_schedule_items i on i.organization_id=p_organization_id
     and i.contract_id=l.contract_id and i.id=l.payment_item_id
     join public.contracts c on c.organization_id=p_organization_id
       and c.project_id=p_project_id and c.id=l.contract_id
     left join lateral (
       select request_number,status from public.payment_requests pr
       where pr.organization_id=p_organization_id and pr.contract_id=l.contract_id
         and pr.schedule_item_id=l.payment_item_id and pr.voided_at is null
       order by pr.issued_at desc,pr.id desc limit 1
     ) req on true;
   if v_manager then
    select coalesce(jsonb_agg(jsonb_build_object(
     'id',i.id,'contract_id',c.id,'label',i.label,'amount',i.expected_amount,
     'currency',c.currency,'contract_number',c.contract_number
    ) order by c.contract_number,i.sort_order),'[]'::jsonb) into v_options
    from public.payment_schedule_items i
      join public.payment_schedules s on s.id=i.schedule_id
       and s.organization_id=i.organization_id and s.contract_id=i.contract_id
      join public.contracts c on c.id=i.contract_id and c.organization_id=i.organization_id
    where c.organization_id=p_organization_id and c.project_id=p_project_id
      and c.status in ('active','held','completed') and s.status='active';
   end if;
 end if;
 return jsonb_build_object('links',coalesce(v_links,'[]'::jsonb),
  'payments',coalesce(v_payments,'[]'::jsonb),
  'options',coalesce(v_options,'[]'::jsonb));
end$$;

revoke all on function public.construction_stage_record_command(uuid,uuid,text,jsonb),
 public.construction_stage_record_read(uuid,uuid) from public,anon;
grant execute on function public.construction_stage_record_command(uuid,uuid,text,jsonb),
 public.construction_stage_record_read(uuid,uuid) to authenticated;
commit;
