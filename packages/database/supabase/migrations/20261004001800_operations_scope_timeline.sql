begin;
create function private.ops_package_source() returns trigger language plpgsql security definer set search_path='' as $$
declare scope public.execution_estimate_scope_items;c uuid;begin
 select contract_id into c from public.execution_plans where id=new.plan_id and organization_id=new.organization_id;
 if new.scope_id is not null then
  select * into scope from public.execution_estimate_scope_items where id=new.scope_id and organization_id=new.organization_id and contract_id=c;
  if scope.id is null then raise exception 'Work package scope does not match contract' using errcode='23514';end if;
  new.source_type=scope.source_type;new.source_id=scope.source_id;
 elsif new.source_type<>'manual' and not exists(select 1 from jsonb_array_elements(private.execution_scope(c))x where x->>'source_type'=new.source_type and x->>'source_id'=new.source_id::text) then raise exception 'Approved commercial source required' using errcode='23514';
 elsif new.source_type='manual' and new.source_id is not null then raise exception 'Manual package cannot claim a commercial source' using errcode='23514';end if;
 return new;
end$$;
create trigger operations_package_source before insert or update on public.work_packages for each row execute function private.ops_package_source();
revoke all on function private.ops_package_source() from public,anon,authenticated;
create function public.operations_scope_status(p_organization_id uuid,p_project_id uuid,p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;total bigint;begin
 if p_project_id is null or not private.ops_access(p_organization_id,'execution.view',p_project_id) then raise exception 'Unavailable execution scope' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 with current_scope as(select c.id contract_id,c.contract_number,x->>'source_type' source_type,(x->>'source_id')::uuid source_id,x->>'area_name' area,x#>>'{snapshot,name}' title from public.contracts c cross join lateral jsonb_array_elements(private.execution_scope(c.id))x where c.organization_id=p_organization_id and c.project_id=p_project_id),
 scope_rows as(select s.*,coalesce((select w.scope_state from public.work_packages w join public.execution_plans p on p.id=w.plan_id where w.organization_id=p_organization_id and w.project_id=p_project_id and p.contract_id=s.contract_id and w.source_type=s.source_type and w.source_id=s.source_id order by w.updated_at desc,w.id limit 1),case when exists(select 1 from public.execution_estimates e join public.execution_estimate_scope_items i on i.revision_id=e.current_approved_revision_id where e.contract_id=s.contract_id and i.source_type=s.source_type and i.source_id=s.source_id and i.coverage in ('estimated','excluded')) then 'estimated' else 'not_estimated' end) status from current_scope s
 union all select distinct p.contract_id,c.contract_number,w.source_type,w.source_id,coalesce(a.name,''),w.name,case when w.scope_state='no_longer_required' then 'no_longer_required' else 'removed_pending_confirmation' end from public.work_packages w join public.execution_plans p on p.id=w.plan_id join public.contracts c on c.id=p.contract_id left join public.project_areas a on a.id=w.area_id where w.organization_id=p_organization_id and w.project_id=p_project_id and w.source_type<>'manual' and not exists(select 1 from current_scope s where s.contract_id=p.contract_id and s.source_type=w.source_type and s.source_id=w.source_id))
 select (select count(*) from scope_rows),coalesce((select jsonb_agg(to_jsonb(x)) from(select * from scope_rows order by contract_number,source_type,source_id limit 25 offset (p_page-1)*25)x),'[]') into total,rows;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
create function public.operations_timeline(p_organization_id uuid,p_project_id uuid,p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb;total bigint;begin
 if p_project_id is null or not private.ops_access(p_organization_id,'execution.view',p_project_id) then raise exception 'Unavailable project timeline' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid page' using errcode='22023';end if;
 with events as(select e.id,e.created_at,e.created_by actor_user_id,e.action,e.entity entity_type,e.entity_id::text,e.note from public.project_execution_events e where e.organization_id=p_organization_id and e.project_id=p_project_id
 union all select a.id,a.created_at,a.actor_user_id,a.action,a.entity_type,a.entity_id,'' from public.audit_logs a where a.organization_id=p_organization_id and (
 a.entity_type='contracts' and exists(select 1 from public.contracts c where c.id::text=a.entity_id and c.project_id=p_project_id) or
 a.entity_type='execution_estimate_revisions' and exists(select 1 from public.execution_estimate_revisions r where r.id::text=a.entity_id and r.project_id=p_project_id) or
 a.entity_type='purchase_orders' and exists(select 1 from public.purchase_orders p where p.id::text=a.entity_id and p.project_id=p_project_id) or
 a.entity_type='goods_receipts' and exists(select 1 from public.goods_receipts r where r.id::text=a.entity_id and r.project_id=p_project_id) or
 a.entity_type='change_orders' and exists(select 1 from public.change_orders co join public.contracts c on c.id=co.contract_id where co.id::text=a.entity_id and c.project_id=p_project_id)))
 select (select count(*) from events),coalesce((select jsonb_agg(to_jsonb(x)) from(select * from events order by created_at desc,id limit 25 offset (p_page-1)*25)x),'[]') into total,rows;
 return jsonb_build_object('rows',rows,'total',total,'page',p_page,'page_size',25);
end$$;
revoke all on function public.operations_scope_status(uuid,uuid,integer),public.operations_timeline(uuid,uuid,integer) from public,anon;
grant execute on function public.operations_scope_status(uuid,uuid,integer),public.operations_timeline(uuid,uuid,integer) to authenticated;
commit;
