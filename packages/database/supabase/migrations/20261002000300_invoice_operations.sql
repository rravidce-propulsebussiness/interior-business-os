begin;
create function private.contracted_item_amount(contract uuid,item uuid) returns numeric language plpgsql stable security definer set search_path='' as $$declare c public.contracts;r public.quotation_revisions;i public.quotation_items;last_id uuid;allocated numeric;begin
 select * into c from public.contracts where id=contract;select * into r from public.quotation_revisions where id=c.revision_id;
 select * into i from public.quotation_items where id=item and revision_id=c.revision_id and not optional;
 if i.id is null then raise exception 'Original included scope required' using errcode='22023';end if;
 if (r.totals->>'subtotal')::numeric=0 then return 0;end if;
 select id into last_id from public.quotation_items where revision_id=r.id and not optional order by sort_order desc,id desc limit 1;
 if i.id<>last_id then return round((i.snapshot->>'final_amount')::numeric*c.original_contract_value::numeric/(r.totals->>'subtotal')::numeric,c.precision);end if;
 select coalesce(sum(round((snapshot->>'final_amount')::numeric*c.original_contract_value::numeric/(r.totals->>'subtotal')::numeric,c.precision)),0) into allocated from public.quotation_items where revision_id=r.id and not optional and id<>last_id;
 return c.original_contract_value::numeric-allocated;
end$$;
create function private.invoice_source_value(c public.contracts,kind text,target uuid) returns numeric language plpgsql stable security definer set search_path='' as $$declare result numeric;begin
 if kind='milestone' then select i.expected_amount::numeric into result from public.payment_schedule_items i join public.payment_schedules s on s.id=i.schedule_id where i.organization_id=c.organization_id and i.contract_id=c.id and i.id=target and s.status='active';
 elsif kind='quotation' then result=private.contracted_item_amount(c.id,target);
 elsif kind='change_order' then select net_adjustment::numeric into result from public.change_orders where organization_id=c.organization_id and contract_id=c.id and id=target and status='approved';end if;
 if result is null or result<=0 then raise exception 'Unavailable invoice source' using errcode='22023';end if;return result;
end$$;
create function public.invoice_save(p_organization_id uuid,p_contract_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$<<invoice_state>> declare c public.contracts;i public.invoices;x jsonb;target uuid;ordinal integer=0;quantity numeric;rate numeric;gross numeric;reduction numeric;net numeric;tax jsonb;components jsonb;document_components jsonb;subtotal numeric=0;discount numeric=0;taxable numeric=0;tax_amount numeric=0;total numeric=0;source text;source_id uuid;source_value numeric;begin
 perform private.finance_require(p_organization_id,'invoice.create');select * into c from public.contracts where organization_id=p_organization_id and id=p_contract_id for update;
 if c.id is null or c.status in ('closed','cancelled') then raise exception 'Unavailable contract' using errcode='42501';end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 200 or octet_length(p_input::text)>200000 then raise exception 'Invalid invoice lines' using errcode='22023';end if;
 document_components=private.finance_tax_components(p_organization_id,(p_input->>'tax_code_id')::uuid);
 if p_input->>'id' is not null then
 perform private.finance_require(p_organization_id,'invoice.manage');select * into i from public.invoices where organization_id=p_organization_id and contract_id=c.id and id=(p_input->>'id')::uuid for update;
 if i.id is null or i.status<>'draft' or i.version is distinct from (p_input->>'version')::integer then raise exception 'Stale invoice' using errcode='40001';end if;
 target=i.id;delete from public.invoice_items where invoice_id=i.id;
 update public.invoices set invoice_type=p_input->>'invoice_type',issue_date=(p_input->>'issue_date')::date,due_date=(p_input->>'due_date')::date,tax_mode=p_input->>'tax_mode',tax_application=p_input->>'tax_application',tax_code_id=(p_input->>'tax_code_id')::uuid,tax_snapshot=document_components,place_of_supply=coalesce(p_input->>'place_of_supply',''),billing_state=coalesce(p_input->>'billing_state',''),notes=coalesce(p_input->>'notes',''),terms=coalesce(p_input->>'terms',''),version=version+1 where id=target;
 else insert into public.invoices(organization_id,contract_id,customer_id,project_id,invoice_type,currency,issue_date,due_date,tax_mode,tax_application,tax_code_id,tax_snapshot,place_of_supply,billing_state,notes,terms)
 values(p_organization_id,c.id,c.customer_id,c.project_id,p_input->>'invoice_type',c.currency,(p_input->>'issue_date')::date,(p_input->>'due_date')::date,p_input->>'tax_mode',p_input->>'tax_application',(p_input->>'tax_code_id')::uuid,document_components,coalesce(p_input->>'place_of_supply',''),coalesce(p_input->>'billing_state',''),coalesce(p_input->>'notes',''),coalesce(p_input->>'terms',(select default_terms from public.organization_billing_settings where organization_id=p_organization_id),'')) returning id into target;end if;
 for x in select jsonb_array_elements(p_input->'items') loop
 source=x->>'source_type';source_id=(x->>'source_id')::uuid;
 if source='manual' then
 perform private.finance_require(p_organization_id,'invoice.manage');
 if source_id is not null then raise exception 'Manual source cannot reference scope' using errcode='22023';end if;
 quantity=private.finance_decimal(x->>'quantity');rate=private.finance_decimal(x->>'unit_rate');
 else quantity=1;source_value=private.invoice_source_value(c,source,source_id);rate=source_value;end if;
 if quantity<=0 then raise exception 'Positive quantity required' using errcode='22023';end if;
 gross=round(quantity*rate,c.precision);reduction=private.finance_decimal(coalesce(x->>'discount','0'));
 if reduction>gross or round(reduction,c.precision)<>reduction then raise exception 'Invalid invoice discount' using errcode='22023';end if;
 net=gross-reduction;components=case when p_input->>'tax_application'='line' then private.finance_tax_components(p_organization_id,(x->>'tax_code_id')::uuid) else '[]'::jsonb end;
 tax=private.finance_tax(net,components,p_input->>'tax_mode',c.precision);
 insert into public.invoice_items(organization_id,contract_id,invoice_id,description,quantity,unit,unit_rate,discount,line_amount,taxable_amount,tax_amount,total,tax_code_id,tax_snapshot,hsn_sac,source_type,source_id,sort_order)
 values(p_organization_id,c.id,target,x->>'description',trim_scale(quantity)::text,coalesce(x->>'unit','each'),trim_scale(rate)::text,trim_scale(reduction)::text,trim_scale(gross)::text,tax->>'taxable',tax->>'tax',tax->>'total',case when p_input->>'tax_application'='line' then (x->>'tax_code_id')::uuid end,tax->'components',coalesce(x->>'hsn_sac',''),source,source_id,ordinal);
 ordinal=ordinal+1;subtotal=subtotal+gross;discount=discount+reduction;taxable=taxable+(tax->>'taxable')::numeric;tax_amount=tax_amount+(tax->>'tax')::numeric;total=total+(tax->>'total')::numeric;
 end loop;
 if p_input->>'tax_application'='document' then tax=private.finance_tax(subtotal-discount,document_components,p_input->>'tax_mode',c.precision);taxable=(tax->>'taxable')::numeric;tax_amount=(tax->>'tax')::numeric;total=(tax->>'total')::numeric;document_components=tax->'components';end if;
 update public.invoices set subtotal=trim_scale(invoice_state.subtotal)::text,discount=trim_scale(invoice_state.discount)::text,taxable_amount=trim_scale(taxable)::text,tax_amount=trim_scale(invoice_state.tax_amount)::text,total=trim_scale(invoice_state.total)::text,tax_snapshot=document_components where id=target;
 perform private.crm_audit(p_organization_id,'invoice.saved','invoices',target);return target;
end$$;
create function private.invoice_document(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.finance_header(i.contract_id)||jsonb_build_object('kind',i.invoice_type,'number',coalesce(i.invoice_number,'DRAFT'),'date',i.issue_date,'due_date',i.due_date,'notes',i.notes,'terms',i.terms,'subtotal',i.subtotal,'discount',i.discount,'taxable',i.taxable_amount,'tax',i.tax_amount,'total',i.total,'tax_mode',i.tax_mode,'tax_application',i.tax_application,'tax_components',i.tax_snapshot,'place_of_supply',i.place_of_supply,'billing_state',i.billing_state,'lines',coalesce((select jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity,'unit',l.unit,'rate',l.unit_rate,'amount',l.total,'discount',l.discount,'taxable',l.taxable_amount,'tax',l.tax_amount,'tax_components',l.tax_snapshot,'hsn_sac',l.hsn_sac) order by l.sort_order) from public.invoice_items l where l.invoice_id=i.id),'[]')) from public.invoices i where i.id=target;
$$;
create function public.invoice_issue(p_organization_id uuid,p_id uuid,p_version integer) returns uuid language plpgsql security definer set search_path='' as $$declare i public.invoices;c public.contracts;n text;prefix text;x record;begin
 perform private.finance_require(p_organization_id,'invoice.issue');select * into i from public.invoices where organization_id=p_organization_id and id=p_id for update;
 if i.id is null then raise exception 'Unavailable invoice' using errcode='42501';end if;
 if i.status='issued' then return i.id;end if;
 select * into c from public.contracts where id=i.contract_id for update;
 if i.status<>'draft' or i.version is distinct from p_version or c.status in ('closed','cancelled') then raise exception 'Stale invoice' using errcode='40001';end if;
 if i.total::numeric<=0 then raise exception 'Positive invoice total required' using errcode='22023';end if;
 if i.invoice_type='tax_invoice' then
 if i.total::numeric+coalesce((select sum(total::numeric) from public.invoices where contract_id=c.id and invoice_type='tax_invoice' and status='issued'),0)>private.contract_value(c.id) then raise exception 'Invoice exceeds contract value; approve a variation first' using errcode='22023';end if;
 for x in select source_type,source_id,sum(total::numeric) amount from public.invoice_items where invoice_id=i.id and source_type<>'manual' group by source_type,source_id loop
 if x.amount+coalesce((select sum(l.total::numeric) from public.invoice_items l join public.invoices other on other.id=l.invoice_id where other.contract_id=c.id and other.status='issued' and other.invoice_type='tax_invoice' and l.source_type=x.source_type and l.source_id=x.source_id),0)>private.invoice_source_value(c,x.source_type,x.source_id) then raise exception 'Invoice source already billed or exceeded' using errcode='22023';end if;
 end loop;end if;
 select invoice_prefix into prefix from public.organization_billing_settings where organization_id=p_organization_id;
 n=private.finance_number(p_organization_id,i.invoice_type,case when i.invoice_type='proforma' then 'PROFORMA' else coalesce(prefix,'INV') end);
 update public.invoices set invoice_number=n where id=i.id;
 update public.invoices set document_snapshot=private.invoice_document(i.id),status='issued',issued_at=now(),issued_by=auth.uid(),version=version+1 where id=i.id;
 perform private.crm_audit(p_organization_id,'invoice.issued','invoices',i.id);return i.id;
end$$;
create function public.invoice_void(p_organization_id uuid,p_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare i public.invoices;begin
 perform private.finance_require(p_organization_id,'invoice.manage');select * into i from public.invoices where organization_id=p_organization_id and id=p_id for update;
 if i.id is null then raise exception 'Unavailable invoice' using errcode='42501';end if;
 if i.status='void' then return i.id;end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 3000 or private.invoice_paid(i.id)>0 then raise exception 'Reason required and allocations must be reversed first' using errcode='22023';end if;
 if exists(select 1 from public.contracts where id=i.contract_id and status='closed') then raise exception 'Closed contract' using errcode='22023';end if;
 update public.invoices set status='void',voided_at=now(),void_reason=p_reason,version=version+1 where id=i.id;
 perform private.crm_audit(p_organization_id,'invoice.voided','invoices',i.id);return i.id;
end$$;
revoke all on function private.contracted_item_amount(uuid,uuid),private.invoice_source_value(public.contracts,text,uuid),private.invoice_document(uuid) from public,anon,authenticated;
revoke all on function public.invoice_save(uuid,uuid,jsonb),public.invoice_issue(uuid,uuid,integer),public.invoice_void(uuid,uuid,text) from public,anon;
grant execute on function public.invoice_save(uuid,uuid,jsonb),public.invoice_issue(uuid,uuid,integer),public.invoice_void(uuid,uuid,text) to authenticated;
commit;
