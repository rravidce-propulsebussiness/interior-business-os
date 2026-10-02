begin;
create function public.operations_search(p_organization_id uuid,p_entity text,p_filter jsonb default '{}',p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare permission text;rows jsonb;total bigint;begin
 case p_entity
when 'project_execution_members' then permission='execution.view';
when 'execution_plans' then permission='execution.view';
when 'execution_plan_revisions' then permission='execution.view';
when 'work_packages' then permission='execution.view';
when 'project_milestones' then permission='milestone.view';
when 'project_tasks' then permission='task.view';
when 'task_dependencies' then permission='task.view';
when 'inventory_locations' then permission='inventory.view';
when 'inventory_lots' then permission='inventory.view';
when 'inventory_lot_costs' then permission='cost.execution.view';
when 'material_issue_requests' then permission='material_issue.view';
when 'material_issue_request_items' then permission='material_issue.view';
when 'inventory_transactions' then permission='inventory.view';
when 'inventory_movements' then permission='inventory.view';
when 'inventory_counts' then permission='inventory.count';
when 'vendor_execution_profiles' then permission='subcontractor.view';
when 'subcontractor_work_orders' then permission='subcontractor.view';
when 'subcontractor_work_order_costs' then permission='cost.execution.view';
when 'work_measurements' then permission='subcontractor.view';
when 'work_measurement_costs' then permission='cost.execution.view';
when 'inspection_templates' then permission='inspection.view';
when 'project_inspections' then permission='inspection.view';
when 'project_snags' then permission='snag.view';
when 'handover_templates' then permission='handover.view';
when 'handover_records' then permission='handover.view';
when 'project_execution_events' then permission='execution.view';
 else raise exception 'Unknown operations entity' using errcode='22023';end case;
 if not private.ops_access(p_organization_id,permission) then raise exception 'Unavailable records' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 or jsonb_typeof(p_filter) is distinct from 'object' or octet_length(p_filter::text)>3000 or p_filter-array['id','project_id','plan_id','request_id','work_order_id','transaction_id','lot_id','location_id','entity_id','status']<>'{}'::jsonb then raise exception 'Invalid search' using errcode='22023';end if;
 execute format('select count(*) from public.%I t where organization_id=$1 and not exists(select 1 from jsonb_each_text($2) f where to_jsonb(t)->>f.key is distinct from f.value)',p_entity) into total using p_organization_id,p_filter;
 execute format('select coalesce(jsonb_agg(row),''[]'') from (select to_jsonb(t)-''request_hash'' row from public.%I t where organization_id=$1 and not exists(select 1 from jsonb_each_text($2) f where to_jsonb(t)->>f.key is distinct from f.value) order by created_at desc,id limit 25 offset $3)x',p_entity) into rows using p_organization_id,p_filter,(p_page-1)*25;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
revoke all on function public.operations_search(uuid,text,jsonb,integer) from public,anon;grant execute on function public.operations_search(uuid,text,jsonb,integer) to authenticated;
commit;
