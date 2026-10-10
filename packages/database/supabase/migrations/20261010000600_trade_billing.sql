-- Tenant-isolated B2B sales invoices and purchase-bill register.
-- GST preparation only: no IRN, e-waybill, return filing or automated compliance claims.
begin;

create table private.trade_billing_profiles (
 organization_id uuid primary key references public.organizations(id),
 business_name text not null check(length(btrim(business_name)) between 2 and 200),
 address text not null check(length(btrim(address)) between 5 and 2000),
 gstin text not null default '' check(gstin='' or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
 state_code text not null check(state_code ~ '^[0-9]{2}$'),
 invoice_prefix text not null default 'INV' check(invoice_prefix ~ '^[A-Z0-9]{2,6}$'),
 updated_at timestamptz not null default now()
);
create table private.trade_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in ('sales_invoice','purchase_bill')),
 status text not null default 'draft' check(status in ('draft','issued','void')),
 issue_date date not null, due_date date,
 reference text not null default '' check(length(reference)<=40),
 number text check(length(number)<=16),
 financial_year integer,
 issuer jsonb not null,
 receiver jsonb not null,
 place_of_supply text not null check(place_of_supply ~ '^[0-9]{2}$'),
 delivery_address text not null default '' check(length(delivery_address)<=2000),
 reverse_charge boolean not null default false,
 lines jsonb not null,
 subtotal numeric(16,2) not null check(subtotal>=0),
 cgst numeric(16,2) not null check(cgst>=0),
 sgst numeric(16,2) not null check(sgst>=0),
 igst numeric(16,2) not null check(igst>=0),
 total numeric(16,2) not null check(total>=0),
 notes text not null default '' check(length(notes)<=2000),
 issued_by uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 issued_at timestamptz,
 void_reason text,
 unique(organization_id,id)
);
create index trade_documents_lookup on private.trade_documents(organization_id,kind,created_at desc);
create unique index trade_sales_number_unique on private.trade_documents(organization_id,financial_year,number)
 where kind='sales_invoice' and number is not null;
create unique index trade_supplier_bill_unique on private.trade_documents(
 organization_id,(issuer->>'gstin'),reference,financial_year
) where kind='purchase_bill' and status<>'void' and reference<>'';
create table private.trade_sequences (
 organization_id uuid not null references public.organizations(id),
 financial_year integer not null,
 last_number integer not null check(last_number>=1 and last_number<=999999),
 primary key(organization_id,financial_year)
);
create table private.trade_payments (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 document_id uuid not null,
 amount numeric(16,2) not null check(amount>0),
 paid_on date not null,
 mode text not null check(mode in ('cash','bank','upi','cheque','other')),
 reference text not null default '' check(length(reference)<=120),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,document_id) references private.trade_documents(organization_id,id)
);
create index trade_payments_document on private.trade_payments(document_id,created_at);
do $$ declare rel text;begin
 foreach rel in array array['trade_billing_profiles','trade_documents','trade_sequences','trade_payments'] loop
  execute format('alter table private.%I enable row level security',rel);
  execute format('revoke all on private.%I from public,anon,authenticated',rel);
 end loop;
end $$;

create function private.trade_party_ok(p jsonb) returns boolean language sql immutable
set search_path='' as $fn$
 select jsonb_typeof(p)='object'
  and length(btrim(coalesce(p->>'name',''))) between 2 and 200
  and length(btrim(coalesce(p->>'address',''))) between 5 and 2000
  and coalesce(p->>'state','') ~ '^[0-9]{2}$'
  and (coalesce(p->>'gstin','')='' or coalesce(p->>'gstin','') ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$')
  and (coalesce(p->>'gstin','')='' or left(p->>'gstin',2)=p->>'state')
  and (p-array['name','address','state','gstin'])='{}'::jsonb;
$fn$;

create function public.trade_billing_profile(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.finance_require(p_org,'invoice.view');
 return (select jsonb_build_object('name',business_name,'address',address,'gstin',gstin,
  'state',state_code,'prefix',invoice_prefix)
 from private.trade_billing_profiles where organization_id=p_org);
end $fn$;

create function public.trade_billing_profile_save(p_org uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_party jsonb;v_prefix text;
begin
 perform private.finance_require(p_org,'billing.manage');
 if jsonb_typeof(p_input) is distinct from 'object'
 or octet_length(p_input::text)>4000
 or p_input-array['name','address','gstin','state','prefix']<>'{}'::jsonb
 then raise exception 'Invalid billing profile' using errcode='22023';end if;
 v_party=p_input-'prefix';
 v_prefix=btrim(coalesce(p_input->>'prefix',''));
 if not private.trade_party_ok(v_party) or v_prefix !~ '^[A-Z0-9]{2,6}$'
 then raise exception 'Invalid company GST profile' using errcode='22023';end if;
 insert into private.trade_billing_profiles(organization_id,business_name,address,gstin,state_code,invoice_prefix)
 values(p_org,v_party->>'name',v_party->>'address',coalesce(v_party->>'gstin',''),v_party->>'state',v_prefix)
 on conflict (organization_id) do update set business_name=excluded.business_name,
 address=excluded.address,gstin=excluded.gstin,state_code=excluded.state_code,
 invoice_prefix=excluded.invoice_prefix,updated_at=now();
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'trade.profile.saved','trade_billing_profile',p_org::text);
end $fn$;

-- Tax is computed with decimal arithmetic on the server. No client-supplied totals accepted.
create function public.trade_document_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_id uuid;v_doc private.trade_documents;v_kind text;v_date date;v_due date;
 v_issuer jsonb;v_receiver jsonb;v_profile private.trade_billing_profiles;
 v_lines jsonb='[]'::jsonb;v_item jsonb;v_line jsonb;
 v_qty numeric;v_rate numeric;v_gst numeric;v_taxable numeric;v_tax numeric;
 v_cgst numeric=0;v_sgst numeric=0;v_igst numeric=0;v_subtotal numeric=0;
 v_pos text;v_total numeric;v_notes text;v_reference text;v_delivery text;v_rcm boolean;
 v_interstate boolean;v_counter integer=0;v_fy integer;
begin
 perform private.finance_require(p_org,'invoice.create');
 if jsonb_typeof(p_input) is distinct from 'object'
 or octet_length(p_input::text)>20000
 or p_input-array['id','kind','issueDate','dueDate','counterparty','placeOfSupply',
   'deliveryAddress','reverseCharge','lines','notes','reference']<>'{}'::jsonb
 then raise exception 'Invalid document input' using errcode='22023';end if;
 v_kind=p_input->>'kind';
 if v_kind not in ('sales_invoice','purchase_bill') then raise exception 'Invalid bill type' using errcode='22023';end if;
 select * into v_profile from private.trade_billing_profiles where organization_id=p_org;
 if not found then raise exception 'Complete company billing settings first' using errcode='22023';end if;
 v_date=(p_input->>'issueDate')::date;
 v_due=nullif(p_input->>'dueDate','')::date;
 v_fy=extract(year from v_date)::integer;
 if extract(month from v_date)<4 then v_fy=v_fy-1;end if;
 v_pos=p_input->>'placeOfSupply';
 v_rcm=coalesce((p_input->>'reverseCharge')::boolean,false);
 v_notes=coalesce(p_input->>'notes','');
 v_reference=coalesce(p_input->>'reference','');
 v_delivery=coalesce(p_input->>'deliveryAddress','');
 if v_date is null or v_date<date '2017-07-01' or v_date>current_date+interval '30 days'
  or (v_due is not null and v_due<v_date)
  or v_pos !~ '^[0-9]{2}$'
  or length(v_notes)>2000 or length(v_reference)>40 or length(v_delivery)>2000
  or jsonb_typeof(p_input->'reverseCharge') not in ('boolean',null)
 then raise exception 'Invalid invoice dates or supply details' using errcode='22023';end if;
 v_issuer=jsonb_build_object('name',v_profile.business_name,'address',v_profile.address,
  'gstin',v_profile.gstin,'state',v_profile.state_code);
 if v_kind='purchase_bill' then
   if length(btrim(v_reference))<1 then raise exception 'Supplier bill number required' using errcode='22023';end if;
   v_receiver=v_issuer;
   v_issuer=p_input->'counterparty';
 else
   v_receiver=p_input->'counterparty';
   if v_profile.gstin='' then raise exception 'GSTIN required for issuing a tax invoice' using errcode='22023';end if;
 end if;
 if not private.trade_party_ok(v_issuer) or not private.trade_party_ok(v_receiver)
 then raise exception 'Invalid supplier or buyer details' using errcode='22023';end if;
 v_interstate=(v_issuer->>'state')<>v_pos;
 if jsonb_typeof(p_input->'lines') is distinct from 'array' or
 jsonb_array_length(p_input->'lines') not between 1 and 30
 then raise exception 'Add 1–30 invoice lines' using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(p_input->'lines') loop
   v_counter=v_counter+1;
   if jsonb_typeof(v_item) is distinct from 'object' or
      v_item-array['description','hsn','unit','quantity','rate','gstRate']<>'{}'::jsonb
   then raise exception 'Invalid invoice line fields' using errcode='22023';end if;
   v_qty=(v_item->>'quantity')::numeric;
   v_rate=(v_item->>'rate')::numeric;
   v_gst=(v_item->>'gstRate')::numeric;
   if length(btrim(coalesce(v_item->>'description',''))) not between 2 and 350
    or length(btrim(coalesce(v_item->>'hsn',''))) not between 2 and 10
    or length(btrim(coalesce(v_item->>'unit',''))) not between 1 and 20
    or v_qty is null or v_qty<=0 or v_qty>100000 or round(v_qty,3)<>v_qty
    or v_rate is null or v_rate<0 or v_rate>100000000 or round(v_rate,2)<>v_rate
    or v_gst is null or v_gst<0 or v_gst>40 or round(v_gst,2)<>v_gst
   then raise exception 'Invalid HSN, quantity, unit rate or GST rate' using errcode='22023';end if;
   v_taxable=round(v_qty*v_rate,2);
   if v_taxable>100000000000 then raise exception 'Line too large' using errcode='22023';end if;
   v_tax=round(v_taxable*v_gst/100,2);
   v_subtotal=v_subtotal+v_taxable;
   if v_interstate then v_igst=v_igst+v_tax;
   else
     -- Two rounded components; allocate last paise to SGST so totals balance.
     v_cgst=v_cgst+round(v_tax/2,2);
     v_sgst=v_sgst+v_tax-round(v_tax/2,2);
   end if;
   v_line=jsonb_build_object('description',btrim(v_item->>'description'),
     'hsn',btrim(v_item->>'hsn'),'unit',btrim(v_item->>'unit'),
     'quantity',v_qty,'rate',v_rate,'gstRate',v_gst,
     'taxable',v_taxable,'gst',v_tax,'total',v_taxable+v_tax);
   v_lines=v_lines||jsonb_build_array(v_line);
 end loop;
 v_total=v_subtotal+v_cgst+v_sgst+v_igst;
 if v_total>100000000000 then raise exception 'Document too large' using errcode='22023';end if;
 if p_input->>'id' is not null and p_input->>'id'<>'' then
   v_id=(p_input->>'id')::uuid;
   select * into v_doc from private.trade_documents
   where id=v_id and organization_id=p_org for update;
   if not found or v_doc.status<>'draft' or v_doc.kind<>v_kind
   then raise exception 'Only draft documents can be edited' using errcode='42501';end if;
   update private.trade_documents
    set issue_date=v_date,due_date=v_due,reference=v_reference,issuer=v_issuer,
    receiver=v_receiver,place_of_supply=v_pos,delivery_address=v_delivery,
    reverse_charge=v_rcm,lines=v_lines,subtotal=v_subtotal,cgst=v_cgst,
    sgst=v_sgst,igst=v_igst,total=v_total,notes=v_notes,
    financial_year=v_fy
    where id=v_id;
 else
   insert into private.trade_documents(organization_id,kind,issue_date,due_date,reference,
    issuer,receiver,place_of_supply,delivery_address,reverse_charge,lines,
    subtotal,cgst,sgst,igst,total,notes,financial_year,created_by)
   values(p_org,v_kind,v_date,v_due,v_reference,v_issuer,v_receiver,v_pos,v_delivery,
    v_rcm,v_lines,v_subtotal,v_cgst,v_sgst,v_igst,v_total,v_notes,v_fy,auth.uid())
   returning id into v_id;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'trade.document.draft_saved','trade_document',v_id::text);
 return v_id;
end $fn$;

create function public.trade_document_issue(p_org uuid,p_id uuid)
returns text language plpgsql security definer set search_path='' as $fn$
declare v_doc private.trade_documents;v_prefix text;v_seq integer;v_fy integer;v_no text;
begin
 perform private.finance_require(p_org,'invoice.issue');
 select * into v_doc from private.trade_documents where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'Document unavailable' using errcode='42501';end if;
 if v_doc.status='issued' then return v_doc.number;end if;
 if v_doc.status<>'draft' then raise exception 'Document not issuable' using errcode='42501';end if;
 if v_doc.reverse_charge and v_doc.kind='sales_invoice' then
   -- Reverse charge requires expert review; these drafts remain non-issued.
   raise exception 'Reverse-charge sales invoices require manual tax review' using errcode='22023';end if;
 if v_doc.kind='purchase_bill' and v_doc.reference='' then
   raise exception 'Supplier bill reference required' using errcode='22023';end if;
 v_fy=extract(year from v_doc.issue_date)::int;
 if extract(month from v_doc.issue_date)<4 then v_fy=v_fy-1;end if;
 if v_doc.kind='sales_invoice' then
   select invoice_prefix into v_prefix from private.trade_billing_profiles where organization_id=p_org;
   insert into private.trade_sequences(organization_id,financial_year,last_number)
   values(p_org,v_fy,1)
   on conflict(organization_id,financial_year) do update
    set last_number=private.trade_sequences.last_number+1
   returning last_number into v_seq;
   if v_seq>999999 then raise exception 'Invoice number range exhausted' using errcode='22023';end if;
   v_no=v_prefix||'-'||right(v_fy::text,2)||'-'||lpad(v_seq::text,6,'0');
 else
   v_no=null; -- supplier-issued number is stored as reference, never overwritten.
 end if;
 update private.trade_documents set status='issued',number=v_no,financial_year=v_fy,
  issued_at=now(),issued_by=auth.uid() where id=p_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'trade.document.issued','trade_document',p_id::text);
 return coalesce(v_no,v_doc.reference);
end $fn$;

create function public.trade_document_void(p_org uuid,p_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_doc private.trade_documents;
begin
 perform private.finance_require(p_org,'invoice.manage');
 if length(btrim(coalesce(p_reason,''))) not between 5 and 300 then
  raise exception 'A reason is required' using errcode='22023';end if;
 select * into v_doc from private.trade_documents where organization_id=p_org and id=p_id for update;
 if not found or v_doc.status='void' or exists(select 1 from private.trade_payments where document_id=p_id)
 then raise exception 'Cannot void paid or unavailable document' using errcode='42501';end if;
 update private.trade_documents set status='void',void_reason=btrim(p_reason) where id=p_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'trade.document.void','trade_document',p_id::text);
end $fn$;

create function public.trade_payment_record(p_org uuid,p_id uuid,p_amount numeric,
 p_date date,p_mode text,p_reference text default '')
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_doc private.trade_documents;v_paid numeric;v_id uuid;
begin
 perform private.finance_require(p_org,'payment.record');
 select * into v_doc from private.trade_documents where organization_id=p_org and id=p_id for update;
 if not found or v_doc.status<>'issued' then raise exception 'Only issued documents accept payments' using errcode='42501';end if;
 if p_amount is null or p_amount<=0 or round(p_amount,2)<>p_amount
  or p_mode not in ('cash','bank','upi','cheque','other')
  or p_date is null or p_date>current_date or p_date<v_doc.issue_date
  or length(coalesce(p_reference,''))>120
 then raise exception 'Invalid payment' using errcode='22023';end if;
 select coalesce(sum(amount),0) into v_paid from private.trade_payments
 where organization_id=p_org and document_id=p_id;
 if v_paid+p_amount>v_doc.total then raise exception 'Payment exceeds balance' using errcode='22023';end if;
 insert into private.trade_payments(organization_id,document_id,amount,paid_on,mode,reference,created_by)
 values(p_org,p_id,p_amount,p_date,p_mode,coalesce(p_reference,''),auth.uid()) returning id into v_id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'trade.payment.recorded','trade_payment',v_id::text);
 return v_id;
end $fn$;

create function public.trade_documents_list(p_org uuid,p_kind text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.finance_require(p_org,'invoice.view');
 if p_kind is not null and p_kind not in ('sales_invoice','purchase_bill')
 then raise exception 'Invalid document kind' using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from(
  select d.id,d.kind,d.status,coalesce(d.number,d.reference,'Draft') as "number",
  d.issue_date as "issueDate",d.due_date as "dueDate",
  (case when d.kind='sales_invoice' then d.receiver->>'name' else d.issuer->>'name' end) as "party",
  d.subtotal,d.cgst,d.sgst,d.igst,d.total,coalesce(sum(p.amount),0) as paid,
  d.total-coalesce(sum(p.amount),0) as balance
  from private.trade_documents d left join private.trade_payments p on p.document_id=d.id
  where d.organization_id=p_org and (p_kind is null or d.kind=p_kind)
  group by d.id order by d.created_at desc limit 100
 ) r),'[]'::jsonb);
end $fn$;

create function public.trade_document_get(p_org uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_doc private.trade_documents;v_paid numeric;v_payments jsonb;
begin
 perform private.finance_require(p_org,'invoice.view');
 select * into v_doc from private.trade_documents where organization_id=p_org and id=p_id;
 if not found then raise exception 'Document unavailable' using errcode='42501';end if;
 select coalesce(sum(amount),0),coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'amount',amount,'date',paid_on,'mode',mode,'reference',reference) order by created_at),'[]'::jsonb)
 into v_paid,v_payments from private.trade_payments where organization_id=p_org and document_id=p_id;
 return jsonb_build_object('id',v_doc.id,'kind',v_doc.kind,'status',v_doc.status,
  'issueDate',v_doc.issue_date,'dueDate',v_doc.due_date,'number',v_doc.number,
  'reference',v_doc.reference,'issuer',v_doc.issuer,'receiver',v_doc.receiver,
  'placeOfSupply',v_doc.place_of_supply,'deliveryAddress',v_doc.delivery_address,
  'reverseCharge',v_doc.reverse_charge,'lines',v_doc.lines,'subtotal',v_doc.subtotal,
  'cgst',v_doc.cgst,'sgst',v_doc.sgst,'igst',v_doc.igst,'total',v_doc.total,
  'paid',v_paid,'balance',v_doc.total-v_paid,'notes',v_doc.notes,
  'payments',v_payments,'issuedAt',v_doc.issued_at,'voidReason',v_doc.void_reason);
end $fn$;

do $$declare sig text;begin
 foreach sig in array array[
  'trade_billing_profile(uuid)','trade_billing_profile_save(uuid,jsonb)',
  'trade_document_save(uuid,jsonb)','trade_document_issue(uuid,uuid)',
  'trade_document_void(uuid,uuid,text)','trade_payment_record(uuid,uuid,numeric,date,text,text)',
  'trade_documents_list(uuid,text)','trade_document_get(uuid,uuid)'
 ] loop
  execute format('revoke all on function public.%s from public,anon',sig);
  execute format('grant execute on function public.%s to authenticated',sig);
 end loop;
end $$;
commit;
