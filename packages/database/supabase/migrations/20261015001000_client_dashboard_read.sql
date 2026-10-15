-- Privacy-preserving projection of real project-site, material receipt and
-- inspection records. No costs, supplier terms, employee details or other jobs.
begin;
create or replace function public.client_portal_dashboard(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_org uuid;
  v_materials jsonb;
  v_checks jsonb;
  v_recent jsonb;
  v_latest jsonb;
  v_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if (select auth.uid()) is null or
     not private.client_portal_accessible(p_project_id) then
     raise exception 'This project is not shared with your account' using errcode='42501';
  end if;
  select organization_id into v_org from public.projects where id=p_project_id;
  if v_org is null then raise exception 'Project unavailable' using errcode='42501'; end if;

  -- Show only real orders and receipts. Requested stock without a purchase
  -- order is deliberately NOT labelled delivered or in transit.
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_time desc,m.description),'[]'::jsonb)
  into v_materials
  from (
    select item.description, item.unit, item.quantity as ordered_quantity,
      po.po_number,po.delivery_date as expected_date,po.issued_at as sort_time,
      case
        when coalesce(received.qty,0) >= private.finance_decimal(item.quantity,false)
          and private.finance_decimal(item.quantity,false)>0 then 'delivered'
        when coalesce(received.qty,0)>0 then 'partially_delivered'
        when po.delivery_date < v_date then 'overdue'
        else 'ordered'
      end as status,
      case when coalesce(received.qty,0)>0 then received.last_date else null end as received_date
    from public.purchase_orders po
    join public.purchase_order_items item on
      item.organization_id=po.organization_id and item.po_id=po.id
    left join lateral (
      select sum(private.finance_decimal(ri.received_quantity,false)) as qty,
             max(gr.receipt_date) as last_date
      from public.goods_receipt_items ri
      join public.goods_receipts gr on gr.id=ri.receipt_id
        and gr.organization_id=ri.organization_id
      where ri.organization_id=item.organization_id
        and ri.po_item_id=item.id and gr.project_id=p_project_id
    ) received on true
    where po.organization_id=v_org and po.project_id=p_project_id
      and po.status not in ('draft','cancelled','void')
      and item.cost_kind='material'
    order by po.issued_at desc nulls last,item.sort_order limit 40
  ) m;

  -- Site requests are shown separately, never mistaken for delivered stock.
  -- Do not return internal procurement prices, vendors or instructions.
  select coalesce(v_materials,'[]'::jsonb) ||
    coalesce(jsonb_agg(jsonb_build_object(
      'description',requested.item,'unit',requested.unit,
      'ordered_quantity',requested.quantity::text,'po_number',null,
      'expected_date',null,'sort_time',requested.created_at,
      'status','requested','received_date',null
    ) order by requested.created_at desc),'[]'::jsonb)
  into v_materials
  from (
    select item,unit,quantity,created_at
    from private.site_material_needs
    where organization_id=v_org and project_id=p_project_id
      and status not in ('cancelled','rejected')
    order by created_at desc limit 20
  ) requested;

  -- Reported QA decisions only. New inspections start pending, and a
  -- "passed" badge is shown only for an actually approved inspection.
  select coalesce(jsonb_agg(to_jsonb(q) order by q.sort_time desc),'[]'::jsonb)
  into v_checks from (
    select name,status,inspection_date as due_date,
           approved_at as completed_at, created_at as sort_time,
           source
    from (
      select coalesce(nullif(t.name,''),'Quality inspection') as name,
        i.status, i.inspection_date,
        i.approved_at,i.created_at,'inspection'::text as source
      from public.project_inspections i
      left join public.inspection_templates t on t.id=i.template_id
        and t.organization_id=i.organization_id
      where i.organization_id=v_org and i.project_id=p_project_id
      union all
      select c.title,c.status,c.due_date,c.checked_at,c.created_at,
        'site_check'::text
      from private.site_checks c
      where c.organization_id=v_org and c.project_id=p_project_id
    ) all_checks
    order by created_at desc limit 35
  ) q;

  select to_jsonb(r) into v_latest
  from (
    select report_date,completed_work,tomorrow_plan,worker_count,tomorrow_workers,
      checks_done,checks_required,created_at
    from private.site_reports
    where organization_id=v_org and project_id=p_project_id
    order by report_date desc,created_at desc limit 1
  ) r;

  -- Limited client-friendly activity: no private manager decisions, financial
  -- records, procurement terms or user emails.
  select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at desc),'[]'::jsonb)
  into v_recent
  from (
    select category,summary,created_at from (
      select 'site_update'::text category,
        left(completed_work,360) summary,created_at
      from private.site_reports
      where organization_id=v_org and project_id=p_project_id
      union all
      select 'photo'::text,
        left(coalesce(nullif(caption,''),'New site photograph'),360),created_at
      from private.site_media
      where organization_id=v_org and project_id=p_project_id
        and category in ('site','daily','curing','design')
      union all
      select 'quality'::text,
        left(coalesce(nullif(title,''),'Site quality check') || ' · ' ||
          replace(status,'_',' '),360),created_at
      from private.site_checks
      where organization_id=v_org and project_id=p_project_id
      union all
      select 'material'::text,
        'Material receipt recorded'::text,created_at
      from public.goods_receipts
      where organization_id=v_org and project_id=p_project_id
    ) events
    order by created_at desc limit 12
  ) event;
  return jsonb_build_object(
    'materials',coalesce(v_materials,'[]'::jsonb),
    'checks',coalesce(v_checks,'[]'::jsonb),
    'latest_report',v_latest,
    'updates',coalesce(v_recent,'[]'::jsonb),
    'local_date',v_date
  );
end;
$$;
revoke all on function public.client_portal_dashboard(uuid) from public,anon;
grant execute on function public.client_portal_dashboard(uuid) to authenticated;
commit;
