begin;
create function public.execution_cost_dashboard(p_organization_id uuid,p_project_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;contracts jsonb='[]';x jsonb;breakdown jsonb;commercial jsonb;baseline numeric;changes numeric;begin
 result=public.execution_cost_report(p_organization_id,p_project_id);
 for x in select jsonb_array_elements(result->'contracts') loop
 select coalesce(jsonb_object_agg(cost_kind,amount),'{}') into breakdown from (
 select l.cost_kind,trim_scale(sum(lc.estimated_cost::numeric))::text amount from public.execution_estimates e join public.execution_estimate_lines l on l.revision_id=e.current_approved_revision_id join public.execution_estimate_scope_items s on s.id=l.scope_id join public.execution_estimate_line_costs lc on lc.line_id=l.id where e.contract_id=(x->>'contract_id')::uuid and s.coverage='estimated' group by l.cost_kind)b;
 commercial=null;
 if private.has_permission(p_organization_id,'contract.view') and private.entitled(p_organization_id,'billing') then
 select original_contract_value::numeric into baseline from public.contracts where id=(x->>'contract_id')::uuid;
 select coalesce(sum(net_adjustment::numeric),0) into changes from public.change_orders where contract_id=(x->>'contract_id')::uuid and status='approved';
 commercial=jsonb_build_object('original_value',trim_scale(baseline)::text,'approved_changes',trim_scale(changes)::text,'current_value',trim_scale(baseline+changes)::text,'estimated_contribution',case when x->>'estimated_cost' is not null then trim_scale(baseline+changes-(x->>'estimated_cost')::numeric)::text end);end if;
 contracts=contracts||jsonb_build_array(x||jsonb_build_object('estimated_by_kind',breakdown,'commercial',commercial));end loop;
 return jsonb_set(result,'{contracts}',contracts);
end$$;
create function public.execution_po_progress(p_organization_id uuid,p_po_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.execution_access(p_organization_id,'purchase_order.view') or not exists(select 1 from public.purchase_orders where organization_id=p_organization_id and id=p_po_id) then raise exception 'Unavailable receiving progress' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',pi.id,'description',pi.description,'unit',pi.unit,'ordered',pi.quantity,'received',trim_scale(coalesce(g.received,0))::text,'accepted',trim_scale(coalesce(g.accepted,0))::text,'rejected',trim_scale(coalesce(g.rejected,0))::text,'remaining',trim_scale(pi.quantity::numeric-coalesce(g.received,0))::text) order by pi.sort_order,pi.id),'[]') into result from public.purchase_order_items pi left join lateral(select sum(received_quantity::numeric) received,sum(accepted_quantity::numeric) accepted,sum(rejected_quantity::numeric) rejected from public.goods_receipt_items where po_item_id=pi.id)g on true where pi.po_id=p_po_id;
 return jsonb_build_object('items',result);
end$$;
create function public.execution_estimate_demand(p_organization_id uuid,p_revision_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.execution_estimate_revisions;l public.execution_estimate_lines;reserved numeric;ordered numeric;required numeric;line_reserved numeric;items jsonb='[]';begin
 if not private.execution_access(p_organization_id,'purchase_requisition.view') then raise exception 'Unavailable procurement demand' using errcode='42501';end if;
 select * into r from public.execution_estimate_revisions where organization_id=p_organization_id and id=p_revision_id;
 if r.id is null then raise exception 'Unavailable estimate' using errcode='42501';end if;
 for l in select lines.* from public.execution_estimate_lines lines join public.execution_estimate_scope_items s on s.id=lines.scope_id where lines.revision_id=r.id and s.coverage='estimated' order by lines.sort_order,lines.id loop
 select coalesce(sum(ps.quantity::numeric),0) into reserved from public.purchase_requisition_sources ps join public.purchase_requisitions pr on pr.id=ps.requisition_id join public.execution_estimate_lines pl on pl.id=ps.estimate_line_id join public.execution_estimate_scope_items prior_scope on prior_scope.id=pl.scope_id join public.execution_estimate_scope_items current_scope on current_scope.id=l.scope_id where pr.contract_id=r.contract_id and pr.status<>'cancelled' and prior_scope.source_type=current_scope.source_type and prior_scope.source_id=current_scope.source_id and pl.variant_id is not distinct from l.variant_id and pl.cost_kind=l.cost_kind and pl.purchase_unit=l.purchase_unit and (l.variant_id is not null or pl.description=l.description);
 select sum(planned_purchase_quantity::numeric) into required from public.execution_estimate_lines where scope_id=l.scope_id and variant_id is not distinct from l.variant_id and cost_kind=l.cost_kind and purchase_unit=l.purchase_unit and (l.variant_id is not null or description=l.description);
 select coalesce(sum(ps.quantity::numeric),0) into line_reserved from public.purchase_requisition_sources ps join public.purchase_requisitions pr on pr.id=ps.requisition_id where ps.estimate_line_id=l.id and pr.status<>'cancelled';
 select coalesce(sum(pi.quantity::numeric*ps.quantity::numeric/pri.quantity::numeric),0) into ordered from public.purchase_requisition_sources ps join public.purchase_requisition_items pri on pri.id=ps.item_id join public.purchase_order_items pi on pi.requisition_item_id=pri.id join public.purchase_orders po on po.id=pi.po_id where ps.estimate_line_id=l.id and po.status in ('issued','partially_received','received','closed');
 items=items||jsonb_build_array(jsonb_build_object('id',l.id,'description',l.description,'unit',l.purchase_unit,'required',l.planned_purchase_quantity,'requisitioned',trim_scale(line_reserved)::text,'ordered',trim_scale(round(ordered,6))::text,'remaining',trim_scale(greatest(0,least(l.planned_purchase_quantity::numeric-line_reserved,required-reserved)))::text));end loop;
 return jsonb_build_object('items',items,'ordered_allocation','Consolidated order quantities are attributed proportionally to source requisition quantities.');
end$$;
revoke all on function public.execution_cost_dashboard(uuid,uuid),public.execution_po_progress(uuid,uuid),public.execution_estimate_demand(uuid,uuid) from public,anon;
grant execute on function public.execution_cost_dashboard(uuid,uuid),public.execution_po_progress(uuid,uuid),public.execution_estimate_demand(uuid,uuid) to authenticated;
commit;
