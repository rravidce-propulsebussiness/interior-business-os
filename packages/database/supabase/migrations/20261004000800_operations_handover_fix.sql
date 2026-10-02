begin;
create or replace function public.operations_handover(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 select cu.display_name into customer from public.contracts c join public.customers cu on cu.id=c.customer_id where c.id=p.contract_id;
 update public.handover_records set status='approved',approved_at=now(),approved_by=auth.uid(),document_snapshot=private.execution_document_header(org,h.project_id)||jsonb_build_object('kind','handover','number',h.number,'date',h.handover_date,'customer',customer,'checklist',results,'notes',h.customer_notes,'acknowledgement',h.acknowledgement,'warranty_start',h.warranty_start,'warranty_end',h.warranty_end,'prepared_by',(select full_name from public.profiles where id=h.created_by),'approved_by',(select full_name from public.profiles where id=auth.uid())) where id=h.id;
 update public.execution_plans set status='handed_over',version=version+1 where id=h.plan_id;
 end if;
 perform private.ops_event(org,h.project_id,'handover_records',h.id,'handover.'||p_operation,'draft',case when p_operation='approve' then 'approved' else 'draft' end);return h.id;
end$$;
commit;
