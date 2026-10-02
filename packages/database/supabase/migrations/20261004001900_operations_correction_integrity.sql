begin;
create or replace function public.operations_stock(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid=p_organization_id;project uuid=(p_input->>'project_id')::uuid;src uuid=(p_input->>'source_location_id')::uuid;dst uuid=(p_input->>'destination_location_id')::uuid;target uuid;lot public.inventory_lots;prior public.inventory_transactions;original public.inventory_transactions;receipt public.goods_receipt_items;po_line public.purchase_order_items;request public.material_issue_requests;request_item public.material_issue_request_items;loc public.inventory_locations;permission text;q numeric;amount numeric;balance numeric;approved numeric;done numeric;key uuid=(p_input->>'idempotency_key')::uuid;hash text;number text;doc jsonb;movement record;unit_currency text;unit_precision integer;reason text=trim(p_input->>'reason');count_id uuid;begin
 permission=case p_operation when 'purchase_receipt' then 'inventory.receive' when 'transfer' then 'inventory.issue' when 'issue_to_site' then 'inventory.issue' when 'return_from_site' then 'inventory.issue' when 'consumption' then 'inventory.consume' when 'scrap' then 'inventory.consume' when 'damage' then 'inventory.consume' when 'adjustment' then 'inventory.adjust' when 'count' then 'inventory.count' when 'reversal' then 'inventory.reverse' end;
 if permission is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>20000 or p_input-array['project_id','source_location_id','destination_location_id','lot_id','receipt_item_id','request_item_id','original_transaction_id','area_id','task_id','work_package_id','estimate_line_id','movement_date','quantity','physical_quantity','reason','received_by','idempotency_key']<>'{}'::jsonb or key is null or reason is null or length(reason) not between 3 and 3000 then raise exception 'Invalid stock operation' using errcode='22023';end if;
 perform private.ops_require(org,permission,project);
 hash=md5(p_operation||p_input::text);
 select * into prior from public.inventory_transactions where organization_id=org and idempotency_key=key;
 if prior.id is not null then if prior.request_hash<>hash then raise exception 'Retry payload changed' using errcode='40001';end if;return prior.id;end if;
 if project is null and not private.has_permission(org,'inventory.view_all') then raise exception 'Project required' using errcode='42501';end if;
 if p_input ? 'movement_date' and (not isfinite((p_input->>'movement_date')::date) or (p_input->>'movement_date')::date>current_date) then raise exception 'Invalid movement date' using errcode='22023';end if;
 if p_input ? 'area_id' and not exists(select 1 from public.project_areas where organization_id=org and project_id=project and id=(p_input->>'area_id')::uuid) or p_input ? 'task_id' and not exists(select 1 from public.project_tasks where organization_id=org and project_id=project and id=(p_input->>'task_id')::uuid) or p_input ? 'work_package_id' and not exists(select 1 from public.work_packages where organization_id=org and project_id=project and id=(p_input->>'work_package_id')::uuid) or p_input ? 'estimate_line_id' and not exists(select 1 from public.execution_estimate_lines l join public.execution_estimate_revisions r on r.id=l.revision_id where l.organization_id=org and r.project_id=project and l.id=(p_input->>'estimate_line_id')::uuid) then raise exception 'Invalid project reference' using errcode='42501';end if;
 if p_operation='reversal' then
  select * into original from public.inventory_transactions where organization_id=org and id=(p_input->>'original_transaction_id')::uuid;
  if original.id is null or original.project_id is distinct from project or original.kind='reversal' or exists(select 1 from public.inventory_transactions where original_transaction_id=original.id and kind='reversal') then raise exception 'Unavailable original movement' using errcode='40001';end if;
  if exists(select 1 from public.inventory_transactions t where t.original_transaction_id=original.id and t.kind='return_from_site' and not exists(select 1 from public.inventory_transactions r where r.kind='reversal' and r.original_transaction_id=t.id)) then raise exception 'Reverse linked returns first' using errcode='23514';end if;
  target=gen_random_uuid();number=private.finance_number(org,'inventory','MOV');
  insert into public.inventory_transactions(id,organization_id,project_id,number,kind,source_location_id,destination_location_id,original_transaction_id,reason,idempotency_key,request_hash,document_snapshot) values(target,org,project,number,'reversal',original.destination_location_id,original.source_location_id,original.id,reason,key,hash,original.document_snapshot||jsonb_build_object('number',number,'kind','reversal','reason',reason,'date',current_date));
  for movement in select * from public.inventory_movements where transaction_id=original.id order by quantity::numeric desc loop
   perform private.ops_location(org,movement.location_id,project);
   insert into public.inventory_movements(organization_id,project_id,transaction_id,lot_id,location_id,quantity) values(org,project,target,movement.lot_id,movement.location_id,trim_scale(-movement.quantity::numeric)::text);
  end loop;
  if original.request_item_id is not null then select request_id into request.id from public.material_issue_request_items where id=original.request_item_id;perform private.ops_refresh_request(org,request.id);end if;
  perform private.ops_event(org,project,'inventory_transactions',target,'inventory.reversed',null,null,reason);return target;
 end if;
 if p_operation='purchase_receipt' then
  select * into receipt from public.goods_receipt_items where organization_id=org and id=(p_input->>'receipt_item_id')::uuid;
  select * into po_line from public.purchase_order_items where organization_id=org and id=receipt.po_item_id;
  if receipt.id is null or receipt.accepted_quantity::numeric<=0 or po_line.cost_kind<>'material' or po_line.variant_id is null or not exists(select 1 from public.goods_receipts where id=receipt.receipt_id and project_id=project) then raise exception 'Accepted project material receipt required' using errcode='22023';end if;
  if src is not null or dst is null then raise exception 'Receipt destination required' using errcode='22023';end if;
  select * into lot from public.inventory_lots where receipt_item_id=receipt.id;
  if lot.id is not null then raise exception 'Receipt already posted to inventory' using errcode='40001';end if;
  q=receipt.accepted_quantity::numeric;
  insert into public.inventory_lots(organization_id,receipt_item_id,variant_id,unit,received_quantity,label) values(org,receipt.id,po_line.variant_id,po_line.unit,receipt.accepted_quantity,po_line.description) returning * into lot;
  select round(pc.total::numeric*q/po_line.quantity::numeric,c.precision),c.currency,c.precision into amount,unit_currency,unit_precision from public.purchase_order_item_costs pc join public.purchase_orders po on po.id=po_line.po_id join public.contracts c on c.id=po.contract_id where pc.item_id=po_line.id;
  if amount is null then raise exception 'Receipt cost basis unavailable' using errcode='23514';end if;
  insert into public.inventory_lot_costs(organization_id,lot_id,currency,total_cost,precision) values(org,lot.id,unit_currency,trim_scale(amount)::text,unit_precision);
 else
  select * into lot from public.inventory_lots where organization_id=org and id=(p_input->>'lot_id')::uuid;
  if lot.id is null then raise exception 'Unavailable receipt lot' using errcode='42501';end if;
  if p_operation='count' then
   perform private.ops_require(org,'inventory.adjust',project);
   if src is null or dst is not null then raise exception 'Count location required' using errcode='22023';end if;
   balance=private.ops_balance(org,src,lot.id);q=private.execution_decimal(p_input->>'physical_quantity')-balance;
   count_id=gen_random_uuid();
  else q=private.finance_decimal(p_input->>'quantity',p_operation='adjustment');end if;
  if q=0 and p_operation<>'count' or q<0 and p_operation not in ('adjustment','count') then raise exception 'Positive quantity required' using errcode='22023';end if;
 end if;
 if p_operation in ('transfer','issue_to_site','return_from_site') then
  if src is null or dst is null or src=dst then raise exception 'Distinct source and destination required' using errcode='22023';end if;
 elsif p_operation<>'purchase_receipt' and (src is null or dst is not null) then raise exception 'Source location required' using errcode='22023';end if;
 if src is not null then loc=private.ops_location(org,src,project);end if;
 if p_operation in ('consumption','scrap','damage','return_from_site') and (project is null or loc.site_project_id is distinct from project) then raise exception 'Project site stock required' using errcode='22023';end if;
 if p_operation='transfer' and loc.site_project_id is not null then raise exception 'Site returns must reference their original issue' using errcode='23514';end if;
 if dst is not null then loc=private.ops_location(org,dst,project);end if;
 if p_operation='transfer' and loc.kind='project_site' then raise exception 'Use an approved material issue request for site delivery' using errcode='23514';end if;
 if p_operation='issue_to_site' then
  select * into request_item from public.material_issue_request_items where organization_id=org and id=(p_input->>'request_item_id')::uuid;
  select * into request from public.material_issue_requests where id=request_item.request_id and organization_id=org;
  if request.status not in ('approved','partially_issued') or request.id is null or request.project_id is distinct from project or request.source_location_id<>src or request.destination_location_id<>dst or request_item.variant_id<>lot.variant_id or request_item.unit<>lot.unit or loc.site_project_id is distinct from project then raise exception 'Approved matching issue request required' using errcode='23514';end if;
  select coalesce(sum(-m.quantity::numeric),0) into done from public.inventory_transactions t join public.inventory_movements m on m.transaction_id=t.id and m.location_id=t.source_location_id where t.request_item_id=request_item.id and not exists(select 1 from public.inventory_transactions r where r.kind='reversal' and r.original_transaction_id=t.id);
  if q+done>request_item.approved_quantity::numeric then raise exception 'Issue exceeds approved remaining request' using errcode='23514';end if;
 end if;
 if p_operation='return_from_site' then
  select * into original from public.inventory_transactions where organization_id=org and id=(p_input->>'original_transaction_id')::uuid and kind='issue_to_site';
  if original.id is null or original.project_id is distinct from project or original.destination_location_id<>src or original.source_location_id<>dst or exists(select 1 from public.inventory_transactions where kind='reversal' and original_transaction_id=original.id) then raise exception 'Matching unreversed original issue required' using errcode='23514';end if;
  select quantity::numeric into approved from public.inventory_movements where transaction_id=original.id and location_id=src and lot_id=lot.id;
  select coalesce(sum(m.quantity::numeric),0) into done from public.inventory_transactions t join public.inventory_movements m on m.transaction_id=t.id and m.location_id=dst and m.lot_id=lot.id where t.kind='return_from_site' and t.original_transaction_id=original.id and not exists(select 1 from public.inventory_transactions r where r.kind='reversal' and r.original_transaction_id=t.id);
  if approved is null or q+done>approved then raise exception 'Return exceeds original issue' using errcode='23514';end if;
 end if;
 if p_input ? 'estimate_line_id' and not exists(select 1 from public.execution_estimate_lines where id=(p_input->>'estimate_line_id')::uuid and variant_id=lot.variant_id and purchase_unit=lot.unit) then raise exception 'Estimate material or unit mismatch' using errcode='23514';end if;
 target=gen_random_uuid();number=private.finance_number(org,'inventory','MOV');
 doc=coalesce(private.execution_document_header(org,project),jsonb_build_object('business',jsonb_build_object('name',(select name from public.organizations where id=org))))||jsonb_build_object('number',number,'kind',p_operation,'date',coalesce((p_input->>'movement_date')::date,current_date),'material',lot.label,'quantity',trim_scale(abs(q))::text,'unit',lot.unit,'source',(select name from public.inventory_locations where id=src),'destination',(select name from public.inventory_locations where id=dst),'reason',reason,'issued_by',(select full_name from public.profiles where id=auth.uid()),'received_by',coalesce(p_input->>'received_by',''));
 insert into public.inventory_transactions(id,organization_id,project_id,number,kind,source_location_id,destination_location_id,request_item_id,original_transaction_id,area_id,task_id,work_package_id,estimate_line_id,movement_date,reason,received_by,idempotency_key,request_hash,document_snapshot)
 values(target,org,project,number,p_operation,src,dst,case when p_operation='issue_to_site' then request_item.id end,case when p_operation='return_from_site' then original.id end,(p_input->>'area_id')::uuid,(p_input->>'task_id')::uuid,(p_input->>'work_package_id')::uuid,(p_input->>'estimate_line_id')::uuid,coalesce((p_input->>'movement_date')::date,current_date),reason,coalesce(p_input->>'received_by',''),key,hash,doc);
 if q<>0 then
  if src is not null then insert into public.inventory_movements(organization_id,project_id,transaction_id,lot_id,location_id,quantity) values(org,project,target,lot.id,src,trim_scale(case when p_operation in ('adjustment','count') then q else -q end)::text);end if;
  if dst is not null then insert into public.inventory_movements(organization_id,project_id,transaction_id,lot_id,location_id,quantity) values(org,project,target,lot.id,dst,trim_scale(q)::text);end if;
 end if;
 if p_operation='count' then insert into public.inventory_counts(id,organization_id,location_id,lot_id,system_quantity,physical_quantity,transaction_id,reason) values(count_id,org,src,lot.id,trim_scale(balance)::text,p_input->>'physical_quantity',target,reason);end if;
 if p_operation='issue_to_site' then perform private.ops_refresh_request(org,request.id);end if;
 perform private.ops_event(org,project,'inventory_transactions',target,'inventory.'||p_operation,null,null,reason);return target;
end$$;
create or replace function public.operations_inspection(p_organization_id uuid,p_operation text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 select jsonb_agg(x||jsonb_build_object('result','not_checked','note','')) into results from jsonb_array_elements(coalesce(i.template_snapshot->'checklist',t.checklist))x;
 insert into public.project_inspections(organization_id,project_id,template_id,area_id,work_package_id,predecessor_id,number,inspector_id,inspection_date,is_final,mandatory,template_snapshot,checklist,notes) values(org,project,t.id,(p_input->>'area_id')::uuid,(p_input->>'work_package_id')::uuid,i.id,private.finance_number(org,'inspection','INSP'),(p_input->>'inspector_id')::uuid,coalesce((p_input->>'inspection_date')::date,current_date),coalesce(i.is_final,t.is_final),coalesce(i.mandatory,t.mandatory),coalesce(i.template_snapshot,to_jsonb(t)-'organization_id'-'created_by'),results,coalesce(p_input->>'notes','')) returning id into target;
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
commit;
