begin;
create function private.ops_plan_snapshot(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('plan',to_jsonb(p),'work_packages',coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at,w.id) from public.work_packages w where w.plan_id=p.id),'[]'),'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by m.sequence,m.id) from public.project_milestones m where m.plan_id=p.id),'[]'),'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from public.project_tasks t where t.plan_id=p.id),'[]'),'dependencies',coalesce((select jsonb_agg(to_jsonb(d)) from public.task_dependencies d join public.project_tasks t on t.id=d.task_id where t.plan_id=p.id),'[]')) from public.execution_plans p where p.id=target;
$$;
create function public.operations_plan(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;c public.contracts;p public.execution_plans;r public.execution_plan_revisions;e public.execution_estimate_revisions;target uuid;permission text;next_status text=p_input->>'status';begin
 permission=case when p_operation='approve' then 'execution.approve' else 'execution.manage' end;
 perform private.ops_require(org,permission);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 or p_input-array['id','version','contract_id','manager_id','notes','planned_start','planned_end','status','reason']<>'{}'::jsonb or p_operation not in ('create','revise','approve','status') then raise exception 'Invalid plan command' using errcode='22023';end if;
 if p_operation='create' then
 select * into c from public.contracts where organization_id=org and id=(p_input->>'contract_id')::uuid;
 if c.id is null or c.status in ('closed','cancelled') or not private.ops_project(org,c.project_id) then raise exception 'Available accepted contract required' using errcode='42501';end if;
 select * into p from public.execution_plans where contract_id=c.id;
 if p.id is not null then return p.id;end if;
 select r.* into e from public.execution_estimates root join public.execution_estimate_revisions r on r.id=root.current_approved_revision_id where root.contract_id=c.id;
 if e.id is null or e.scope_fingerprint<>md5(private.execution_scope(c.id)::text) then raise exception 'Current approved estimate required' using errcode='23514';end if;
 perform private.ops_assignee(org,c.project_id,(p_input->>'manager_id')::uuid);
 insert into public.execution_plans(organization_id,project_id,contract_id,plan_number,status,manager_id,notes,planned_start,planned_end) values(org,c.project_id,c.id,private.finance_number(org,'execution_plan','PLAN'),'planning',(p_input->>'manager_id')::uuid,coalesce(p_input->>'notes',''),(p_input->>'planned_start')::date,(p_input->>'planned_end')::date) returning * into p;
 insert into public.execution_plan_revisions(organization_id,project_id,plan_id,revision_number,estimate_revision_id,scope_fingerprint) values(org,c.project_id,p.id,1,e.id,e.scope_fingerprint);
 perform private.ops_event(org,p.project_id,'execution_plans',p.id,'execution.plan_created');return p.id;
 end if;
 if p_operation='approve' then
 select * into r from public.execution_plan_revisions where organization_id=org and id=(p_input->>'id')::uuid for update;
 select * into p from public.execution_plans where id=r.plan_id;
 if r.id is null or not private.ops_project(org,p.project_id) then raise exception 'Unavailable plan revision' using errcode='42501';end if;
 if r.status<>'draft' or r.version is distinct from (p_input->>'version')::integer then raise exception 'Current draft revision required' using errcode='40001';end if;
 select revision.* into e from public.execution_estimates root join public.execution_estimate_revisions revision on revision.id=root.current_approved_revision_id where root.contract_id=p.contract_id;
 if e.id is distinct from r.estimate_revision_id or e.scope_fingerprint<>md5(private.execution_scope(p.contract_id)::text) then raise exception 'Plan estimate is stale; create a current revision' using errcode='40001';end if;
 if not exists(select 1 from public.project_tasks where plan_id=p.id) then raise exception 'Plan requires execution tasks' using errcode='23514';end if;
 update public.execution_plan_revisions set status='superseded' where plan_id=p.id and status='approved';
 update public.execution_plan_revisions set status='approved',version=version+1,snapshot=private.ops_plan_snapshot(p.id),approved_at=now(),approved_by=auth.uid() where id=r.id;
 perform private.ops_event(org,p.project_id,'execution_plan_revisions',r.id,'execution.plan_approved','draft','approved');return r.id;
 end if;
 select * into p from public.execution_plans where organization_id=org and id=(p_input->>'id')::uuid for update;
 if p.id is null or not private.ops_project(org,p.project_id) then raise exception 'Unavailable plan' using errcode='42501';end if;
 if p_operation='revise' then
 select id into target from public.execution_plan_revisions where plan_id=p.id and status='draft';if target is not null then return target;end if;
 if p.status in ('completed','cancelled','handed_over') then raise exception 'Plan is closed' using errcode='23514';end if;
 if p.version is distinct from (p_input->>'version')::integer then raise exception 'Stale plan version' using errcode='40001';end if;
 select revision.* into e from public.execution_estimates root join public.execution_estimate_revisions revision on revision.id=root.current_approved_revision_id where root.contract_id=p.contract_id;
 if e.id is null or e.scope_fingerprint<>md5(private.execution_scope(p.contract_id)::text) then raise exception 'Current approved estimate required' using errcode='23514';end if;
 insert into public.execution_plan_revisions(organization_id,project_id,plan_id,revision_number,estimate_revision_id,scope_fingerprint,notes) select org,p.project_id,p.id,coalesce(max(revision_number),0)+1,e.id,e.scope_fingerprint,coalesce(p_input->>'notes','') from public.execution_plan_revisions where plan_id=p.id returning id into target;
 update public.execution_plans set version=version+1 where id=p.id;
 perform private.ops_event(org,p.project_id,'execution_plan_revisions',target,'execution.plan_revised');return target;
 end if;
 if p.version is distinct from (p_input->>'version')::integer or p.status=next_status then raise exception 'Stale plan version or status' using errcode='40001';end if;
 if not ((p.status in ('not_started','planning') and next_status in ('planning','in_progress','cancelled')) or (p.status='in_progress' and next_status in ('on_hold','punch_list','cancelled')) or (p.status='on_hold' and next_status in ('in_progress','cancelled')) or (p.status='punch_list' and next_status in ('in_progress','ready_for_handover')) or (p.status='ready_for_handover' and next_status='punch_list') or (p.status='handed_over' and next_status='completed')) then raise exception 'Invalid physical execution transition' using errcode='23514';end if;
 if next_status in ('on_hold','cancelled') and length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Reason required' using errcode='22023';end if;
 if next_status='in_progress' and not exists(select 1 from public.execution_plan_revisions where plan_id=p.id and status='approved') then raise exception 'Approve execution plan first' using errcode='23514';end if;
 if next_status in ('ready_for_handover','completed') and not (private.ops_readiness(org,p.project_id)->>'ready')::boolean then raise exception 'Handover readiness requirements are not satisfied' using errcode='23514';end if;
 if next_status='completed' and not exists(select 1 from public.handover_records where plan_id=p.id and status='approved') then raise exception 'Approved handover required' using errcode='23514';end if;
 update public.execution_plans set status=next_status,version=version+1,actual_start=case when next_status='in_progress' then coalesce(actual_start,current_date) else actual_start end,actual_end=case when next_status='completed' then current_date else actual_end end where id=p.id;
 perform private.ops_event(org,p.project_id,'execution_plans',p.id,'execution.status_changed',p.status,next_status,coalesce(p_input->>'reason',''));return p.id;
end$$;
create function public.operations_task(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;t public.project_tasks;m public.project_milestones;next_status text=p_input->>'status';progress numeric;target uuid;predecessor public.project_tasks;begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>15000 or p_input-array['id','version','status','completion_percentage','reason','predecessor_id','note']<>'{}'::jsonb or p_operation not in ('task','milestone','dependency_add','dependency_remove','note') then raise exception 'Invalid task command' using errcode='22023';end if;
 perform private.ops_require(org,case when p_operation='milestone' then 'milestone.manage' else 'task.manage' end);
 if p_operation='milestone' then
 select * into m from public.project_milestones where organization_id=org and id=(p_input->>'id')::uuid for update;
 if m.id is null or not private.ops_project(org,m.project_id) then raise exception 'Unavailable milestone' using errcode='42501';end if;
 if m.version is distinct from (p_input->>'version')::integer or m.status in ('completed','cancelled') then raise exception 'Stale or final milestone' using errcode='40001';end if;
 if next_status not in ('not_started','in_progress','blocked','completed','cancelled') then raise exception 'Invalid milestone status' using errcode='22023';end if;
 progress=case when next_status='completed' then 100 else private.execution_decimal(coalesce(p_input->>'completion_percentage',m.completion_percentage)) end;
 if progress=100 and next_status<>'cancelled' then next_status='completed';end if;
 if next_status='completed' and exists(select 1 from public.project_tasks where milestone_id=m.id and status not in ('done','cancelled')) then raise exception 'Complete milestone tasks first' using errcode='23514';end if;
 if next_status='blocked' and length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Block reason required' using errcode='22023';end if;
 update public.project_milestones set status=next_status,completion_percentage=trim_scale(progress)::text,version=version+1,actual_start=case when next_status='in_progress' then coalesce(actual_start,current_date) else actual_start end,actual_end=case when next_status='completed' then current_date else actual_end end where id=m.id;
 perform private.ops_event(org,m.project_id,'project_milestones',m.id,'execution.milestone_updated',m.status,next_status,coalesce(p_input->>'reason',''));return m.id;
 end if;
 select * into t from public.project_tasks where organization_id=org and id=(p_input->>'id')::uuid for update;
 if t.id is null or not private.ops_project(org,t.project_id) then raise exception 'Unavailable task' using errcode='42501';end if;
 if t.version is distinct from (p_input->>'version')::integer then raise exception 'Stale task version' using errcode='40001';end if;
 if exists(select 1 from public.execution_plans where id=t.plan_id and status in ('completed','cancelled','handed_over')) then raise exception 'Execution plan is closed' using errcode='23514';end if;
 if p_operation='note' then
 if length(trim(coalesce(p_input->>'note',''))) not between 1 and 10000 then raise exception 'Site note required' using errcode='22023';end if;
 update public.project_tasks set version=version+1 where id=t.id;perform private.ops_event(org,t.project_id,'project_tasks',t.id,'execution.site_note',null,null,p_input->>'note');return t.id;end if;
 if p_operation like 'dependency_%' then
 perform private.ops_require(org,'execution.manage',t.project_id);
 if not exists(select 1 from public.execution_plan_revisions where plan_id=t.plan_id and status='draft') then raise exception 'Draft plan revision required' using errcode='40001';end if;
 select * into predecessor from public.project_tasks where organization_id=org and project_id=t.project_id and plan_id=t.plan_id and id=(p_input->>'predecessor_id')::uuid;
 if predecessor.id is null or predecessor.id=t.id then raise exception 'Invalid dependency' using errcode='23514';end if;
 if p_operation='dependency_add' then
 if exists(with recursive chain(id) as (select predecessor.id union select d.predecessor_id from public.task_dependencies d join chain c on d.task_id=c.id) select 1 from chain where id=t.id) then raise exception 'Circular task dependency' using errcode='23514';end if;
 insert into public.task_dependencies(organization_id,project_id,task_id,predecessor_id) values(org,t.project_id,t.id,predecessor.id) on conflict(task_id,predecessor_id) do nothing;
 else delete from public.task_dependencies where organization_id=org and task_id=t.id and predecessor_id=predecessor.id;end if;
 update public.project_tasks set version=version+1 where id=t.id;
 perform private.ops_event(org,t.project_id,'project_tasks',t.id,'execution.'||p_operation);return t.id;
 end if;
 if next_status not in ('todo','in_progress','blocked','done','cancelled') or t.status in ('done','cancelled') then raise exception 'Invalid or final task status' using errcode='40001';end if;
 progress=case when next_status='done' then 100 else private.execution_decimal(coalesce(p_input->>'completion_percentage',t.completion_percentage)) end;
 if progress=100 and next_status<>'cancelled' then next_status='done';end if;
 if next_status='done' and exists(select 1 from public.task_dependencies d join public.project_tasks pred on pred.id=d.predecessor_id where d.task_id=t.id and pred.status<>'done') then raise exception 'Unfinished predecessor blocks task completion' using errcode='23514';end if;
 if next_status='blocked' and length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Block reason required' using errcode='22023';end if;
 update public.project_tasks set status=next_status,completion_percentage=trim_scale(progress)::text,version=version+1,block_reason=case when next_status='blocked' then p_input->>'reason' else '' end,blocked_at=case when next_status='blocked' then now() end,blocked_by=case when next_status='blocked' then auth.uid() end,actual_start=case when next_status='in_progress' then coalesce(actual_start,current_date) else actual_start end,actual_end=case when next_status='done' then current_date else actual_end end where id=t.id;
 perform private.ops_event(org,t.project_id,'project_tasks',t.id,'execution.task_updated',t.status,next_status,coalesce(p_input->>'reason',''));return t.id;
end$$;
create function public.operations_issue_request(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;r public.material_issue_requests;target uuid;project uuid;item jsonb;approved numeric;total numeric=0;begin
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>60000 or p_input-array['id','version','project_id','source_location_id','destination_location_id','reason','items']<>'{}'::jsonb or p_operation not in ('create','submit','approve','reject','cancel') then raise exception 'Invalid issue request' using errcode='22023';end if;
 perform private.ops_require(org,case when p_operation in ('approve','reject') then 'material_issue.approve' else 'material_issue.request' end);
 if p_operation='create' then
 project=(p_input->>'project_id')::uuid;
 if not private.ops_project(org,project) then raise exception 'Unavailable project' using errcode='42501';end if;
 if not exists(select 1 from public.inventory_locations where organization_id=org and id=(p_input->>'source_location_id')::uuid and active and kind<>'project_site') or not exists(select 1 from public.inventory_locations where organization_id=org and id=(p_input->>'destination_location_id')::uuid and active and site_project_id=project) then raise exception 'Active store and matching project site required' using errcode='23514';end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Request requires bounded items' using errcode='22023';end if;
 insert into public.material_issue_requests(organization_id,project_id,request_number,source_location_id,destination_location_id,reason) values(org,project,private.finance_number(org,'material_request','MIR'),(p_input->>'source_location_id')::uuid,(p_input->>'destination_location_id')::uuid,p_input->>'reason') returning id into target;
 for item in select jsonb_array_elements(p_input->'items') loop
 if item-array['variant_id','unit','quantity']<>'{}'::jsonb or not exists(select 1 from public.material_variants v join public.material_unit_conversions c on c.id=v.active_conversion_id where v.organization_id=org and v.id=(item->>'variant_id')::uuid and v.status='active' and c.purchase_unit=item->>'unit') then raise exception 'Invalid requested material or unit' using errcode='22023';end if;
 insert into public.material_issue_request_items(organization_id,project_id,request_id,variant_id,unit,quantity) values(org,project,target,(item->>'variant_id')::uuid,item->>'unit',item->>'quantity');end loop;
 perform private.ops_event(org,project,'material_issue_requests',target,'inventory.request_created');return target;
 end if;
 select * into r from public.material_issue_requests where organization_id=org and id=(p_input->>'id')::uuid for update;
 if r.id is null or not private.ops_project(org,r.project_id) then raise exception 'Unavailable issue request' using errcode='42501';end if;
 if r.version is distinct from (p_input->>'version')::integer then raise exception 'Stale request version' using errcode='40001';end if;
 if p_operation='submit' and r.status='draft' then update public.material_issue_requests set status='submitted',version=version+1 where id=r.id;
 elsif p_operation='approve' and r.status='submitted' then
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items')<>(select count(*) from public.material_issue_request_items where request_id=r.id) then raise exception 'Review every requested item' using errcode='22023';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_input->'items')x)<>jsonb_array_length(p_input->'items') then raise exception 'Duplicate approval item' using errcode='22023';end if;
 for item in select jsonb_array_elements(p_input->'items') loop
 approved=private.execution_decimal(item->>'approved_quantity');
 if item-array['id','approved_quantity']<>'{}'::jsonb then raise exception 'Invalid approval fields' using errcode='22023';end if;
 update public.material_issue_request_items set approved_quantity=trim_scale(approved)::text where organization_id=org and request_id=r.id and id=(item->>'id')::uuid;
 if not found then raise exception 'Unknown requested item' using errcode='42501';end if;total=total+approved;end loop;
 if total=0 then raise exception 'Approve a positive quantity or reject the request' using errcode='23514';end if;
 update public.material_issue_requests set status='approved',approved_by=auth.uid(),approved_at=now(),version=version+1 where id=r.id;
 elsif p_operation in ('reject','cancel') and r.status in ('draft','submitted','approved') then
 if length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Reason required' using errcode='22023';end if;
 update public.material_issue_requests set status=case when p_operation='reject' then 'rejected' else 'cancelled' end,version=version+1 where id=r.id;
 else raise exception 'Invalid issue request transition' using errcode='40001';end if;
 perform private.ops_event(org,r.project_id,'material_issue_requests',r.id,'inventory.request_'||p_operation,r.status,null,coalesce(p_input->>'reason',''));return r.id;
end$$;
revoke all on function private.ops_plan_snapshot(uuid),public.operations_plan(uuid,text,jsonb),public.operations_task(uuid,text,jsonb),public.operations_issue_request(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.operations_plan(uuid,text,jsonb),public.operations_task(uuid,text,jsonb),public.operations_issue_request(uuid,text,jsonb) to authenticated;
commit;
