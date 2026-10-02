begin;
create function public.payment_record(p_organization_id uuid,p_contract_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare c public.contracts;p public.payments;m public.payment_methods;target uuid;receipt uuid;amount numeric;x jsonb;n text;prefix text;hash text;snapshot jsonb;begin
 perform private.finance_require(p_organization_id,'payment.record');select * into c from public.contracts where organization_id=p_organization_id and id=p_contract_id for update;
 if c.id is null then raise exception 'Unavailable contract' using errcode='42501';end if;
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>40000 or jsonb_typeof(coalesce(p_input->'allocations','[]'))<>'array' or jsonb_array_length(coalesce(p_input->'allocations','[]'))>100 then raise exception 'Invalid payment' using errcode='22023';end if;
 hash=encode(extensions.digest(p_input::text,'sha256'),'hex');
 select * into p from public.payments where organization_id=p_organization_id and idempotency_key=(p_input->>'idempotency_key')::uuid;
 if p.id is not null then if p.contract_id=c.id and p.request_hash=hash then return p.id;end if;raise exception 'Payment key already used' using errcode='40001';end if;
 if c.status in ('closed','cancelled') then raise exception 'Contract is not open' using errcode='22023';end if;
 amount=private.finance_decimal(p_input->>'amount');
 if amount<=0 or round(amount,c.precision)<>amount then raise exception 'Invalid payment precision' using errcode='22023';end if;
 select * into m from public.payment_methods where organization_id=p_organization_id and id=(p_input->>'method_id')::uuid and active;
 if m.id is null then raise exception 'Unavailable payment method' using errcode='42501';end if;
 if (p_input->>'payment_date')::date>(select (now() at time zone default_timezone)::date from public.organizations where id=p_organization_id) then raise exception 'Future payment date is not a received payment' using errcode='22023';end if;
 insert into public.payments(organization_id,contract_id,customer_id,project_id,payment_number,currency,payment_date,amount,method_id,method_snapshot,external_reference,notes,idempotency_key,request_hash)
 values(p_organization_id,c.id,c.customer_id,c.project_id,private.finance_number(p_organization_id,'payment','PAY'),c.currency,(p_input->>'payment_date')::date,trim_scale(amount)::text,m.id,jsonb_build_object('name',m.name,'kind',m.kind),coalesce(p_input->>'external_reference',''),coalesce(p_input->>'notes',''),(p_input->>'idempotency_key')::uuid,hash) returning id into target;
 for x in select jsonb_array_elements(coalesce(p_input->'allocations','[]')) loop perform private.finance_allocate(p_organization_id,target,x);end loop;
 select receipt_prefix into prefix from public.organization_billing_settings where organization_id=p_organization_id;
 n=private.finance_number(p_organization_id,'receipt',coalesce(prefix,'RCPT'));
 snapshot=private.finance_header(c.id)||jsonb_build_object('kind','receipt','number',n,'date',p_input->>'payment_date','total',trim_scale(amount)::text,'method',m.name,'reference',coalesce(p_input->>'external_reference',''),'notes','','terms','','unallocated',trim_scale(amount-private.payment_allocated(target))::text,'lines',coalesce((select jsonb_agg(jsonb_build_object('description',i.invoice_number,'quantity','1','unit','allocation','rate',a.amount,'amount',a.amount) order by a.created_at,a.id) from public.payment_allocations a join public.invoices i on i.id=a.invoice_id where a.payment_id=target),'[]'));
 insert into public.receipts(organization_id,contract_id,payment_id,receipt_number,document_snapshot) values(p_organization_id,c.id,target,n,snapshot) returning id into receipt;
 perform private.crm_audit(p_organization_id,'payment.recorded','payments',target);perform private.crm_audit(p_organization_id,'receipt.generated','receipts',receipt);return target;
end$$;
create function public.payment_allocate(p_organization_id uuid,p_payment_id uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.finance_require(p_organization_id,'payment.allocate');
 if exists(select 1 from public.payments p join public.contracts c on c.id=p.contract_id where p.id=p_payment_id and p.organization_id=p_organization_id and c.status in ('closed','cancelled')) then raise exception 'Closed contract' using errcode='22023';end if;
 return private.finance_allocate(p_organization_id,p_payment_id,p_input);
end$$;
create function public.payment_void(p_organization_id uuid,p_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare p public.payments;a record;r uuid;begin
 perform private.finance_require(p_organization_id,'payment.void');select * into p from public.payments where organization_id=p_organization_id and id=p_id for update;
 if p.id is null then raise exception 'Unavailable payment' using errcode='42501';end if;
 if p.status='void' then return p.id;end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 3000 or exists(select 1 from public.contracts where id=p.contract_id and status='closed') then raise exception 'Reason required; closed contracts cannot be voided' using errcode='22023';end if;
 for a in select id from public.payment_allocations where payment_id=p.id and reversed_at is null order by id for update loop
 update public.payment_allocations set reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=a.id;
 perform private.crm_audit(p_organization_id,'payment.allocation_reversed','payment_allocations',a.id);end loop;
 update public.payments set status='void',voided_at=now(),voided_by=auth.uid(),void_reason=p_reason where id=p.id;
 update public.receipts set status='void',voided_at=now(),void_reason=p_reason where payment_id=p.id returning id into r;
 perform private.crm_audit(p_organization_id,'payment.voided','payments',p.id);perform private.crm_audit(p_organization_id,'receipt.voided','receipts',r);return p.id;
end$$;
create function public.payment_request_void(p_organization_id uuid,p_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$declare r public.payment_requests;begin
 perform private.finance_require(p_organization_id,'payment_request.manage');select * into r from public.payment_requests where organization_id=p_organization_id and id=p_id for update;
 if r.id is null then raise exception 'Unavailable request' using errcode='42501';end if;
 if r.status='void' then return r.id;end if;
 if length(trim(coalesce(p_reason,''))) not between 3 and 3000 then raise exception 'Reason required' using errcode='22023';end if;
 update public.payment_requests set status='void',voided_at=now(),void_reason=p_reason where id=r.id;perform private.crm_audit(p_organization_id,'payment_request.voided','payment_requests',r.id);return r.id;
end$$;
revoke all on function public.payment_record(uuid,uuid,jsonb),public.payment_allocate(uuid,uuid,jsonb),public.payment_void(uuid,uuid,text),public.payment_request_void(uuid,uuid,text) from public,anon;
grant execute on function public.payment_record(uuid,uuid,jsonb),public.payment_allocate(uuid,uuid,jsonb),public.payment_void(uuid,uuid,text),public.payment_request_void(uuid,uuid,text) to authenticated;
commit;
