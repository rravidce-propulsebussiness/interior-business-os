begin;
create or replace function public.operations_work_order(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
<<work_command>>
declare org uuid=p_organization_id;w public.subcontractor_work_orders;cost public.subcontractor_work_order_costs;p public.execution_plans;c public.contracts;m public.work_measurements;target uuid;amount numeric;quantity numeric;used numeric;used_amount numeric;next_status text=p_input->>'status';permission text;begin
 permission=case p_operation when 'create' then 'work_order.create' when 'issue' then 'work_order.issue' when 'measure' then 'work_order.measure' when 'certify' then 'work_order.approve' when 'verify' then 'work_order.approve' when 'reject' then 'work_order.approve' when 'progress' then 'work_order.measure' when 'cancel' then 'work_order.issue' end;
 if permission is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>30000 or p_input-array['id','version','plan_id','vendor_id','area_id','title','scope','unit','quantity','agreed_amount','planned_start','planned_end','notes','completed_percentage','accepted_percentage','measurement_date','note','reason']<>'{}'::jsonb then raise exception 'Invalid work order command' using errcode='22023';end if;
 perform private.ops_require(org,permission);
 if p_operation='create' then
 perform private.ops_require(org,'cost.execution.view');
 select * into p from public.execution_plans where organization_id=org and id=(p_input->>'plan_id')::uuid;
 if p.id is null or not private.ops_project(org,p.project_id) or p.status in ('completed','cancelled','handed_over') then raise exception 'Available execution plan required' using errcode='42501';end if;
 select * into c from public.contracts where id=p.contract_id;
 if not exists(select 1 from public.vendor_execution_profiles e join public.vendors v on v.id=e.vendor_id where e.organization_id=org and e.vendor_id=(p_input->>'vendor_id')::uuid and e.active and v.status='active') then raise exception 'Active subcontractor required' using errcode='42501';end if;
 amount=private.execution_decimal(p_input->>'agreed_amount');quantity=private.execution_decimal(p_input->>'quantity');
 if quantity<=0 or round(amount,c.precision)<>amount then raise exception 'Invalid quantity or monetary precision' using errcode='22023';end if;
 insert into public.subcontractor_work_orders(organization_id,project_id,plan_id,vendor_id,area_id,number,title,scope,unit,quantity,planned_start,planned_end,notes) values(org,p.project_id,p.id,(p_input->>'vendor_id')::uuid,(p_input->>'area_id')::uuid,private.finance_number(org,'work_order','WO'),p_input->>'title',p_input->>'scope',p_input->>'unit',trim_scale(quantity)::text,(p_input->>'planned_start')::date,(p_input->>'planned_end')::date,coalesce(p_input->>'notes','')) returning * into w;
 insert into public.subcontractor_work_order_costs(organization_id,project_id,work_order_id,currency,agreed_amount,unit_rate) values(org,p.project_id,w.id,c.currency,trim_scale(amount)::text,trim_scale(round(amount/quantity,6))::text);
 perform private.ops_event(org,w.project_id,'subcontractor_work_orders',w.id,'work_order.created');return w.id;
 end if;
 if p_operation in ('verify','reject','certify') then
 select * into m from public.work_measurements where organization_id=org and id=(p_input->>'id')::uuid for update;
 select * into w from public.subcontractor_work_orders where id=m.work_order_id;
 if m.id is null or not private.ops_project(org,m.project_id) then raise exception 'Unavailable measurement' using errcode='42501';end if;
 if m.version is distinct from (p_input->>'version')::integer or not (m.status='measured' and p_operation in ('verify','reject') or m.status='verified' and p_operation in ('certify','reject')) then raise exception 'Stale or final measurement' using errcode='40001';end if;
 if w.status='cancelled' or length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Current work order and decision evidence required' using errcode='23514';end if;
 if p_operation='certify' then
 select coalesce(sum(certified.quantity::numeric),0) into used from public.work_measurements certified where certified.work_order_id=w.id and certified.status='certified';
 if used+m.quantity::numeric>w.quantity::numeric then raise exception 'Certification exceeds ordered scope' using errcode='23514';end if;
 end if;
 next_status=case p_operation when 'verify' then 'verified' when 'reject' then 'rejected' else 'certified' end;
 update public.work_measurements set status=next_status,version=version+1,decision_reason=p_input->>'reason',certified_by=case when p_operation='certify' then auth.uid() end,certified_at=case when p_operation='certify' then now() end where id=m.id;
 perform private.ops_event(org,m.project_id,'work_measurements',m.id,'work_order.measurement_'||p_operation,m.status,next_status,p_input->>'reason');return m.id;
 end if;
 select * into w from public.subcontractor_work_orders where organization_id=org and id=(p_input->>'id')::uuid for update;
 if w.id is null or not private.ops_project(org,w.project_id) then raise exception 'Unavailable work order' using errcode='42501';end if;
 if w.version is distinct from (p_input->>'version')::integer then raise exception 'Stale work order version' using errcode='40001';end if;
 select * into cost from public.subcontractor_work_order_costs where work_order_id=w.id;
 select ct.* into c from public.execution_plans ep join public.contracts ct on ct.id=ep.contract_id where ep.id=w.plan_id;
 if p_operation='issue' then
 perform private.ops_require(org,'cost.execution.view',w.project_id);
 if w.status<>'draft' then raise exception 'Current draft work order required' using errcode='40001';end if;
 if not exists(select 1 from public.vendor_execution_profiles e join public.vendors v on v.id=e.vendor_id where e.vendor_id=w.vendor_id and e.active and v.status='active') then raise exception 'Subcontractor is inactive' using errcode='23514';end if;
 update public.subcontractor_work_orders set status='issued',version=version+1,document_snapshot=private.execution_document_header(org,w.project_id)||jsonb_build_object('number',w.number,'kind','work_order','date',current_date,'title',w.title,'scope',w.scope,'unit',w.unit,'quantity',w.quantity,'vendor',(select jsonb_build_object('name',name,'legal_name',legal_name,'billing_address',billing_address) from public.vendors where id=w.vendor_id)) where id=w.id;
 elsif p_operation='progress' then
 if w.status not in ('issued','in_progress','partially_completed') then raise exception 'Open issued work order required' using errcode='40001';end if;
 quantity=private.execution_decimal(p_input->>'completed_percentage');amount=private.execution_decimal(p_input->>'accepted_percentage');
 if quantity>100 or amount>quantity or amount<0 then raise exception 'Invalid work progress' using errcode='23514';end if;
 update public.subcontractor_work_orders set completed_percentage=trim_scale(work_command.quantity)::text,accepted_percentage=trim_scale(amount)::text,status=case when work_command.quantity=100 and amount=100 then 'completed' when work_command.quantity>0 then 'partially_completed' else 'in_progress' end,actual_start=coalesce(actual_start,current_date),actual_end=case when work_command.quantity=100 and amount=100 then current_date end,version=version+1 where id=w.id;
 elsif p_operation='cancel' then
 if w.status in ('completed','cancelled') or exists(select 1 from public.work_measurements where work_order_id=w.id and status='certified') then raise exception 'Completed or certified work cannot be cancelled' using errcode='23514';end if;
 if length(trim(coalesce(p_input->>'reason','')))<3 then raise exception 'Cancellation reason required' using errcode='22023';end if;
 update public.subcontractor_work_orders set status='cancelled',version=version+1 where id=w.id;
 elsif p_operation='measure' then
 if w.status not in ('issued','in_progress','partially_completed','completed') then raise exception 'Issued work order required' using errcode='40001';end if;
 quantity=private.execution_decimal(p_input->>'quantity');
 select coalesce(sum(measured.quantity::numeric),0),coalesce(sum(mc.amount::numeric),0) into used,used_amount from public.work_measurements measured join public.work_measurement_costs mc on mc.measurement_id=measured.id where measured.work_order_id=w.id and measured.status<>'rejected';
 if quantity<=0 or quantity+used>w.quantity::numeric then raise exception 'Measurement exceeds remaining work quantity' using errcode='23514';end if;
 amount=greatest(0,round(cost.agreed_amount::numeric*(used+quantity)/w.quantity::numeric,c.precision)-used_amount);
 if used_amount+amount>cost.agreed_amount::numeric then raise exception 'Measurement exceeds agreed amount' using errcode='23514';end if;
 insert into public.work_measurements(organization_id,project_id,work_order_id,area_id,quantity,unit,measurement_date,note) values(org,w.project_id,w.id,(p_input->>'area_id')::uuid,trim_scale(quantity)::text,w.unit,coalesce((p_input->>'measurement_date')::date,current_date),p_input->>'note') returning id into target;
 insert into public.work_measurement_costs(organization_id,project_id,measurement_id,currency,unit_rate,amount) values(org,w.project_id,target,cost.currency,cost.unit_rate,trim_scale(amount)::text);
 update public.subcontractor_work_orders set version=version+1 where id=w.id;
 perform private.ops_event(org,w.project_id,'work_measurements',target,'work_order.measured');return target;
 end if;
 perform private.ops_event(org,w.project_id,'subcontractor_work_orders',w.id,'work_order.'||p_operation,w.status,null,coalesce(p_input->>'reason',''));return w.id;
end$$;
commit;



