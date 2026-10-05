begin;
alter table public.vendor_quotes add column idempotency_key uuid not null default gen_random_uuid();
alter table public.vendor_quotes add column request_hash text not null default '';
alter table public.vendor_quotes add unique(organization_id,idempotency_key);
create function public.execution_vendor_quote_save(p_organization_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.vendor_quotes;r public.rfqs;c public.contracts;i public.rfq_items;x jsonb;component jsonb;tax jsonb;components jsonb;
 target uuid;quantity numeric;rate numeric;discount numeric;line_amount numeric;quote_subtotal numeric=0;tax_total numeric=0;grand_total numeric=0;quote_freight numeric;ordinal integer=0;begin
 perform private.execution_require(p_organization_id,'vendor_quote.manage');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>250000 or p_input-array['id','version','idempotency_key','rfq_id','vendor_id','reference','currency','valid_until','lead_time_days','freight','payment_terms','notes','items']<>'{}'::jsonb or jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Invalid vendor quote' using errcode='22023';end if;
 if jsonb_array_length(p_input->'items') not between 1 and 500 then raise exception 'Quote requires bounded items' using errcode='22023';end if;
 if p_input->>'id' is not null then
 select * into q from public.vendor_quotes where organization_id=p_organization_id and id=(p_input->>'id')::uuid for update;
 if q.id is null then raise exception 'Unavailable vendor quote' using errcode='42501';end if;
 if q.status<>'draft' or q.version is distinct from (p_input->>'version')::integer then raise exception 'Current draft vendor quote required' using errcode='40001';end if;
 if q.rfq_id is distinct from (p_input->>'rfq_id')::uuid or q.vendor_id is distinct from (p_input->>'vendor_id')::uuid then raise exception 'Stable quote source required' using errcode='22023';end if;
 else
 if p_input->>'idempotency_key' is null then raise exception 'Quote retry key required' using errcode='22023';end if;
 select * into q from public.vendor_quotes where organization_id=p_organization_id and idempotency_key=(p_input->>'idempotency_key')::uuid;
 if q.id is not null then if q.request_hash<>md5(p_input::text) then raise exception 'Quote retry payload differs' using errcode='22023';end if;return q.id;end if;
 end if;
 select * into r from public.rfqs where organization_id=p_organization_id and id=(p_input->>'rfq_id')::uuid and status='issued' for update;
 if r.id is null then raise exception 'Issued RFQ required' using errcode='22023';end if;
 select * into c from public.contracts where id=r.contract_id and status not in ('closed','cancelled');
 if c.id is null then raise exception 'Open contract required' using errcode='22023';end if;
 if p_input->>'currency' is distinct from c.currency then raise exception 'Quote currency must match contract; conversion is not implicit' using errcode='22023';end if;
 if not exists(select 1 from public.rfq_vendors rv join public.vendors v on v.id=rv.vendor_id where rv.rfq_id=r.id and rv.vendor_id=(p_input->>'vendor_id')::uuid and v.status='active') then raise exception 'Unavailable invited vendor' using errcode='42501';end if;
 quote_freight=private.execution_decimal(coalesce(p_input->>'freight','0'));
 if round(quote_freight,c.precision)<>quote_freight then raise exception 'Freight exceeds currency precision' using errcode='22023';end if;
 if q.id is null then
 insert into public.vendor_quotes(organization_id,contract_id,project_id,rfq_id,vendor_id,reference,currency,valid_until,lead_time_days,freight,subtotal,tax_amount,total,payment_terms,notes,idempotency_key,request_hash)
 values(p_organization_id,c.id,c.project_id,r.id,(p_input->>'vendor_id')::uuid,p_input->>'reference',c.currency,(p_input->>'valid_until')::date,coalesce((p_input->>'lead_time_days')::integer,0),trim_scale(quote_freight)::text,'0','0','0',coalesce(p_input->>'payment_terms',''),coalesce(p_input->>'notes',''),(p_input->>'idempotency_key')::uuid,md5(p_input::text)) returning id into target;
 else target=q.id;delete from public.vendor_quote_items where quote_id=q.id;
 update public.vendor_quotes set reference=p_input->>'reference',valid_until=(p_input->>'valid_until')::date,lead_time_days=coalesce((p_input->>'lead_time_days')::integer,0),freight=trim_scale(quote_freight)::text,payment_terms=coalesce(p_input->>'payment_terms',''),notes=coalesce(p_input->>'notes',''),version=version+1 where id=q.id;end if;
 for x in select jsonb_array_elements(p_input->'items') loop
 if jsonb_typeof(x) is distinct from 'object' or x-array['rfq_item_id','quantity','unit_price','discount','tax_mode','tax_components','minimum_order','lead_time_days','notes']<>'{}'::jsonb then raise exception 'Invalid vendor quote item' using errcode='22023';end if;
 select * into i from public.rfq_items where organization_id=p_organization_id and rfq_id=r.id and id=(x->>'rfq_item_id')::uuid;
 if i.id is null then raise exception 'Unavailable RFQ item' using errcode='42501';end if;
 quantity=private.execution_decimal(x->>'quantity');rate=private.execution_decimal(x->>'unit_price');discount=private.execution_decimal(coalesce(x->>'discount','0'));
 if quantity<=0 or quantity>i.quantity::numeric or mod(quantity*1000000,private.execution_decimal(i.snapshot#>>'{conversion,purchase_increment}')*1000000)<>0 then raise exception 'Quote quantity exceeds request or violates purchase increment' using errcode='22023';end if;
 line_amount=round(quantity*rate,c.precision)-discount;
 if line_amount<0 or round(discount,c.precision)<>discount then raise exception 'Invalid quote discount' using errcode='22023';end if;
 components=coalesce(x->'tax_components','[]');
 if jsonb_typeof(components) is distinct from 'array' or jsonb_array_length(components)>10 then raise exception 'Invalid tax components' using errcode='22023';end if;
 for component in select jsonb_array_elements(components) loop
 if jsonb_typeof(component) is distinct from 'object' or component-array['name','rate']<>'{}'::jsonb or length(trim(coalesce(component->>'name',''))) not between 1 and 80 then raise exception 'Invalid tax component' using errcode='22023';end if;end loop;
 tax=private.finance_tax(line_amount,components,coalesce(x->>'tax_mode','exclusive'),c.precision);
 insert into public.vendor_quote_items(organization_id,quote_id,rfq_id,rfq_item_id,description,unit,quantity,unit_price,discount,taxable_amount,tax_amount,total,tax_mode,tax_components,minimum_order,lead_time_days,notes,sort_order)
 values(p_organization_id,target,r.id,i.id,i.description,i.unit,trim_scale(quantity)::text,trim_scale(rate)::text,trim_scale(discount)::text,tax->>'taxable',tax->>'tax',tax->>'total',coalesce(x->>'tax_mode','exclusive'),tax->'components',coalesce(x->>'minimum_order','0'),coalesce((x->>'lead_time_days')::integer,0),coalesce(x->>'notes',''),ordinal);
 quote_subtotal=quote_subtotal+(tax->>'taxable')::numeric;tax_total=tax_total+(tax->>'tax')::numeric;grand_total=grand_total+(tax->>'total')::numeric;ordinal=ordinal+1;end loop;
 update public.vendor_quotes set subtotal=trim_scale(quote_subtotal)::text,tax_amount=trim_scale(tax_total)::text,total=trim_scale(grand_total+quote_freight)::text where id=target;
 perform private.crm_audit(p_organization_id,'vendor_quote.saved','vendor_quotes',target);return target;
end$$;
create function public.execution_vendor_quote_transition(p_organization_id uuid,p_id uuid,p_version integer,p_action text) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.vendor_quotes;begin
 perform private.execution_require(p_organization_id,'vendor_quote.manage');
 if p_action is null or p_action not in ('record','decline','cancel') then raise exception 'Invalid quote transition' using errcode='22023';end if;
 select * into q from public.vendor_quotes where organization_id=p_organization_id and id=p_id for update;
 if q.id is null then raise exception 'Unavailable vendor quote' using errcode='42501';end if;
 if p_action='record' and q.status='recorded' or p_action='decline' and q.status='declined' or p_action='cancel' and q.status='cancelled' then return q.id;end if;
 if q.version is distinct from p_version then raise exception 'Stale vendor quote' using errcode='40001';end if;
 if not exists(select 1 from public.rfqs where id=q.rfq_id and status='issued') then raise exception 'Open RFQ required' using errcode='22023';end if;
 if p_action in ('record','decline') then
 if q.status<>'draft' then raise exception 'Draft vendor quote required' using errcode='22023';end if;
 update public.vendor_quotes set status=case when p_action='record' then 'recorded' else 'declined' end,recorded_at=now(),version=version+1 where id=q.id;
 update public.rfq_vendors set response_status=case when p_action='record' then 'received' else 'declined' end where rfq_id=q.rfq_id and vendor_id=q.vendor_id;
 else
 if q.status not in ('draft','recorded') or exists(select 1 from public.purchase_orders where quote_id=q.id and status<>'cancelled') then raise exception 'Resolve purchase orders before quote cancellation' using errcode='22023';end if;
 update public.vendor_quotes set status='cancelled',version=version+1 where id=q.id;end if;
 perform private.crm_audit(p_organization_id,'vendor_quote.'||p_action,'vendor_quotes',q.id);return q.id;
end$$;
create function public.execution_vendor_comparison(p_organization_id uuid,p_rfq_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.execution_access(p_organization_id,'vendor_quote.view') or not exists(select 1 from public.rfqs where organization_id=p_organization_id and id=p_rfq_id) then raise exception 'Unavailable vendor comparison' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('vendor_id',rv.vendor_id,'vendor_name',rv.vendor_snapshot->>'name','response_status',rv.response_status,'quotes',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('expired',q.valid_until<current_date,'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order,i.id),'[]') from public.vendor_quote_items i where i.quote_id=q.id)) order by q.created_at,q.id),'[]') from public.vendor_quotes q where q.rfq_id=p_rfq_id and q.vendor_id=rv.vendor_id and q.status='recorded')) order by rv.vendor_snapshot->>'name',rv.vendor_id),'[]') into result from public.rfq_vendors rv where rv.rfq_id=p_rfq_id;
 return jsonb_build_object('rfq_id',p_rfq_id,'vendors',result,'comparison_basis','Recorded vendor terms; no ranking or award recommendation');
end$$;
revoke all on function public.execution_vendor_quote_save(uuid,jsonb),public.execution_vendor_quote_transition(uuid,uuid,integer,text),public.execution_vendor_comparison(uuid,uuid) from public,anon;
grant execute on function public.execution_vendor_quote_save(uuid,jsonb),public.execution_vendor_quote_transition(uuid,uuid,integer,text),public.execution_vendor_comparison(uuid,uuid) to authenticated;
commit;

