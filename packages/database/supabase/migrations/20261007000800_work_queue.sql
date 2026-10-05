begin;
insert into private.automation_entities values
 ('material_request','material_issue_requests','material_issue.view','projects','operations','inventory'),
 ('requisition','purchase_requisitions','purchase_requisition.view','purchasing','execution','procurement');
-- A view over canonical work. No second task or approval store is created.
create function public.work_queue(p_organization_id uuid,p_group text default 'assigned',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;zone text;today date;begin
 if not private.has_permission(p_organization_id,'notification.view') then raise exception 'Unavailable work queue' using errcode='42501';end if;
 if p_group not in('assigned','today','overdue','upcoming','approvals','escalated','all') or p_page not between 1 and 10000 then raise exception 'Invalid queue filter' using errcode='22023';end if;
 select default_timezone into zone from public.organizations where id=p_organization_id;today=(now() at time zone zone)::date;
 with candidates as materialized(
 select 'followup' kind,id,assigned_to assignee,due_at due,false approval from public.lead_followups where organization_id=p_organization_id and status='pending'
 union all select 'task',id,assigned_to,(planned_end+time '23:59') at time zone zone,false from public.project_tasks where organization_id=p_organization_id and status not in('done','cancelled')
 union all select 'milestone',id,owner_id,(planned_end+time '23:59') at time zone zone,false from public.project_milestones where organization_id=p_organization_id and status not in('completed','cancelled')
 union all select 'inspection',id,inspector_id,(inspection_date+time '23:59') at time zone zone,status='in_progress' and private.ops_access(p_organization_id,'inspection.approve',project_id) from public.project_inspections where organization_id=p_organization_id and status in('draft','in_progress','requires_rework')
 union all select 'snag',id,assigned_to,(due_date+time '23:59') at time zone zone,status='ready_for_review' and private.ops_access(p_organization_id,'snag.verify',project_id) from public.project_snags where organization_id=p_organization_id and status not in('closed','verified')
 union all select 'handover',id,created_by,null,status='draft' and private.ops_access(p_organization_id,'handover.approve',project_id) from public.handover_records where organization_id=p_organization_id and status='draft'
 union all select 'quotation',id,created_by,null,private.commercial_access(p_organization_id,'quotation.approve','quotation') from public.quotation_revisions where organization_id=p_organization_id and status='draft'
 union all select 'material_request',id,requested_by,null,status='submitted' and private.ops_access(p_organization_id,'material_issue.approve',project_id) from public.material_issue_requests where organization_id=p_organization_id and status in('draft','submitted','approved','partially_issued')
 union all select 'requisition',id,created_by,null,status='submitted' and private.execution_access(p_organization_id,'purchase_requisition.approve') from public.purchase_requisitions where organization_id=p_organization_id and status in('draft','submitted')
 ), allowed as materialized(
 select c.*,private.automation_source(p_organization_id,kind,id) source from candidates c
 where (p_group<>'assigned' or assignee=auth.uid()) and (p_group<>'approvals' or approval)
 and (p_group<>'escalated' or exists(select 1 from public.notifications n join public.automation_jobs j on j.id=n.job_id join public.automation_events e on e.id=n.event_id where n.organization_id=p_organization_id and n.recipient_id=auth.uid() and n.status<>'archived' and j.action->>'kind'='escalation' and e.entity_kind=c.kind and e.entity_id=c.id))
 and (p_group<>'today' or (due at time zone zone)::date=today)
 and (p_group<>'overdue' or (due at time zone zone)::date<today)
 and (p_group<>'upcoming' or (due at time zone zone)::date>today)
 ), visible as materialized(select jsonb_build_object('kind',kind,'id',id,'title',source->>'title','number',source->>'number','status',source->>'status','project_id',source->>'project_id','project_name',source->>'project_name','lead_id',source->>'lead_id','quotation_id',source->>'quotation_id','assignee_id',assignee,'due_at',due,'approval',approval,'priority',source->>'priority') row from allowed where source is not null)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(row) from(select row from visible order by row->>'due_at' nulls last,row->>'id' limit 25 offset(p_page-1)*25)p),'[]'),'total',(select count(*) from visible),'page',p_page,'today',today,'timezone',zone) into result;
 return result;
end$$;
revoke all on function public.work_queue(uuid,text,integer) from public,anon,authenticated,business_os_worker;
grant execute on function public.work_queue(uuid,text,integer) to authenticated;
commit;
