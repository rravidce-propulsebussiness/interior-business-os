begin;
create function public.execution_requisition_create(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.execution_estimate_revisions;e public.execution_estimates;existing public.purchase_requisitions;
 l public.execution_estimate_lines;item public.purchase_requisition_items;source jsonb;target uuid;requested_quantity numeric;reserved numeric;ordinal integer=0;begin
 perform private.execution_require(p_organization_id,'purchase_requisition.create');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>100000 or p_input-array['idempotency_key','revision_id','required_date','priority','delivery_location','notes','sources']<>'{}'::jsonb or jsonb_typeof(p_input->'sources') is distinct from 'array' then raise exception 'Invalid requisition' using errcode='22023';end if;
 if jsonb_array_length(p_input->'sources') not between 1 and 500 or p_input->>'idempotency_key' is null then raise exception 'Requisition requires bounded sources and retry key' using errcode='22023';end if;
 select * into existing from public.purchase_requisitions where organization_id=p_organization_id and idempotency_key=(p_input->>'idempotency_key')::uuid;
 if existing.id is not null then if existing.request_hash<>md5(p_input::text) then raise exception 'Requisition retry payload differs' using errcode='22023';end if;return existing.id;end if;
 select * into r from public.execution_estimate_revisions where organization_id=p_organization_id and id=(p_input->>'revision_id')::uuid and status='approved' for update;
 select * into e from public.execution_estimates where organization_id=p_organization_id and id=r.estimate_id and current_approved_revision_id=r.id;
 if e.id is null then raise exception 'Current approved estimate required' using errcode='22023';end if;
 if not exists(select 1 from public.contracts where id=r.contract_id and status not in ('closed','cancelled')) or r.scope_fingerprint<>md5(private.execution_scope(r.contract_id)::text) then raise exception 'Current approved commercial scope required' using errcode='40001';end if;
 if (select count(distinct x->>'line_id') from jsonb_array_elements(p_input->'sources')x)<>jsonb_array_length(p_input->'sources') then raise exception 'Duplicate requisition source' using errcode='22023';end if;
 insert into public.purchase_requisitions(organization_id,contract_id,project_id,estimate_revision_id,requisition_number,required_date,priority,delivery_location,notes,idempotency_key,request_hash)
 values(p_organization_id,r.contract_id,r.project_id,r.id,private.finance_number(p_organization_id,'purchase_requisition','PR'),(p_input->>'required_date')::date,coalesce(p_input->>'priority','normal'),p_input->>'delivery_location',coalesce(p_input->>'notes',''),(p_input->>'idempotency_key')::uuid,md5(p_input::text)) returning id into target;
 for source in select jsonb_array_elements(p_input->'sources') loop
 if jsonb_typeof(source) is distinct from 'object' or source-array['line_id','quantity']<>'{}'::jsonb then raise exception 'Invalid requisition source' using errcode='22023';end if;
 select l0.* into l from public.execution_estimate_lines l0 join public.execution_estimate_scope_items s on s.id=l0.scope_id where l0.organization_id=p_organization_id and l0.revision_id=r.id and l0.id=(source->>'line_id')::uuid and s.coverage='estimated';
 if l.id is null then raise exception 'Unavailable estimated source' using errcode='42501';end if;
 requested_quantity=private.execution_decimal(source->>'quantity');
 -- Demand follows its stable commercial source through revisions. A new revision
 -- does not grant a second allowance for an already requisitioned material/service.
 select coalesce(sum(ps.quantity::numeric),0) into reserved
 from public.purchase_requisition_sources ps join public.purchase_requisitions pr on pr.id=ps.requisition_id
 join public.execution_estimate_lines prior_line on prior_line.id=ps.estimate_line_id
 join public.execution_estimate_scope_items prior_scope on prior_scope.id=prior_line.scope_id
 join public.execution_estimate_scope_items current_scope on current_scope.id=l.scope_id
 where pr.organization_id=p_organization_id and pr.contract_id=r.contract_id and pr.status<>'cancelled'
 and prior_scope.source_type=current_scope.source_type and prior_scope.source_id=current_scope.source_id
 and prior_line.variant_id is not distinct from l.variant_id and prior_line.cost_kind=l.cost_kind and prior_line.purchase_unit=l.purchase_unit
 and (l.variant_id is not null or prior_line.description=l.description);
 if requested_quantity<=0 or requested_quantity>l.planned_purchase_quantity::numeric or requested_quantity+coalesce((select sum(ps.quantity::numeric) from public.purchase_requisition_sources ps join public.purchase_requisitions pr on pr.id=ps.requisition_id where ps.estimate_line_id=l.id and pr.status<>'cancelled'),0)>l.planned_purchase_quantity::numeric or requested_quantity+reserved>(select sum(active_line.planned_purchase_quantity::numeric) from public.execution_estimate_lines active_line where active_line.scope_id=l.scope_id and active_line.variant_id is not distinct from l.variant_id and active_line.cost_kind=l.cost_kind and active_line.purchase_unit=l.purchase_unit and (l.variant_id is not null or active_line.description=l.description)) then raise exception 'Requisition exceeds remaining approved demand' using errcode='22023';end if;
 if mod(requested_quantity*1000000,private.execution_decimal(l.calculation_snapshot#>>'{conversion,purchase_increment}')*1000000)<>0 then raise exception 'Requisition quantity must respect purchase increment' using errcode='22023';end if;
 select * into item from public.purchase_requisition_items where requisition_id=target and variant_id is not distinct from l.variant_id and cost_kind=l.cost_kind and unit=l.purchase_unit and (l.variant_id is not null or description=l.description) and snapshot->'conversion' is not distinct from l.calculation_snapshot->'conversion' order by id limit 1;
 if item.id is null then
 insert into public.purchase_requisition_items(organization_id,requisition_id,variant_id,category_id,cost_kind,description,unit,quantity,snapshot,sort_order)
 values(p_organization_id,target,l.variant_id,l.category_id,l.cost_kind,l.description,l.purchase_unit,trim_scale(requested_quantity)::text,jsonb_build_object('material',l.calculation_snapshot->'material','conversion',l.calculation_snapshot->'conversion'),ordinal) returning * into item;ordinal=ordinal+1;
 else update public.purchase_requisition_items set quantity=trim_scale(public.purchase_requisition_items.quantity::numeric+requested_quantity)::text where id=item.id;end if;
 insert into public.purchase_requisition_sources(organization_id,requisition_id,item_id,estimate_line_id,quantity) values(p_organization_id,target,item.id,l.id,trim_scale(requested_quantity)::text);
 end loop;
 perform private.crm_audit(p_organization_id,'requisition.created','purchase_requisitions',target);return target;
end$$;
create function public.execution_requisition_transition(p_organization_id uuid,p_id uuid,p_version integer,p_action text,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare r public.purchase_requisitions;begin
 if p_action is null or p_action not in ('submit','approve','cancel') then raise exception 'Invalid requisition transition' using errcode='22023';end if;
 perform private.execution_require(p_organization_id,case when p_action='approve' then 'purchase_requisition.approve' else 'purchase_requisition.create' end);
 select * into r from public.purchase_requisitions where organization_id=p_organization_id and id=p_id for update;
 if r.id is null then raise exception 'Unavailable requisition' using errcode='42501';end if;
 if p_action='submit' and r.status='submitted' or p_action='approve' and r.status='approved' or p_action='cancel' and r.status='cancelled' then return r.id;end if;
 if r.version is distinct from p_version then raise exception 'Stale requisition' using errcode='40001';end if;
 if p_action<>'cancel' and not exists(select 1 from public.contracts where id=r.contract_id and status not in ('closed','cancelled')) then raise exception 'Open contract required' using errcode='22023';end if;
 if p_action='submit' then
 if r.status<>'draft' then raise exception 'Draft requisition required' using errcode='22023';end if;
 update public.purchase_requisitions set status='submitted',version=version+1 where id=r.id;
 elsif p_action='approve' then
 if r.status<>'submitted' then raise exception 'Submitted requisition required' using errcode='22023';end if;
 if not exists(select 1 from public.execution_estimate_revisions er join public.execution_estimates e on e.current_approved_revision_id=er.id where er.id=r.estimate_revision_id and er.status='approved' and er.scope_fingerprint=md5(private.execution_scope(r.contract_id)::text)) then raise exception 'Requisition estimate is no longer current' using errcode='40001';end if;
 update public.purchase_requisitions set status='approved',version=version+1,approved_at=now(),approved_by=auth.uid() where id=r.id;
 else
 if length(trim(coalesce(p_reason,''))) not between 3 and 3000 then raise exception 'Cancellation reason required' using errcode='22023';end if;
 if r.status='approved' then perform private.execution_require(p_organization_id,'purchase_requisition.approve');end if;
 if exists(select 1 from public.rfqs where requisition_id=r.id and status<>'cancelled') or exists(select 1 from public.purchase_orders where requisition_id=r.id and status<>'cancelled') then raise exception 'Resolve downstream procurement before cancellation' using errcode='22023';end if;
 update public.purchase_requisitions set status='cancelled',version=version+1,cancel_reason=p_reason where id=r.id;
 end if;
 perform private.crm_audit(p_organization_id,'requisition.'||p_action,'purchase_requisitions',r.id);return r.id;
end$$;
revoke all on function public.execution_requisition_create(uuid,jsonb),public.execution_requisition_transition(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.execution_requisition_create(uuid,jsonb),public.execution_requisition_transition(uuid,uuid,integer,text,text) to authenticated;
commit;


