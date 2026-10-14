-- Construction OS Phase 9: procurement readiness for approved next-day work.
-- Read-only aggregation of original Site Delivery requests. Never synthesizes
-- purchase orders, goods receipts, warehouse balances or supplier invoices.
begin;

create function public.construction_procurement_watch(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean; procurement boolean; can_update boolean;
begin
 if not private.construction_project_access(p_org,p_project)
 then raise exception 'Project unavailable' using errcode='42501';end if;
 manager=private.construction_can_manage(p_org,p_project);
 procurement=coalesce(
   private.site_role(p_org,p_project)='procurement'
   or exists(select 1 from private.construction_project_roles r
     where r.organization_id=p_org and r.project_id=p_project
      and r.user_id=auth.uid() and r.active
      and r.role in ('procurement','storekeeper')),false);
 if not coalesce(manager or procurement,false)
 then raise exception 'Procurement workspace unavailable' using errcode='42501';end if;
 can_update=coalesce(
   private.site_allowed(p_org,p_project,array['manager','procurement'])
   and exists(select 1 from private.site_state st
     where st.organization_id=p_org and st.project_id=p_project
       and st.stage='execution'),false);

 return jsonb_build_object(
  'can_update',can_update,
  'materials',coalesce((
     select jsonb_agg(jsonb_build_object(
       'material_id',m.id,
       'name',m.item,
       'unit',m.unit,
       'request_quantity',m.quantity,
       'required_quantity',link.required_quantity,
       'request_status',m.status,
       'source',m.source,
       'vendor_reference',m.vendor_reference,
       'work_date',p.work_date,
       'stage_id',p.stage_id,
       'stage_title',st.title,
       'plan_id',p.id,
       'readiness',case
         when m.status='requested' then 'approval_required'
         when m.status='approved' then 'ordering_required'
         when m.status='ordered' then 'delivery_pending'
         when m.status='received' then 'site_marked_received'
         else 'blocked' end
     ) order by p.work_date,p.created_at desc,st.sequence,m.item,m.id)
     from private.construction_tomorrow_plans p
     join private.construction_tomorrow_materials link
       on link.organization_id=p.organization_id
        and link.project_id=p.project_id and link.plan_id=p.id
     join private.site_material_needs m
       on m.organization_id=link.organization_id
        and m.project_id=link.project_id and m.id=link.material_id
     join private.construction_project_stages st
       on st.organization_id=p.organization_id
        and st.project_id=p.project_id and st.id=p.stage_id
     where p.organization_id=p_org and p.project_id=p_project
       and p.work_date between current_date and current_date+14
       and private.construction_tomorrow_state(p_org,p_project,p.id)='approved'
   ),'[]'::jsonb)
 );
end$$;

revoke all on function public.construction_procurement_watch(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.construction_procurement_watch(uuid,uuid)
 to authenticated;
commit;
