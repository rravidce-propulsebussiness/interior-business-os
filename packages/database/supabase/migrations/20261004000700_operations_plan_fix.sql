begin;
create or replace function public.operations_plan(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;c public.contracts;p public.execution_plans;r public.execution_plan_revisions;e public.execution_estimate_revisions;target uuid;permission text;next_status text=p_input->>'status';begin
 permission=case when p_operation='approve' then 'execution.approve' else 'execution.manage' end;
 perform private.ops_require(org,permission);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 or p_input-array['id','version','contract_id','manager_id','notes','planned_start','planned_end','status','reason']<>'{}'::jsonb or p_operation not in ('create','revise','approve','status') then raise exception 'Invalid plan command' using errcode='22023';end if;
 if p_operation='create' then
 select * into c from public.contracts where organization_id=org and id=(p_input->>'contract_id')::uuid;
 if c.id is null or c.status in ('closed','cancelled') or not private.ops_project(org,c.project_id) then raise exception 'Available accepted contract required' using errcode='42501';end if;
 select * into p from public.execution_plans where contract_id=c.id;
 if p.id is not null then return p.id;end if;
 select revision.* into e from public.execution_estimates root join public.execution_estimate_revisions revision on revision.id=root.current_approved_revision_id where root.contract_id=c.id;
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
commit;
