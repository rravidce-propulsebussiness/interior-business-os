begin;
create function private.change_catalog_require(org uuid,item uuid,branch uuid) returns void language plpgsql stable security definer set search_path='' as $$begin
 if not private.finance_access(org,'change_order.create') or not private.has_permission(org,'catalog.view') or not private.entitled(org,'catalog') or not private.entitled(org,'pricing') or not exists(select 1 from public.catalog_items where organization_id=org and id=item and status='active') then raise exception 'Forbidden' using errcode='42501';end if;
 if branch is not null and not exists(select 1 from public.branches where organization_id=org and id=branch and status='active') then raise exception 'Unavailable branch' using errcode='42501';end if;
end$$;
create function public.change_order_configuration(p_organization_id uuid,p_contract_id uuid,p_item_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare c public.contracts;begin
 select * into c from public.contracts where organization_id=p_organization_id and id=p_contract_id;
 if c.id is null then raise exception 'Unavailable contract' using errcode='42501';end if;
 perform private.change_catalog_require(p_organization_id,p_item_id,c.branch_id);return jsonb_set(private.quotation_catalog_data(p_organization_id,p_item_id,c.branch_id),'{costs}','[]');
end$$;
create function public.change_order_pricing_context(p_message text,p_signature text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare e jsonb;c public.contracts;data jsonb;begin
 e=private.verify_quotation_message(p_message,p_signature,'finance_pricing');
 select * into c from public.contracts where organization_id=(e->>'organization_id')::uuid and id=(e->>'contract_id')::uuid;
 if c.id is null then raise exception 'Unavailable contract' using errcode='42501';end if;
 perform private.change_catalog_require(c.organization_id,(e->>'item_id')::uuid,c.branch_id);
 data=private.quotation_catalog_data(c.organization_id,(e->>'item_id')::uuid,c.branch_id);return jsonb_build_object('catalog',data,'fingerprint',md5(data::text),'currency',c.currency,'branch_id',c.branch_id);
end$$;
create function public.change_order_command(p_message text,p_signature text) returns uuid language plpgsql security definer set search_path='' as $$declare e jsonb;org uuid;action text;c public.contracts;co public.change_orders;x jsonb;target uuid;old_amount numeric;new_amount numeric;net numeric=0;delta numeric;ordinal integer=0;snap jsonb;original uuid;item uuid;value numeric;doc jsonb;begin
 e=private.verify_quotation_message(p_message,p_signature,'finance_change');org=(e->>'organization_id')::uuid;action=e->>'action';
 if action is null or action not in ('save','issue','approve','reject','cancel') then raise exception 'Invalid change order action' using errcode='22023';end if;
 perform private.finance_require(org,case action when 'save' then 'change_order.create' when 'issue' then 'change_order.issue' when 'approve' then 'change_order.approve' else 'change_order.manage' end);
 insert into private.quotation_receipts(nonce,actor,expires_at) values((e->>'nonce')::uuid,auth.uid(),to_timestamp((e->>'expires')::bigint));
 select * into c from public.contracts where organization_id=org and id=(e->>'contract_id')::uuid for update;
 if c.id is null or c.status in ('closed','cancelled') then raise exception 'Unavailable contract' using errcode='42501';end if;
 if e->>'id' is not null then select * into co from public.change_orders where organization_id=org and contract_id=c.id and id=(e->>'id')::uuid for update;if co.id is null then raise exception 'Unavailable change order' using errcode='42501';end if;end if;
 if action<>'save' and co.id is null then raise exception 'Change order required' using errcode='22023';end if;
 if co.id is not null then
 if (action='approve' and co.status='approved') or (action='issue' and co.status='issued') or (action='reject' and co.status='rejected') or (action='cancel' and co.status='cancelled') then return co.id;end if;
 if co.version is distinct from (e->>'version')::integer then raise exception 'Stale change order' using errcode='40001';end if;end if;
 if action='save' then
 if jsonb_typeof(e->'items') is distinct from 'array' or jsonb_array_length(e->'items') not between 1 and 100 then raise exception 'Change order lines required' using errcode='22023';end if;
 if co.id is null then insert into public.change_orders(organization_id,contract_id,change_order_number,reason,terms) values(org,c.id,private.finance_number(org,'change_order','CO'),e->>'reason',coalesce(e->>'terms','')) returning id into target;
 else perform private.finance_require(org,'change_order.manage');if co.status<>'draft' then raise exception 'Draft required' using errcode='22023';end if;
 target=co.id;delete from public.change_order_items where change_order_id=co.id;update public.change_orders set reason=e->>'reason',terms=coalesce(e->>'terms',''),version=version+1 where id=co.id;end if;
 for x in select jsonb_array_elements(e->'items') loop
 original=(x->>'original_item_id')::uuid;old_amount=0;new_amount=0;snap=null;
 if x->>'change_type' in ('deletion','modification') then old_amount=private.contracted_item_amount(c.id,original);
 if exists(select 1 from public.change_order_items l join public.change_orders h on h.id=l.change_order_id where h.contract_id=c.id and h.status='approved' and l.original_item_id=original) then raise exception 'Original scope already changed; use a reasoned adjustment' using errcode='22023';end if;
 elsif original is not null then raise exception 'Unexpected original scope reference' using errcode='22023';end if;
 if x->>'change_type' in ('addition','modification') then
 if x->>'pricing_type'='catalog' then
 snap=x->'snapshot';item=(snap#>>'{pricing_input,item_id}')::uuid;perform private.change_catalog_require(org,item,c.branch_id);
 if snap->>'snapshot_version' is distinct from '1' or snap->>'line_type' is distinct from 'catalog' or snap#>>'{pricing_input,currency}' is distinct from c.currency or (snap#>>'{pricing_input,organization_id}')::uuid is distinct from org or (snap#>>'{pricing_input,branch_id}')::uuid is distinct from c.branch_id or md5(private.quotation_catalog_data(org,item,c.branch_id)::text) is distinct from x->>'fingerprint' then raise exception 'Stale or mismatched pricing' using errcode='40001';end if;
 if snap->'override'<>'null'::jsonb or snap#>>'{discount,kind}'<>'none' then raise exception 'Change orders do not support hidden overrides' using errcode='22023';end if;
 new_amount=private.finance_decimal(snap->>'final_amount');
 else perform private.finance_require(org,'change_order.manual');new_amount=round(private.finance_decimal(x->>'quantity')*private.finance_decimal(x->>'unit_rate'),c.precision);
 if private.finance_decimal(x->>'quantity')<=0 then raise exception 'Positive quantity required' using errcode='22023';end if;
 snap=jsonb_build_object('name',x->>'description','quantity',x->>'quantity','display_rate',x->>'unit_rate','unit',jsonb_build_object('label',coalesce(x->>'unit','each')),'customer_specifications',coalesce(x->'specifications','[]'),'final_amount',trim_scale(new_amount)::text,'line_type','manual');end if;
 end if;
 if x->>'change_type'='price_adjustment' then perform private.finance_require(org,'change_order.manual');delta=private.finance_decimal(x->>'adjustment',true);
 elsif x->>'change_type' in ('addition','deletion','modification') then delta=new_amount-old_amount;else raise exception 'Invalid change type' using errcode='22023';end if;
 if round(delta,c.precision)<>delta then raise exception 'Change precision exceeds contract precision' using errcode='22023';end if;
 insert into public.change_order_items(organization_id,contract_id,change_order_id,change_type,description,reason,area,original_item_id,original_amount,new_amount,net_adjustment,new_snapshot,sort_order)
 values(org,c.id,target,x->>'change_type',x->>'description',x->>'reason',coalesce(x->>'area',''),original,trim_scale(old_amount)::text,trim_scale(new_amount)::text,trim_scale(delta)::text,snap,ordinal);ordinal=ordinal+1;net=net+delta;
 end loop;
 update public.change_orders set net_adjustment=trim_scale(net)::text where id=target;
 else target=co.id;
 if action='issue' then
 if co.status<>'draft' then raise exception 'Draft required' using errcode='22023';end if;
 value=private.contract_value(c.id);
 if value+co.net_adjustment::numeric<0 then raise exception 'Negative contract value' using errcode='22023';end if;
 doc=private.finance_header(c.id)||jsonb_build_object('kind','change_order','number',co.change_order_number,'date',current_date,'notes',co.reason,'terms',co.terms,'total',co.net_adjustment,'previous_value',trim_scale(value)::text,'revised_value',trim_scale(value+co.net_adjustment::numeric)::text,'lines',(select jsonb_agg(jsonb_build_object('description',l.description,'change_type',l.change_type,'reason',l.reason,'area',l.area,'quantity',coalesce(l.new_snapshot->>'quantity','1'),'unit',coalesce(l.new_snapshot#>>'{unit,label}','scope'),'rate',coalesce(l.new_snapshot->>'display_rate',l.original_amount),'amount',l.net_adjustment,'original_amount',l.original_amount,'new_amount',l.new_amount,'specifications',coalesce(l.new_snapshot->'customer_specifications','[]')) order by l.sort_order) from public.change_order_items l where l.change_order_id=co.id));
 update public.change_orders set status='issued',issued_at=now(),previous_contract_value=trim_scale(value)::text,revised_contract_value=trim_scale(value+co.net_adjustment::numeric)::text,document_snapshot=doc,version=version+1 where id=co.id;
 elsif action='approve' then
 if co.status<>'issued' or length(trim(coalesce(e->>'evidence',''))) not between 3 and 3000 then raise exception 'Issued change and approval evidence required' using errcode='22023';end if;
 value=private.contract_value(c.id);
 if value<>co.previous_contract_value::numeric then raise exception 'Contract changed since issue; cancel and issue a fresh change order' using errcode='40001';end if;
 if value+co.net_adjustment::numeric<0 then raise exception 'Negative contract value' using errcode='22023';end if;
 if exists(select 1 from public.change_order_items l join public.change_order_items other on other.original_item_id=l.original_item_id join public.change_orders h on h.id=other.change_order_id where l.change_order_id=co.id and h.contract_id=c.id and h.status='approved') then raise exception 'Original scope already changed' using errcode='40001';end if;
 update public.change_orders set status='approved',approved_at=now(),approved_by=auth.uid(),approval_evidence=e->>'evidence',version=version+1 where id=co.id;
 perform private.crm_audit(org,'contract.value_changed','contracts',c.id);
 else
 if co.status not in ('draft','issued') or (action='reject' and co.status<>'issued') or length(trim(coalesce(e->>'reason',''))) not between 3 and 3000 then raise exception 'Invalid decision or missing reason' using errcode='22023';end if;
 update public.change_orders set status=case when action='reject' then 'rejected' else 'cancelled' end,decision_reason=e->>'reason',version=version+1 where id=co.id;
 end if;end if;
 perform private.crm_audit(org,'change_order.'||case action when 'save' then 'saved' when 'issue' then 'issued' when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end,'change_orders',target);return target;
end$$;
revoke all on function private.change_catalog_require(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.change_order_configuration(uuid,uuid,uuid),public.change_order_pricing_context(text,text),public.change_order_command(text,text) from public,anon;
grant execute on function public.change_order_configuration(uuid,uuid,uuid),public.change_order_pricing_context(text,text),public.change_order_command(text,text) to authenticated;
commit;
