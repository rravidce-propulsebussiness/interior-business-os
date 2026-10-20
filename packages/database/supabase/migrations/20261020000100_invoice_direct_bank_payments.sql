-- Direct bank/UPI collection foundation. No gateway or auto-settlement.
begin;
create table private.invoice_bank_payees (
 organization_id uuid primary key references public.organizations(id),
 beneficiary_name text not null check(length(btrim(beneficiary_name)) between 2 and 150),
 bank_name text not null default '' check(length(bank_name)<=150),
 account_number text not null default '' check(account_number='' or account_number ~ '^[0-9]{6,25}$'),
 ifsc text not null default '' check(ifsc='' or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
 upi_id text not null default '' check(upi_id='' or upi_id ~ '^[A-Za-z0-9._-]{2,128}@[A-Za-z0-9._-]{2,64}$'),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now(),
 check(upi_id<>'' or (account_number<>'' and ifsc<>''))
);
create table private.invoice_payment_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 invoice_id uuid not null references private.gst_business_documents(id),
 amount numeric(16,2) not null check(amount>0),
 status text not null default 'open' check(status in ('open','cancelled')),
 message text not null default '' check(length(message)<=1000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 cancelled_at timestamptz,
 unique(organization_id,id)
);
create index invoice_payment_requests_by_invoice on private.invoice_payment_requests(organization_id,invoice_id,created_at desc);
create table private.invoice_payment_claims (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 request_id uuid not null,
 amount numeric(16,2) not null check(amount>0),
 utr text not null check(length(btrim(utr)) between 6 and 64),
 status text not null default 'submitted' check(status in ('submitted','verified','rejected')),
 submitted_by uuid not null references public.profiles(id),
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz,
 review_notes text not null default '' check(length(review_notes)<=1000),
 foreign key(organization_id,request_id) references private.invoice_payment_requests(organization_id,id),
 check((status='submitted' and reviewed_by is null and reviewed_at is null)
    or (status<>'submitted' and reviewed_by is not null and reviewed_at is not null))
);
create index invoice_payment_claims_by_request on private.invoice_payment_claims(organization_id,request_id,submitted_at desc);
do $$ declare t text; begin
 foreach t in array array['invoice_bank_payees','invoice_payment_requests','invoice_payment_claims'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create function public.invoice_bank_payee_read(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_read(p_org,'invoice.view');
 return coalesce((select jsonb_build_object('beneficiaryName',beneficiary_name,'bankName',bank_name,
  'accountNumber',account_number,'ifsc',ifsc,'upiId',upi_id)
 from private.invoice_bank_payees where organization_id=p_org),'null'::jsonb);
end; $$;
create function public.invoice_bank_payee_save(p_org uuid,p_name text,p_bank text,p_account text,p_ifsc text,p_upi text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.finance_require(p_org,'billing.manage');
 insert into private.invoice_bank_payees(organization_id,beneficiary_name,bank_name,account_number,ifsc,upi_id,updated_by)
 values(p_org,btrim(p_name),btrim(coalesce(p_bank,'')),btrim(coalesce(p_account,'')),
 upper(btrim(coalesce(p_ifsc,''))),btrim(coalesce(p_upi,'')),auth.uid())
 on conflict(organization_id) do update set beneficiary_name=excluded.beneficiary_name,
 bank_name=excluded.bank_name,account_number=excluded.account_number,
 ifsc=excluded.ifsc,upi_id=excluded.upi_id,updated_by=excluded.updated_by,updated_at=now();
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'invoice.bank_payee.saved','invoice_bank_payee',p_org::text);
end; $$;
create function public.invoice_payment_request_create(p_org uuid,p_invoice uuid,p_amount numeric,p_message text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_doc private.gst_business_documents;
begin
 perform private.finance_require(p_org,'payment.manage');
 select * into v_doc from private.gst_business_documents
 where organization_id=p_org and id=p_invoice and kind='sales_invoice' and status='issued' for update;
 if not found or p_amount is null or p_amount<=0 or p_amount>v_doc.total
 or length(coalesce(p_message,''))>1000 then
  raise exception 'Invalid issued invoice payment request' using errcode='22023';
 end if;
 if not exists(select 1 from private.invoice_bank_payees where organization_id=p_org) then
  raise exception 'Configure company bank details first' using errcode='22023';
 end if;
 insert into private.invoice_payment_requests(organization_id,invoice_id,amount,message,created_by)
 values(p_org,p_invoice,p_amount,coalesce(p_message,''),auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'invoice.payment_requested','invoice_payment_request',v_id::text);
 return v_id;
end; $$;
create function public.invoice_payment_request_list(p_org uuid,p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.finance_require_read(p_org,'payment.view');
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount,
 'status',r.status,'message',r.message,'createdAt',r.created_at) order by r.created_at desc)
 from private.invoice_payment_requests r where r.organization_id=p_org and r.invoice_id=p_invoice),'[]'::jsonb);
end; $$;
revoke all on function public.invoice_bank_payee_read(uuid) from public,anon;
revoke all on function public.invoice_bank_payee_save(uuid,text,text,text,text,text) from public,anon;
revoke all on function public.invoice_payment_request_create(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.invoice_payment_request_list(uuid,uuid) from public,anon;
grant execute on function public.invoice_bank_payee_read(uuid) to authenticated;
grant execute on function public.invoice_bank_payee_save(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.invoice_payment_request_create(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.invoice_payment_request_list(uuid,uuid) to authenticated;

-- A submitted UTR is only a claim. Office verification must be an explicit
-- privileged action; this RPC never checks the bank automatically.
create function public.invoice_payment_claim_submit(
 p_org uuid,p_request uuid,p_amount numeric,p_utr text
) returns uuid language plpgsql security definer set search_path='' as $
declare v_request private.invoice_payment_requests; v_id uuid;
begin
 perform private.finance_require(p_org,'payment.manage');
 select * into v_request from private.invoice_payment_requests
 where organization_id=p_org and id=p_request and status='open' for update;
 if not found or p_amount is null or p_amount<=0 or p_amount>v_request.amount
 or btrim(coalesce(p_utr,'')) !~ '^[A-Za-z0-9/-]{6,64} then
  raise exception 'Invalid payment claim' using errcode='22023';
 end if;
 insert into private.invoice_payment_claims(organization_id,request_id,amount,utr,submitted_by)
 values(p_org,p_request,p_amount,btrim(p_utr),auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'invoice.payment_claim.submitted','invoice_payment_claim',v_id::text);
 return v_id;
end; $;
create function public.invoice_payment_claim_review(
 p_org uuid,p_claim uuid,p_approve boolean,p_bank_credit_confirmed boolean,p_notes text default ''
) returns void language plpgsql security definer set search_path='' as $
declare v_claim private.invoice_payment_claims;
begin
 perform private.finance_require(p_org,'payment.manage');
 select * into v_claim from private.invoice_payment_claims
 where organization_id=p_org and id=p_claim and status='submitted' for update;
 if not found then raise exception 'Claim unavailable or already reviewed' using errcode='22023'; end if;
 if p_approve is null or (p_approve and p_bank_credit_confirmed is distinct from true)
 or length(coalesce(p_notes,''))>1000 then
  raise exception 'Explicit bank credit confirmation required' using errcode='22023';
 end if;
 update private.invoice_payment_claims set
 status=case when p_approve then 'verified' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=now(),review_notes=coalesce(p_notes,'')
 where id=p_claim and organization_id=p_org;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,case when p_approve then 'invoice.payment_claim.verified'
 else 'invoice.payment_claim.rejected' end,'invoice_payment_claim',p_claim::text);
end; $;
create function public.invoice_payment_claim_list(p_org uuid,p_invoice uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $
begin
 perform private.finance_require_read(p_org,'payment.view');
 return coalesce((select jsonb_agg(jsonb_build_object(
 'id',c.id,'requestId',c.request_id,'amount',c.amount,'utr',c.utr,
 'status',c.status,'submittedAt',c.submitted_at,'reviewedAt',c.reviewed_at)
 order by c.submitted_at desc)
 from private.invoice_payment_claims c
 join private.invoice_payment_requests r on r.id=c.request_id and r.organization_id=c.organization_id
 where c.organization_id=p_org and r.invoice_id=p_invoice),'[]'::jsonb);
end; $;
revoke all on function public.invoice_payment_claim_submit(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.invoice_payment_claim_review(uuid,uuid,boolean,boolean,text) from public,anon;
revoke all on function public.invoice_payment_claim_list(uuid,uuid) from public,anon;
grant execute on function public.invoice_payment_claim_submit(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.invoice_payment_claim_review(uuid,uuid,boolean,boolean,text) to authenticated;
grant execute on function public.invoice_payment_claim_list(uuid,uuid) to authenticated;
commit;
