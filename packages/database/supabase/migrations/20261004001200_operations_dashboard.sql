begin;
create function private.ops_lot_visible(org uuid,lot uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.ops_access(org,'inventory.view') and (private.has_permission(org,'inventory.view_all') or exists(select 1 from public.inventory_movements m where m.organization_id=org and m.lot_id=lot and private.ops_project(org,m.project_id)));
$$;
revoke all on function private.ops_lot_visible(uuid,uuid) from public,anon;
grant execute on function private.ops_lot_visible(uuid,uuid) to authenticated;
drop policy operations_read on public.inventory_lots;
create policy operations_read on public.inventory_lots for select to authenticated using(private.ops_lot_visible(organization_id,id));

create function public.operations_balances(p_organization_id uuid,p_project_id uuid default null,p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb;total bigint;begin
 if not private.ops_access(p_organization_id,'inventory.view',p_project_id) then raise exception 'Unavailable inventory' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 select count(*) into total from(select m.location_id,m.lot_id from public.inventory_movements m join public.inventory_locations l on l.id=m.location_id where m.organization_id=p_organization_id and (p_project_id is null or l.site_project_id=p_project_id) group by m.location_id,m.lot_id)x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select m.location_id,m.lot_id,l.name location,lot.label material,lot.variant_id,lot.unit,trim_scale(sum(m.quantity::numeric))::text available from public.inventory_movements m join public.inventory_locations l on l.id=m.location_id join public.inventory_lots lot on lot.id=m.lot_id where m.organization_id=p_organization_id and (p_project_id is null or l.site_project_id=p_project_id) group by m.location_id,m.lot_id,l.name,lot.label,lot.variant_id,lot.unit order by l.name,lot.label,m.location_id,m.lot_id limit 25 offset (p_page-1)*25)x;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
create function public.operations_dashboard(p_organization_id uuid,p_project_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.ops_access(p_organization_id,'execution.view',p_project_id) or p_project_id is null then raise exception 'Unavailable project' using errcode='42501';end if;
 select jsonb_build_object('project_id',p_project_id,'progress',coalesce(trim_scale(round(sum(weight::numeric*completion_percentage::numeric)/nullif(sum(weight::numeric),0),2))::text,'0'),'blocked_tasks',count(*) filter(where status='blocked'),'overdue_tasks',count(*) filter(where planned_end<current_date and status<>'done'),'upcoming_tasks',count(*) filter(where planned_start between current_date and current_date+7 and status<>'done'),'unfinished_tasks',count(*) filter(where status<>'done')) into result from public.project_tasks where organization_id=p_organization_id and project_id=p_project_id and status<>'cancelled';
 return result||jsonb_build_object('readiness',private.ops_readiness(p_organization_id,p_project_id),'open_snags',(select count(*) from public.project_snags where organization_id=p_organization_id and project_id=p_project_id and status<>'closed'),'pending_inspections',(select count(*) from public.project_inspections where organization_id=p_organization_id and project_id=p_project_id and status in ('draft','in_progress')),'current_milestone',(select name from public.project_milestones where organization_id=p_organization_id and project_id=p_project_id and status not in ('completed','cancelled') order by sequence,created_at,id limit 1));
end$$;
revoke all on function public.operations_balances(uuid,uuid,integer),public.operations_dashboard(uuid,uuid) from public,anon;
grant execute on function public.operations_balances(uuid,uuid,integer),public.operations_dashboard(uuid,uuid) to authenticated;
commit;
