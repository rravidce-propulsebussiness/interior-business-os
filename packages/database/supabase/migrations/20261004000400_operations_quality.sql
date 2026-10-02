begin;
create function private.ops_results(template jsonb,results jsonb,completed boolean) returns jsonb language plpgsql immutable set search_path='' as $$declare row jsonb;answer jsonb;output jsonb='[]';begin
 if jsonb_typeof(results) is distinct from 'array' or jsonb_array_length(results)<>jsonb_array_length(template) or (select count(distinct x->>'key') from jsonb_array_elements(results)x)<>jsonb_array_length(results) then raise exception 'Complete checklist required' using errcode='22023';end if;
 for row in select jsonb_array_elements(template) loop
 select x into answer from jsonb_array_elements(results)x where x->>'key'=row->>'key';
 if answer is null or answer-array['key','result','note']<>'{}'::jsonb or coalesce(answer->>'result','') not in ('pass','fail','na','not_checked') or length(coalesce(answer->>'note',''))>3000 or completed and (row->>'required')::boolean and answer->>'result' in ('na','not_checked') then raise exception 'Invalid or incomplete checklist result' using errcode='23514';end if;
 output=output||jsonb_build_array(row||jsonb_build_object('result',answer->>'result','note',coalesce(answer->>'note','')));end loop;return output;
end$$;
create function private.ops_readiness(org uuid,project uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with gates as (select
 exists(select 1 from public.project_tasks where organization_id=org and project_id=project) and not exists(select 1 from public.project_tasks where organization_id=org and project_id=project and status not in ('done','cancelled')) tasks_complete,
 not exists(select 1 from public.project_snags where organization_id=org and project_id=project and status<>'closed' and not post_handover) snags_resolved,
 exists(select 1 from public.project_inspections i where i.organization_id=org and i.project_id=project and i.is_final and i.status='passed' and not exists(select 1 from public.project_inspections child where child.predecessor_id=i.id)) final_passed,
 not exists(select 1 from public.project_inspections i where i.organization_id=org and i.project_id=project and i.mandatory and i.status<>'passed' and not exists(select 1 from public.project_inspections child where child.predecessor_id=i.id)) inspections_passed,
 not exists(select 1 from public.project_snags where organization_id=org and project_id=project and priority='critical' and status<>'closed') critical_resolved)
 select to_jsonb(g)||jsonb_build_object('ready',tasks_complete and snags_resolved and final_passed and inspections_passed and critical_resolved) from gates g;
$$;
create function public.operations_inspection(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;i public.project_inspections;t public.inspection_templates;project uuid=(p_input->>'project_id')::uuid;target uuid;results jsonb;next_status text=p_input->>'status';begin
 perform private.ops_require(org,case when p_operation='approve' then 'inspection.approve' else 'inspection.create' end);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>100000 or p_input-array['id','version','project_id','template_id','area_id','work_package_id','predecessor_id','inspector_id','inspection_date','notes','results','status']<>'{}'::jsonb or p_operation not in ('create','save','approve') then raise exception 'Invalid inspection command' using errcode='22023';end if;
 if p_operation='create' then
 if not private.ops_project(org,project) then raise exception 'Unavailable project' using errcode='42501';end if;
 select * into t from public.inspection_templates where organization_id=org and id=(p_input->>'template_id')::uuid and active;
 if t.id is null then raise exception 'Active inspection template required' using errcode='42501';end if;
 if p_input ? 'predecessor_id' then
 select * into i from public.project_inspections where organization_id=org and project_id=project and id=(p_input->>'predecessor_id')::uuid and status in ('failed','requires_rework');
 if i.id is null or i.template_id<>t.id or exists(select 1 from public.project_inspections where predecessor_id=i.id) then raise exception 'Reinspect the latest failed inspection' using errcode='40001';end if;
 end if;
 perform private.ops_assignee(org,project,(p_input->>'inspector_id')::uuid);
 select jsonb_agg(x||jsonb_build_object('result','not_checked','note','')) into results from jsonb_array_elements(t.checklist)x;
 insert into public.project_inspections(organization_id,project_id,template_id,area_id,work_package_id,predecessor_id,number,inspector_id,inspection_date,is_final,mandatory,template_snapshot,checklist,notes) values(org,project,t.id,(p_input->>'area_id')::uuid,(p_input->>'work_package_id')::uuid,i.id,private.finance_number(org,'inspection','INSP'),(p_input->>'inspector_id')::uuid,coalesce((p_input->>'inspection_date')::date,current_date),t.is_final,t.mandatory,to_jsonb(t)-'organization_id'-'created_by',results,coalesce(p_input->>'notes','')) returning id into target;
 perform private.ops_event(org,project,'project_inspections',target,'inspection.created');return target;
 end if;
 select * into i from public.project_inspections where organization_id=org and id=(p_input->>'id')::uuid for update;
 if i.id is null or not private.ops_project(org,i.project_id) then raise exception 'Unavailable inspection' using errcode='42501';end if;
 if i.version is distinct from (p_input->>'version')::integer or i.status not in ('draft','in_progress') then raise exception 'Stale or final inspection' using errcode='40001';end if;
 results=private.ops_results(i.template_snapshot->'checklist',p_input->'results',p_operation='approve');
 if p_operation='approve' then
 if next_status not in ('passed','failed','requires_rework') then raise exception 'Inspection decision required' using errcode='22023';end if;
 if next_status='passed' and exists(select 1 from jsonb_array_elements(results)x where x->>'result'='fail' or (x->>'required')::boolean and x->>'result'<>'pass') then raise exception 'Failed or unchecked requirements cannot pass' using errcode='23514';end if;
 update public.project_inspections set status=next_status,version=version+1,checklist=results,notes=coalesce(p_input->>'notes',notes),approved_at=now(),approved_by=auth.uid(),document_snapshot=private.execution_document_header(org,i.project_id)||jsonb_build_object('kind','inspection','number',i.number,'date',i.inspection_date,'type',i.template_snapshot->>'name','area',(select name from public.project_areas where id=i.area_id),'inspector',(select full_name from public.profiles where id=i.inspector_id),'checklist',results,'result',next_status,'notes',coalesce(p_input->>'notes',i.notes)) where id=i.id;
 else update public.project_inspections set status='in_progress',version=version+1,checklist=results,notes=coalesce(p_input->>'notes',notes) where id=i.id;end if;
 perform private.ops_event(org,i.project_id,'project_inspections',i.id,'inspection.'||p_operation,i.status,next_status);return i.id;
end$$;
create function public.operations_snag(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;s public.project_snags;project uuid=(p_input->>'project_id')::uuid;target uuid;next_status text=p_input->>'status';permission text;begin
 permission=case when p_operation='assign' then 'snag.assign' when p_operation='transition' and next_status in ('verified','closed','reopened') then 'snag.verify' else 'snag.create' end;
 perform private.ops_require(org,permission);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 or p_input-array['id','version','project_id','title','description','priority','area_id','task_id','inspection_id','assigned_to','vendor_id','due_date','status','resolution','verification']<>'{}'::jsonb or p_operation not in ('create','assign','transition') then raise exception 'Invalid snag command' using errcode='22023';end if;
 if p_operation='create' then
 if not private.ops_project(org,project) then raise exception 'Unavailable project' using errcode='42501';end if;
 insert into public.project_snags(organization_id,project_id,area_id,task_id,inspection_id,number,title,description,priority,due_date,post_handover) values(org,project,(p_input->>'area_id')::uuid,(p_input->>'task_id')::uuid,(p_input->>'inspection_id')::uuid,private.finance_number(org,'snag','SNAG'),p_input->>'title',coalesce(p_input->>'description',''),p_input->>'priority',(p_input->>'due_date')::date,exists(select 1 from public.handover_records where organization_id=org and project_id=project and status='approved')) returning id into target;
 perform private.ops_event(org,project,'project_snags',target,'snag.created',null,'open');return target;
 end if;
 select * into s from public.project_snags where organization_id=org and id=(p_input->>'id')::uuid for update;
 if s.id is null or not private.ops_project(org,s.project_id) then raise exception 'Unavailable snag' using errcode='42501';end if;
 if s.version is distinct from (p_input->>'version')::integer then raise exception 'Stale snag version' using errcode='40001';end if;
 if p_operation='assign' then
 if s.status in ('verified','closed') then raise exception 'Final snag cannot be assigned' using errcode='40001';end if;
 if p_input->>'assigned_to' is null and p_input->>'vendor_id' is null then raise exception 'Assignee required' using errcode='22023';end if;
 perform private.ops_assignee(org,s.project_id,(p_input->>'assigned_to')::uuid);
 if p_input->>'vendor_id' is not null and not exists(select 1 from public.vendors where organization_id=org and id=(p_input->>'vendor_id')::uuid and status='active') then raise exception 'Unavailable vendor' using errcode='42501';end if;
 update public.project_snags set assigned_to=(p_input->>'assigned_to')::uuid,vendor_id=(p_input->>'vendor_id')::uuid,status='assigned',version=version+1 where id=s.id;next_status='assigned';
 else
 if not ((s.status in ('open','assigned','reopened') and next_status='in_progress') or (s.status='in_progress' and next_status='ready_for_review') or (s.status='ready_for_review' and next_status in ('verified','reopened')) or (s.status='verified' and next_status in ('closed','reopened')) or (s.status='closed' and next_status='reopened')) then raise exception 'Invalid snag transition' using errcode='40001';end if;
 if next_status='ready_for_review' and length(trim(coalesce(p_input->>'resolution','')))<3 or next_status in ('verified','closed','reopened') and length(trim(coalesce(p_input->>'verification','')))<3 then raise exception 'Resolution or verification evidence required' using errcode='22023';end if;
 update public.project_snags set status=next_status,version=version+1,resolution=coalesce(p_input->>'resolution',resolution),verification=coalesce(p_input->>'verification',verification) where id=s.id;
 end if;
 perform private.ops_event(org,s.project_id,'project_snags',s.id,'snag.'||p_operation,s.status,next_status,coalesce(p_input->>'resolution',p_input->>'verification',''));return s.id;
end$$;
create function public.operations_handover(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;h public.handover_records;p public.execution_plans;t public.handover_templates;target uuid;results jsonb;customer text;begin
 perform private.ops_require(org,case when p_operation='approve' then 'handover.approve' else 'handover.create' end);
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>100000 or p_input-array['id','version','plan_id','template_id','results','customer_notes','internal_notes','acknowledgement','commercial_review','materials_review','handover_date','warranty_start','warranty_end']<>'{}'::jsonb or p_operation not in ('create','save','approve') then raise exception 'Invalid handover command' using errcode='22023';end if;
 if p_operation='create' then
 select * into p from public.execution_plans where organization_id=org and id=(p_input->>'plan_id')::uuid;
 if p.id is null or not private.ops_project(org,p.project_id) then raise exception 'Unavailable execution plan' using errcode='42501';end if;
 if exists(select 1 from public.handover_records where plan_id=p.id) then raise exception 'Handover already exists; open its record' using errcode='40001';end if;
 select * into t from public.handover_templates where organization_id=org and id=(p_input->>'template_id')::uuid and active;
 if t.id is null then raise exception 'Active handover template required' using errcode='42501';end if;
 select jsonb_agg(x||jsonb_build_object('result','not_checked','note','')) into results from jsonb_array_elements(t.checklist)x;
 insert into public.handover_records(organization_id,project_id,plan_id,template_id,number,checklist) values(org,p.project_id,p.id,t.id,private.finance_number(org,'handover','HO'),results) returning id into target;
 perform private.ops_event(org,p.project_id,'handover_records',target,'handover.created');return target;
 end if;
 select * into h from public.handover_records where organization_id=org and id=(p_input->>'id')::uuid for update;
 if h.id is null or not private.ops_project(org,h.project_id) then raise exception 'Unavailable handover' using errcode='42501';end if;
 if h.status<>'draft' or h.version is distinct from (p_input->>'version')::integer then raise exception 'Stale or approved handover' using errcode='40001';end if;
 results=private.ops_results(h.checklist,p_input->'results',p_operation='approve');
 update public.handover_records set checklist=results,customer_notes=coalesce(p_input->>'customer_notes',customer_notes),internal_notes=coalesce(p_input->>'internal_notes',internal_notes),acknowledgement=coalesce(p_input->>'acknowledgement',acknowledgement),commercial_review=coalesce(p_input->>'commercial_review',commercial_review),materials_review=coalesce(p_input->>'materials_review',materials_review),handover_date=coalesce((p_input->>'handover_date')::date,handover_date),warranty_start=coalesce((p_input->>'warranty_start')::date,warranty_start),warranty_end=coalesce((p_input->>'warranty_end')::date,warranty_end),version=version+1 where id=h.id returning * into h;
 if p_operation='approve' then
 if not (private.ops_readiness(org,h.project_id)->>'ready')::boolean or exists(select 1 from jsonb_array_elements(results)x where x->>'result'='fail' or (x->>'required')::boolean and x->>'result'<>'pass') or length(trim(h.commercial_review))<3 or length(trim(h.materials_review))<3 then raise exception 'Readiness, material and commercial review required' using errcode='23514';end if;
 select * into p from public.execution_plans where id=h.plan_id;
 if p.status not in ('punch_list','ready_for_handover') then raise exception 'Plan must be in handover preparation' using errcode='23514';end if;
 select cu.name into customer from public.contracts c join public.customers cu on cu.id=c.customer_id where c.id=p.contract_id;
 update public.handover_records set status='approved',approved_at=now(),approved_by=auth.uid(),document_snapshot=private.execution_document_header(org,h.project_id)||jsonb_build_object('kind','handover','number',h.number,'date',h.handover_date,'customer',customer,'checklist',results,'notes',h.customer_notes,'acknowledgement',h.acknowledgement,'warranty_start',h.warranty_start,'warranty_end',h.warranty_end,'prepared_by',(select full_name from public.profiles where id=h.created_by),'approved_by',(select full_name from public.profiles where id=auth.uid())) where id=h.id;
 update public.execution_plans set status='handed_over',version=version+1 where id=h.plan_id;
 end if;
 perform private.ops_event(org,h.project_id,'handover_records',h.id,'handover.'||p_operation,'draft',case when p_operation='approve' then 'approved' else 'draft' end);return h.id;
end$$;
revoke all on function private.ops_results(jsonb,jsonb,boolean),private.ops_readiness(uuid,uuid),public.operations_inspection(uuid,text,jsonb),public.operations_snag(uuid,text,jsonb),public.operations_handover(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.operations_inspection(uuid,text,jsonb),public.operations_snag(uuid,text,jsonb),public.operations_handover(uuid,text,jsonb) to authenticated;
commit;
