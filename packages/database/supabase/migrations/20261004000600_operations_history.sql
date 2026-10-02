begin;
-- Preserve finalized physical records independently of application privileges.
create function private.ops_history_guard() returns trigger language plpgsql set search_path='' as $$
declare a jsonb=to_jsonb(old);b jsonb=to_jsonb(new);begin
 if tg_op='DELETE' then raise exception 'Execution history cannot be deleted' using errcode='23514';end if;
 if a->'id' is distinct from b->'id' or a->'organization_id' is distinct from b->'organization_id' or a->'project_id' is distinct from b->'project_id' then raise exception 'Execution identity is immutable' using errcode='23514';end if;
 if tg_table_name='execution_plan_revisions' and a->>'status' in ('approved','superseded') then
  if not(a->>'status'='approved' and b->>'status'='superseded' and a-array['status','updated_at'] = b-array['status','updated_at']) then raise exception 'Approved plan revision is immutable' using errcode='23514';end if;
 elsif tg_table_name='project_inspections' and a->>'status' in ('passed','failed','requires_rework') or tg_table_name='handover_records' and a->>'status'='approved' or tg_table_name='work_measurements' and a->>'status' in ('certified','rejected') then
  raise exception 'Finalized execution record is immutable' using errcode='23514';
 elsif tg_table_name='subcontractor_work_orders' and a->>'status'<>'draft' and a-array['status','completed_percentage','accepted_percentage','actual_start','actual_end','version','updated_at'] is distinct from b-array['status','completed_percentage','accepted_percentage','actual_start','actual_end','version','updated_at'] then
  raise exception 'Issued work order scope is immutable' using errcode='23514';
 elsif tg_table_name='subcontractor_work_order_costs' and exists(select 1 from public.subcontractor_work_orders where id=(a->>'work_order_id')::uuid and status<>'draft') then
  raise exception 'Issued work order cost is immutable' using errcode='23514';
 end if;return new;
end$$;
create trigger operations_history before update or delete on public.execution_plan_revisions for each row execute function private.ops_history_guard();
create trigger operations_history before update or delete on public.project_inspections for each row execute function private.ops_history_guard();
create trigger operations_history before update or delete on public.handover_records for each row execute function private.ops_history_guard();
create trigger operations_history before update or delete on public.work_measurements for each row execute function private.ops_history_guard();
create trigger operations_history before update or delete on public.subcontractor_work_orders for each row execute function private.ops_history_guard();
create trigger operations_history before update or delete on public.subcontractor_work_order_costs for each row execute function private.ops_history_guard();
revoke all on function private.ops_history_guard() from public,anon,authenticated;

-- A current draft may adopt a newly approved estimate; approved snapshots stay intact.
create function public.operations_plan_refresh(p_organization_id uuid,p_id uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_plan_revisions;p public.execution_plans;e public.execution_estimate_revisions;begin
 perform private.ops_require(p_organization_id,'execution.manage');
 select * into r from public.execution_plan_revisions where organization_id=p_organization_id and id=p_id for update;
 select * into p from public.execution_plans where id=r.plan_id;
 if r.id is null or not private.ops_project(p_organization_id,r.project_id) then raise exception 'Unavailable plan revision' using errcode='42501';end if;
 if r.status<>'draft' or r.version is distinct from p_version or p.status in ('completed','cancelled','handed_over') then raise exception 'Current open draft required' using errcode='40001';end if;
 select revision.* into e from public.execution_estimates root join public.execution_estimate_revisions revision on revision.id=root.current_approved_revision_id where root.contract_id=p.contract_id;
 if e.id is null or e.scope_fingerprint<>md5(private.execution_scope(p.contract_id)::text) then raise exception 'Current approved estimate required' using errcode='23514';end if;
 update public.execution_plan_revisions set estimate_revision_id=e.id,scope_fingerprint=e.scope_fingerprint,version=version+1 where id=r.id;
 perform private.ops_event(p_organization_id,r.project_id,'execution_plan_revisions',r.id,'execution.plan_refreshed');return r.id;
end$$;
revoke all on function public.operations_plan_refresh(uuid,uuid,integer) from public,anon;
grant execute on function public.operations_plan_refresh(uuid,uuid,integer) to authenticated;
commit;

