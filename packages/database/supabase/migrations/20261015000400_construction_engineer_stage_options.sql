-- Phase 7: expose ONLY the signed-in engineer's linkable record IDs.
-- Do not expose structural plans, billing or coworker association options.
begin;
create or replace function public.construction_stage_record_read(
 p_organization_id uuid,p_project_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_manager boolean; v_role text; v_finance boolean; v_links jsonb; v_payments jsonb; v_options jsonb; v_owned jsonb;
begin
 if not private.construction_project_access(p_organization_id,p_project_id) then
   raise exception 'Project unavailable' using errcode='42501';end if;
 v_manager=private.construction_can_manage(p_organization_id,p_project_id);
 v_role=private.site_role(p_organization_id,p_project_id);
 -- A watchman must not gain structural plans, site reports or financial data.
 if not v_manager and v_role not in ('site_engineer','quality_inspector','procurement')
 then return jsonb_build_object('links','[]'::jsonb,'payments','[]'::jsonb,'options','[]'::jsonb,'owned','[]'::jsonb);end if;
 v_finance=coalesce(private.finance_access(p_organization_id,'payment_schedule.view'),false);
 -- Only the signed-in engineer's own site records are offered for self-linking.
 -- Managers use all records they already see via the standard checked site RPC.
 if not v_manager and v_role='site_engineer' then
   select coalesce(jsonb_agg(jsonb_build_object('kind',mine.kind,'id',mine.id)), '[]'::jsonb)
   into v_owned from (
     select 'report'::text kind,id from private.site_reports
       where organization_id=p_organization_id and project_id=p_project_id
       and created_by=auth.uid()
     union all
     select 'material'::text kind,id from private.site_material_needs
       where organization_id=p_organization_id and project_id=p_project_id
       and requested_by=auth.uid()
     union all
     select 'media'::text kind,id from private.site_media
       where organization_id=p_organization_id and project_id=p_project_id
       and uploaded_by=auth.uid() and category in ('site','daily','inspection')
   ) mine;
 end if;
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
     'label',i.label,'amount',i.expected_amount::text,'due_date',i.due_date,
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
     'id',i.id,'contract_id',c.id,'label',i.label,'amount',i.expected_amount::text,
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
  'options',coalesce(v_options,'[]'::jsonb),
  'owned',coalesce(v_owned,'[]'::jsonb));
end$$;
commit;
