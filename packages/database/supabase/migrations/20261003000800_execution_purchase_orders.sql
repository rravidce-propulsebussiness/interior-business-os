begin;
-- Cumulative allocation preserves every minor currency unit across split awards.
create function private.execution_portion(total numeric,prior numeric,quantity numeric,whole numeric,places integer) returns numeric language sql immutable set search_path='' as $$
 select round(total*(prior+quantity)/whole,places)-round(total*prior/whole,places);
$$;
create function private.execution_po_price(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare po public.purchase_orders;q public.vendor_quotes;c public.contracts;i public.purchase_order_items;qi public.vendor_quote_items;
 prior numeric;paid_discount numeric;paid_taxable numeric;paid_tax numeric;paid_freight numeric;ordered numeric;amount numeric;discount numeric;taxable numeric;tax numeric;freight numeric;quote_freight numeric;weight_before numeric;weight_total numeric;weight numeric;
 total_subtotal numeric=0;total_tax numeric=0;total_freight numeric=0;document jsonb;begin
 select * into po from public.purchase_orders where id=target and status='draft' for update;
 if po.id is null then raise exception 'Draft purchase order required' using errcode='22023';end if;
 select * into q from public.vendor_quotes where id=po.quote_id and status='recorded';
 select * into c from public.contracts where id=po.contract_id and status not in ('closed','cancelled');
 if q.id is null or c.id is null or q.valid_until<current_date or not exists(select 1 from public.purchase_requisitions where id=po.requisition_id and status='approved') or not exists(select 1 from public.vendors where id=po.vendor_id and status='active') then raise exception 'Current quote, approved demand and active vendor required' using errcode='22023';end if;
 delete from public.purchase_order_item_costs where po_id=po.id;delete from public.purchase_order_costs where po_id=po.id;
 select sum(greatest(total::numeric,0.000001)) into weight_total from public.vendor_quote_items where quote_id=q.id;
 for i in select * from public.purchase_order_items where po_id=po.id order by sort_order,id loop
 select * into qi from public.vendor_quote_items where id=i.quote_item_id and quote_id=q.id;
 amount=i.quantity::numeric;
 select coalesce(sum(pi.quantity::numeric),0) into prior from public.purchase_order_items pi join public.purchase_orders p on p.id=pi.po_id where pi.quote_item_id=qi.id and p.status in ('issued','partially_received','received','closed');
 select coalesce(sum(pi.quantity::numeric),0) into ordered from public.purchase_order_items pi join public.purchase_orders p on p.id=pi.po_id where pi.requisition_item_id=i.requisition_item_id and p.status in ('issued','partially_received','received','closed');
 if qi.id is null or amount+prior>qi.quantity::numeric or amount<qi.minimum_order::numeric or amount+ordered>(select quantity::numeric from public.purchase_requisition_items where id=i.requisition_item_id) then raise exception 'Award exceeds remaining quote or requisition quantity, or minimum order is unmet' using errcode='22023';end if;
 select coalesce(sum(greatest(total::numeric,0.000001)),0) into weight_before from public.vendor_quote_items where quote_id=q.id and (sort_order,id)<(qi.sort_order,qi.id);
 weight=greatest(qi.total::numeric,0.000001);
 quote_freight=round(q.freight::numeric*(weight_before+weight)/weight_total,c.precision)-round(q.freight::numeric*weight_before/weight_total,c.precision);
 select coalesce(sum(pc.discount::numeric),0),coalesce(sum(pc.taxable_amount::numeric),0),coalesce(sum(pc.tax_amount::numeric),0),coalesce(sum(pc.freight::numeric),0) into paid_discount,paid_taxable,paid_tax,paid_freight from public.purchase_order_items pi join public.purchase_orders p on p.id=pi.po_id join public.purchase_order_item_costs pc on pc.item_id=pi.id where pi.quote_item_id=qi.id and p.status in ('issued','partially_received','received','closed');
 discount=greatest(0,round(qi.discount::numeric*(prior+amount)/qi.quantity::numeric,c.precision)-paid_discount);
 taxable=greatest(0,round(qi.taxable_amount::numeric*(prior+amount)/qi.quantity::numeric,c.precision)-paid_taxable);
 tax=greatest(0,round(qi.tax_amount::numeric*(prior+amount)/qi.quantity::numeric,c.precision)-paid_tax);
 freight=greatest(0,round(quote_freight*(prior+amount)/qi.quantity::numeric,c.precision)-paid_freight);
 insert into public.purchase_order_item_costs(organization_id,po_id,item_id,unit_price,discount,taxable_amount,tax_amount,freight,total,snapshot)
 values(po.organization_id,po.id,i.id,qi.unit_price,trim_scale(discount)::text,trim_scale(taxable)::text,trim_scale(tax)::text,trim_scale(freight)::text,trim_scale(taxable+tax+freight)::text,jsonb_build_object('quote_item',to_jsonb(qi),'previous_awarded_quantity',trim_scale(prior)::text,'allocation','cumulative proportional quote amounts at contract currency precision'));
 total_subtotal=total_subtotal+taxable;total_tax=total_tax+tax;total_freight=total_freight+freight;end loop;
 select jsonb_build_object('schema_version',1,'kind','purchase_order','number',po.po_number,'order_date',po.order_date,'delivery_date',po.delivery_date,'delivery_location',po.delivery_location,'notes',po.notes,'currency',po.currency,'precision',c.precision,'vendor',rv.vendor_snapshot,'payment_terms',q.payment_terms,'quote_reference',q.reference,'organization',jsonb_build_object('name',o.name),'items',(select jsonb_agg(jsonb_build_object('description',pi.description,'unit',pi.unit,'quantity',pi.quantity,'specification',pi.scope_snapshot,'unit_price',pc.unit_price,'discount',pc.discount,'taxable_amount',pc.taxable_amount,'tax_amount',pc.tax_amount,'freight',pc.freight,'total',pc.total) order by pi.sort_order,pi.id) from public.purchase_order_items pi join public.purchase_order_item_costs pc on pc.item_id=pi.id where pi.po_id=po.id),'subtotal',trim_scale(total_subtotal)::text,'tax_amount',trim_scale(total_tax)::text,'freight',trim_scale(total_freight)::text,'total',trim_scale(total_subtotal+total_tax+total_freight)::text) into document from public.organizations o join public.rfq_vendors rv on rv.organization_id=o.id and rv.rfq_id=q.rfq_id and rv.vendor_id=q.vendor_id where o.id=po.organization_id;
 insert into public.purchase_order_costs(organization_id,po_id,subtotal,tax_amount,freight,total,document_snapshot) values(po.organization_id,po.id,trim_scale(total_subtotal)::text,trim_scale(total_tax)::text,trim_scale(total_freight)::text,trim_scale(total_subtotal+total_tax+total_freight)::text,document);
end$$;
create function public.execution_po_create(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.vendor_quotes;r public.rfqs;existing public.purchase_orders;qi public.vendor_quote_items;ri public.purchase_requisition_items;entry jsonb;target uuid;amount numeric;ordinal integer=0;begin
 perform private.execution_require(p_organization_id,'purchase_order.create');
 perform private.execution_require(p_organization_id,'vendor_quote.view');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>100000 or p_input-array['quote_id','idempotency_key','order_date','delivery_date','delivery_location','notes','items']<>'{}'::jsonb or jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Invalid purchase order' using errcode='22023';end if;
 if jsonb_array_length(p_input->'items') not between 1 and 500 or p_input->>'idempotency_key' is null then raise exception 'Purchase order requires items and retry key' using errcode='22023';end if;
 select * into existing from public.purchase_orders where organization_id=p_organization_id and idempotency_key=(p_input->>'idempotency_key')::uuid;
 if existing.id is not null then if existing.request_hash<>md5(p_input::text) then raise exception 'Purchase order retry payload differs' using errcode='22023';end if;return existing.id;end if;
 select * into q from public.vendor_quotes where organization_id=p_organization_id and id=(p_input->>'quote_id')::uuid and status='recorded';
 if q.id is null then raise exception 'Recorded vendor quote required' using errcode='22023';end if;
 select * into r from public.rfqs where id=q.rfq_id;
 insert into public.purchase_orders(organization_id,contract_id,project_id,vendor_id,quote_id,requisition_id,po_number,currency,order_date,delivery_date,delivery_location,notes,idempotency_key,request_hash)
 values(p_organization_id,q.contract_id,q.project_id,q.vendor_id,q.id,r.requisition_id,private.finance_number(p_organization_id,'purchase_order','PO'),q.currency,coalesce((p_input->>'order_date')::date,current_date),(p_input->>'delivery_date')::date,coalesce(p_input->>'delivery_location',r.delivery_location),coalesce(p_input->>'notes',''),(p_input->>'idempotency_key')::uuid,md5(p_input::text)) returning id into target;
 for entry in select jsonb_array_elements(p_input->'items') loop
 if jsonb_typeof(entry) is distinct from 'object' or entry-array['quote_item_id','quantity']<>'{}'::jsonb then raise exception 'Invalid award line' using errcode='22023';end if;
 select * into qi from public.vendor_quote_items where quote_id=q.id and id=(entry->>'quote_item_id')::uuid;
 select pr.* into ri from public.purchase_requisition_items pr join public.rfq_items rf on rf.requisition_item_id=pr.id where rf.id=qi.rfq_item_id;
 if ri.id is null then raise exception 'Unavailable quote source' using errcode='42501';end if;
 amount=private.execution_decimal(entry->>'quantity');
 if amount<=0 or mod(amount*1000000,private.execution_decimal(ri.snapshot#>>'{conversion,purchase_increment}')*1000000)<>0 then raise exception 'Positive award in purchase increments required' using errcode='22023';end if;
 insert into public.purchase_order_items(organization_id,po_id,quote_item_id,requisition_item_id,variant_id,cost_kind,description,unit,quantity,scope_snapshot,sort_order) values(p_organization_id,target,qi.id,ri.id,ri.variant_id,ri.cost_kind,qi.description,qi.unit,trim_scale(amount)::text,ri.snapshot,ordinal);ordinal=ordinal+1;end loop;
 perform private.execution_po_price(target);
 perform private.crm_audit(p_organization_id,'purchase_order.created','purchase_orders',target);return target;
end$$;
create function public.execution_po_transition(p_organization_id uuid,p_id uuid,p_version integer,p_action text,p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare po public.purchase_orders;begin
 if p_action is null or p_action not in ('issue','cancel','close') then raise exception 'Invalid purchase order transition' using errcode='22023';end if;
 perform private.execution_require(p_organization_id,case when p_action='issue' then 'purchase_order.issue' else 'purchase_order.manage' end);
 select * into po from public.purchase_orders where organization_id=p_organization_id and id=p_id for update;
 if po.id is null then raise exception 'Unavailable purchase order' using errcode='42501';end if;
 if p_action='issue' and po.status in ('issued','partially_received','received') or p_action='cancel' and po.status='cancelled' or p_action='close' and po.status='closed' then return po.id;end if;
 if po.version is distinct from p_version then raise exception 'Stale purchase order' using errcode='40001';end if;
 if p_action='issue' then
 perform private.execution_require(p_organization_id,'purchase_order.view_cost');
 perform private.execution_po_price(po.id);
 update public.purchase_orders set status='issued',version=version+1,issued_at=now(),issued_by=auth.uid() where id=po.id;
 else
 if length(trim(coalesce(p_reason,''))) not between 3 and 3000 then raise exception 'Purchase order decision reason required' using errcode='22023';end if;
 if p_action='cancel' then
 if po.status not in ('draft','issued') or exists(select 1 from public.goods_receipts where po_id=po.id) then raise exception 'Received purchase order cannot be cancelled' using errcode='22023';end if;
 update public.purchase_orders set status='cancelled',version=version+1,decision_reason=p_reason where id=po.id;
 else
 if po.status<>'received' then raise exception 'Fully received purchase order required for closure' using errcode='22023';end if;
 update public.purchase_orders set status='closed',version=version+1,closed_at=now(),decision_reason=p_reason where id=po.id;end if;end if;
 perform private.crm_audit(p_organization_id,'purchase_order.'||p_action,'purchase_orders',po.id);return po.id;
end$$;
revoke all on function private.execution_portion(numeric,numeric,numeric,numeric,integer),private.execution_po_price(uuid) from public,anon,authenticated;
revoke all on function public.execution_po_create(uuid,jsonb),public.execution_po_transition(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.execution_po_create(uuid,jsonb),public.execution_po_transition(uuid,uuid,integer,text,text) to authenticated;
commit;

