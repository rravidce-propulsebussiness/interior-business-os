begin;
create function private.contract_value(target uuid) returns numeric language sql stable security definer set search_path='' as $$
 select c.original_contract_value::numeric+coalesce((select sum(net_adjustment::numeric) from public.change_orders where contract_id=c.id and status='approved'),0) from public.contracts c where c.id=target;
$$;
create function private.invoice_paid(target uuid) returns numeric language sql stable security definer set search_path='' as $$select coalesce(sum(amount::numeric),0) from public.payment_allocations where invoice_id=target and reversed_at is null;$$;
create function private.payment_allocated(target uuid) returns numeric language sql stable security definer set search_path='' as $$select coalesce(sum(amount::numeric),0) from public.payment_allocations where payment_id=target and reversed_at is null;$$;
create function private.finance_header(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schema_version',1,'contract_number',c.contract_number,'currency',c.currency,'customer',c.source_snapshot->'header'->'customer','project',c.source_snapshot->'header'->'project','business',jsonb_build_object('name',coalesce(s.legal_name,c.source_snapshot#>>'{header,branding,name}'),'address',coalesce(s.billing_address,''),'tax_identifier',coalesce(s.tax_identifier,''),'payment_instructions',coalesce(s.payment_instructions,''),'receipt_footer',coalesce(s.receipt_footer,''))) from public.contracts c left join public.organization_billing_settings s on s.organization_id=c.organization_id where c.id=target;
$$;
create function private.finance_tax_components(org uuid,target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;x jsonb;rate numeric=0;begin
 if target is null then return '[]';end if;
 select components into result from public.tax_codes where organization_id=org and id=target and active;
 if result is null then raise exception 'Unavailable tax code' using errcode='42501';end if;
 for x in select jsonb_array_elements(result) loop
 if jsonb_typeof(x) is distinct from 'object' or length(trim(coalesce(x->>'name',''))) not between 1 and 80 then raise exception 'Invalid tax component' using errcode='22023';end if;
 rate=rate+private.finance_decimal(x->>'rate');
 end loop;
 if rate>100 then raise exception 'Tax exceeds supported rate' using errcode='22023';end if;
 return result;
end$$;
create function private.finance_tax(amount numeric,components jsonb,mode text,places integer) returns jsonb language plpgsql immutable set search_path='' as $$declare rate numeric=0;tax numeric=0;basis numeric;x jsonb;part numeric;parts jsonb='[]';begin
 for x in select jsonb_array_elements(components) loop rate=rate+private.finance_decimal(x->>'rate');end loop;
 if mode not in ('inclusive','exclusive') or places not between 0 and 6 or rate>100 or amount<0 then raise exception 'Invalid tax basis' using errcode='22023';end if;
 basis=case when mode='inclusive' then amount*100/(100+rate) else amount end;
 for x in select jsonb_array_elements(components) loop
 part=round(basis*private.finance_decimal(x->>'rate')/100,places);tax=tax+part;
 parts=parts||jsonb_build_array(jsonb_build_object('name',x->>'name','rate',x->>'rate','amount',trim_scale(part)::text));
 end loop;
 return jsonb_build_object('taxable',trim_scale(case when mode='inclusive' then amount-tax else amount end)::text,'tax',trim_scale(tax)::text,'total',trim_scale(case when mode='inclusive' then amount else amount+tax end)::text,'components',parts);
end$$;
create function private.finance_guard() returns trigger language plpgsql security definer set search_path='' as $$declare a jsonb=to_jsonb(old);b jsonb=to_jsonb(new);parent_status text;begin
 if tg_op='DELETE' then
 if tg_table_name in ('invoice_items','change_order_items','payment_schedule_items') then
   if tg_table_name='invoice_items' then select status into parent_status from public.invoices where id=old.invoice_id for update;
   elsif tg_table_name='change_order_items' then select status into parent_status from public.change_orders where id=old.change_order_id for update;
   else select status into parent_status from public.payment_schedules where id=old.schedule_id for update;end if;
   if parent_status='draft' then return old;end if;
 end if;
 raise exception 'Financial history cannot be deleted' using errcode='23514';end if;
 if tg_op='UPDATE' and (a->'id' is distinct from b->'id' or a->'organization_id' is distinct from b->'organization_id' or a->'contract_id' is distinct from b->'contract_id') then raise exception 'Stable financial identity required' using errcode='23514';end if;
 if tg_table_name in ('invoice_items','change_order_items','payment_schedule_items') then
 if tg_table_name='invoice_items' then
 if tg_op='UPDATE' and old.invoice_id<>new.invoice_id then raise exception 'Stable parent required' using errcode='23514';end if;
 select status into parent_status from public.invoices where id=new.invoice_id for update;
 elsif tg_table_name='change_order_items' then
 if tg_op='UPDATE' and old.change_order_id<>new.change_order_id then raise exception 'Stable parent required' using errcode='23514';end if;
 select status into parent_status from public.change_orders where id=new.change_order_id for update;
 else
 if tg_op='UPDATE' and old.schedule_id<>new.schedule_id then raise exception 'Stable parent required' using errcode='23514';end if;
 select status into parent_status from public.payment_schedules where id=new.schedule_id for update;end if;
 if parent_status is distinct from 'draft' then raise exception 'Frozen financial lines' using errcode='23514';end if;
 elsif tg_op='UPDATE' then
 if tg_table_name='contracts' and a-array['status','version','started_at','completed_at','closed_at','cancelled_at','status_reason','updated_at'] is distinct from b-array['status','version','started_at','completed_at','closed_at','cancelled_at','status_reason','updated_at'] then raise exception 'Frozen contract baseline' using errcode='23514';
 elsif tg_table_name in ('invoices','change_orders','payment_schedules') and (a->>'status')<>'draft' then
 if a-array['status','version','voided_at','void_reason','approved_at','approved_by','approval_evidence','decision_reason','updated_at'] is distinct from b-array['status','version','voided_at','void_reason','approved_at','approved_by','approval_evidence','decision_reason','updated_at'] then raise exception 'Frozen commercial document' using errcode='23514';end if;
 if (a->>'status') in ('approved','void','rejected','cancelled','superseded') then raise exception 'Terminal financial document' using errcode='23514';end if;
 if tg_table_name='invoices' and not((a->>'status')='issued' and (b->>'status')='void') or tg_table_name='change_orders' and not((a->>'status')='issued' and (b->>'status') in ('approved','rejected','cancelled')) or tg_table_name='payment_schedules' and not((a->>'status')='active' and (b->>'status')='superseded') then raise exception 'Invalid financial transition' using errcode='23514';end if;
 elsif tg_table_name in ('payments','receipts','payment_requests') then
 if a-array['status','voided_at','voided_by','void_reason','updated_at'] is distinct from b-array['status','voided_at','voided_by','void_reason','updated_at'] or (a->>'status')='void' or (b->>'status')<>'void' then raise exception 'Frozen payment document' using errcode='23514';end if;
 elsif tg_table_name='payment_allocations' then
 if old.reversed_at is not null or new.reversed_at is null or a-array['reversed_at','reversed_by','reversal_reason','updated_at'] is distinct from b-array['reversed_at','reversed_by','reversal_reason','updated_at'] then raise exception 'Frozen allocation' using errcode='23514';end if;
 end if;end if;
 return new;
end$$;
do $$declare t text;begin foreach t in array array['contracts','payment_schedules','payment_schedule_items','payment_requests','invoices','invoice_items','payments','payment_allocations','receipts','change_orders','change_order_items'] loop execute format('create trigger finance_guard before insert or update or delete on public.%I for each row execute function private.finance_guard()',t);end loop;end$$;
create function private.finance_allocate(org uuid,payment uuid,input jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare p public.payments;i public.invoices;a public.payment_allocations;amount numeric;target uuid;places integer;begin
 perform private.finance_require(org,'payment.allocate');
 select * into p from public.payments where organization_id=org and id=payment for update;
 select * into i from public.invoices where organization_id=org and id=(input->>'invoice_id')::uuid for update;
 if p.id is null or i.id is null or p.contract_id<>i.contract_id or p.currency<>i.currency or p.status<>'recorded' or i.status<>'issued' or i.invoice_type<>'tax_invoice' then raise exception 'Unavailable payment or invoice' using errcode='42501';end if;
 amount=private.finance_decimal(input->>'amount');
 select * into a from public.payment_allocations where organization_id=org and idempotency_key=(input->>'idempotency_key')::uuid;
 if a.id is not null then
 if a.payment_id=payment and a.invoice_id=i.id and a.amount::numeric=amount and a.reversed_at is null then return a.id;end if;
 raise exception 'Allocation key already used' using errcode='40001';end if;
 select precision into places from public.contracts where id=p.contract_id;
 if amount<=0 or round(amount,places)<>amount or private.payment_allocated(p.id)+amount>p.amount::numeric or private.invoice_paid(i.id)+amount>i.total::numeric then raise exception 'Allocation exceeds available balance' using errcode='22023';end if;
 insert into public.payment_allocations(organization_id,contract_id,payment_id,invoice_id,amount,idempotency_key) values(org,p.contract_id,p.id,i.id,trim_scale(amount)::text,(input->>'idempotency_key')::uuid) returning id into target;
 perform private.crm_audit(org,'payment.allocated','payment_allocations',target);return target;
end$$;
-- Financial audit records carry identifiers only. Their visibility still requires
-- the corresponding read permission, including after entitlement revocation.
create policy finance_audit_restriction on public.audit_logs as restrictive for select to authenticated using(
 entity_type not in ('contracts','payment_schedules','payment_schedule_items','payment_requests','invoices','invoice_items','payments','payment_allocations','receipts','change_orders','change_order_items','organization_billing_settings','payment_methods','tax_codes') or private.finance_access(organization_id,case entity_type when 'contracts' then 'contract.view' when 'payment_schedules' then 'payment_schedule.view' when 'payment_schedule_items' then 'payment_schedule.view' when 'payment_requests' then 'payment_request.view' when 'invoices' then 'invoice.view' when 'invoice_items' then 'invoice.view' when 'payments' then 'payment.view' when 'payment_allocations' then 'payment.view' when 'receipts' then 'receipt.view' when 'change_orders' then 'change_order.view' when 'change_order_items' then 'change_order.view' when 'organization_billing_settings' then 'billing.manage' when 'payment_methods' then 'payment.view' else 'invoice.view' end));
revoke all on function private.contract_value(uuid),private.invoice_paid(uuid),private.payment_allocated(uuid),private.finance_header(uuid),private.finance_tax_components(uuid,uuid),private.finance_tax(numeric,jsonb,text,integer),private.finance_guard(),private.finance_allocate(uuid,uuid,jsonb) from public,anon,authenticated;
commit;
