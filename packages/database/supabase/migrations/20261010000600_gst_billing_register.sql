-- Standalone, tenant-isolated India GST-ready sales and purchase documents.
-- This is not an e-invoice registration, IRN generator or GST return filing tool.
begin;

create table private.gst_business_profiles (
 organization_id uuid primary key references public.organizations(id),
 legal_name text not null check(length(trim(legal_name)) between 2 and 200),
 address text not null check(length(address)<=1000),
 state_code text not null check(state_code ~ '^[0-9]{2}$'),
 gstin text check(gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
 authorized_signatory text not null default '' check(length(authorized_signatory)<=150),
 updated_at timestamptz not null default now(),
 check(gstin is null or left(gstin,2)=state_code)
);

create table private.gst_business_sequences (
 organization_id uuid not null references public.organizations(id),
 financial_year text not null,
 last_number integer not null default 0,
 primary key(organization_id,financial_year)
);

create table private.gst_business_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in ('sales_invoice','purchase_bill')),
 status text not null default 'draft' check(status in ('draft','issued','recorded')),
 version integer not null default 1,
 number text,
 document_date date not null,
 due_date date,
 party_name text not null check(length(trim(party_name)) between 2 and 200),
 party_address text not null default '' check(length(party_address)<=1000),
 party_gstin text check(party_gstin is null or party_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
 party_state_code text not null check(party_state_code ~ '^[0-9]{2}$'),
 place_of_supply text not null check(place_of_supply ~ '^[0-9]{2}$'),
 delivery_address text not null default '' check(length(delivery_address)<=1000),
 reverse_charge boolean not null default false,
 document_type text not null check(document_type in ('tax_invoice','bill_of_supply','commercial_invoice')),
 notes text not null default '' check(length(notes)<=2000),
 marketplace_order_id uuid references private.marketplace_orders(id),
 counterparty_organization_id uuid references public.organizations(id),
 lines jsonb not null,
 subtotal numeric(16,2) not null,
 discount numeric(16,2) not null,
 taxable numeric(16,2) not null,
 cgst numeric(16,2) not null,
 sgst numeric(16,2) not null,
 igst numeric(16,2) not null,
 total numeric(16,2) not null,
 snapshot jsonb,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 issued_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(organization_id,kind,number),
 check(octet_length(lines::text)<=60000),
 check(snapshot is null or octet_length(snapshot::text)<=85000),
 check(marketplace_order_id is null or (kind='sales_invoice' and counterparty_organization_id is not null)),
 check(counterparty_organization_id is null or counterparty_organization_id<>organization_id)
);
create index gst_docs_owner on private.gst_business_documents(organization_id,document_date desc,id desc);
create index gst_docs_incoming on private.gst_business_documents(counterparty_organization_id,status,document_date desc);
create index gst_docs_marketplace on private.gst_business_documents(marketplace_order_id);

do $$ declare t text; begin
 foreach t in array array['gst_business_profiles','gst_business_sequences','gst_business_documents'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;
create trigger gst_profile_touch before update on private.gst_business_profiles
 for each row execute function private.touch_updated_at();
create trigger gst_document_touch before update on private.gst_business_documents
 for each row execute function private.touch_updated_at();

create function public.gst_profile_read(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.finance_require(p_org,'invoice.view');
 return coalesce((select jsonb_build_object('legalName',p.legal_name,'address',p.address,
  'stateCode',p.state_code,'gstin',p.gstin,'authorizedSignatory',p.authorized_signatory)
 from private.gst_business_profiles p where organization_id=p_org),'null'::jsonb);
end $fn$;

create function public.gst_profile_save(p_org uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_gstin text;v_state text;v_name text;v_address text;v_signatory text;
begin
 perform private.finance_require(p_org,'billing.manage');
 if jsonb_typeof(p_input) is distinct from 'object'
 or octet_length(p_input::text)>3300
 or (p_input-array['legalName','address','stateCode','gstin','authorizedSignatory'])<>'{}'::jsonb
 then raise exception 'Invalid billing profile' using errcode='22023'; end if;
 v_name=btrim(coalesce(p_input->>'legalName',''));
 v_address=btrim(coalesce(p_input->>'address',''));
 v_state=p_input->>'stateCode';
 v_gstin=nullif(upper(btrim(coalesce(p_input->>'gstin',''))),'');
 v_signatory=btrim(coalesce(p_input->>'authorizedSignatory',''));
 if length(v_name) not between 2 and 200 or length(v_address)<5 or length(v_address)>1000
  or v_state is null or v_state !~ '^[0-9]{2}$'
  or length(v_signatory)>150
  or (v_gstin is not null and (v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
       or left(v_gstin,2)<>v_state))
 then raise exception 'Invalid GST profile details' using errcode='22023';end if;
 insert into private.gst_business_profiles(organization_id,legal_name,address,state_code,gstin,authorized_signatory)
 values(p_org,v_name,v_address,v_state,v_gstin,v_signatory)
 on conflict(organization_id) do update set legal_name=excluded.legal_name,
 address=excluded.address,state_code=excluded.state_code,gstin=excluded.gstin,
 authorized_signatory=excluded.authorized_signatory;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'gst.profile.saved','gst_business_profile',p_org::text);
end $fn$;

-- Purchases can be entered without a seller linked in the marketplace.
-- Source rates and GST treatment are entered by the business and must be checked.
-- Numeric calculations use PostgreSQL numeric, not browser float arithmetic.
create function public.gst_document_save(p_org uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare d private.gst_business_documents;
 v_id uuid;v_kind text;v_type text;v_party text;v_state text;v_place text;v_gstin text;
 v_date date;v_due date;v_lines jsonb='[]'::jsonb;v_input_line jsonb;
 v_qty numeric;v_rate numeric;v_discount numeric;v_tax_rate numeric;
 v_base numeric;v_tax numeric;v_cgst numeric;v_sgst numeric;v_igst numeric;
 v_sum numeric=0;v_discounts numeric=0;v_taxable numeric=0;
 v_cgst_total numeric=0;v_sgst_total numeric=0;v_igst_total numeric=0;v_total numeric=0;
 v_supplier_state text;v_order private.marketplace_orders;v_seller private.marketplace_sellers;
 v_order_id uuid;v_buyer_org uuid;v_number text;
 v_verified_name text;v_verified_gstin text;v_verified_state text;
begin
 perform private.finance_require(p_org,'invoice.create');
 if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>65000
  or (p_input-array['id','version','kind','number','documentType','date','dueDate','partyName',
   'partyAddress','partyGstin','partyState','placeOfSupply','deliveryAddress',
   'reverseCharge','notes','lines','marketplaceOrderId'])<>'{}'::jsonb
 then raise exception 'Invalid document payload' using errcode='22023';end if;
 v_kind=p_input->>'kind';v_type=p_input->>'documentType';
 v_party=btrim(coalesce(p_input->>'partyName',''));
 v_state=p_input->>'partyState';v_place=p_input->>'placeOfSupply';
 v_gstin=nullif(upper(btrim(coalesce(p_input->>'partyGstin',''))),'');
 v_date=(p_input->>'date')::date;v_due=(p_input->>'dueDate')::date;
 v_number=nullif(btrim(coalesce(p_input->>'number','')),'');
 if v_kind not in ('sales_invoice','purchase_bill')
 or v_type not in ('tax_invoice','bill_of_supply','commercial_invoice')
 or length(v_party) not between 2 and 200 or v_state !~ '^[0-9]{2}$'
 or v_place !~ '^[0-9]{2}$' or v_date is null
 or length(coalesce(p_input->>'partyAddress',''))>1000
 or length(coalesce(p_input->>'deliveryAddress',''))>1000
 or length(coalesce(p_input->>'notes',''))>2000
 or (v_due is not null and v_due<v_date)
 or (v_gstin is not null and (v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' or left(v_gstin,2)<>v_state))
 or jsonb_typeof(p_input->'lines') is distinct from 'array'
 or jsonb_array_length(p_input->'lines') not between 1 and 50
 or (v_kind='purchase_bill' and (v_number is null or length(v_number)>40))
 then raise exception 'Incomplete document' using errcode='22023';end if;
 if jsonb_typeof(p_input->'reverseCharge') is distinct from 'boolean'
 then raise exception 'Invalid reverse charge flag' using errcode='22023';end if;
 if v_kind='sales_invoice' then
   select state_code into v_supplier_state from private.gst_business_profiles where organization_id=p_org;
 else
   v_supplier_state=v_state;
 end if;
 if v_kind='sales_invoice' and v_supplier_state is null then
  raise exception 'Complete seller billing profile before preparing invoices' using errcode='22023';end if;
 if v_kind='purchase_bill' and p_input->>'marketplaceOrderId' is not null then
  raise exception 'Only seller invoices can link a marketplace order' using errcode='22023';end if;
 if v_kind='sales_invoice' and v_number is not null then
  raise exception 'Invoice number is generated when issued' using errcode='22023';end if;
 for v_input_line in select * from jsonb_array_elements(p_input->'lines') loop
   if jsonb_typeof(v_input_line) is distinct from 'object'
    or (v_input_line-array['description','hsnSac','unit','quantity','unitPrice','discount','gstRate'])<>'{}'::jsonb
    or length(btrim(coalesce(v_input_line->>'description',''))) not between 2 and 500
    or length(btrim(coalesce(v_input_line->>'hsnSac',''))) not between 2 and 12
    or length(btrim(coalesce(v_input_line->>'unit',''))) not between 1 and 24
    then raise exception 'Invalid invoice line' using errcode='22023';end if;
   v_qty=(v_input_line->>'quantity')::numeric;
   v_rate=(v_input_line->>'unitPrice')::numeric;
   v_discount=coalesce((v_input_line->>'discount')::numeric,0);
   v_tax_rate=(v_input_line->>'gstRate')::numeric;
   if v_qty is null or v_rate is null or v_tax_rate is null
    or v_qty<=0 or v_qty>1000000 or round(v_qty,3)<>v_qty
    or v_rate<0 or v_rate>100000000 or round(v_rate,2)<>v_rate
    or v_discount<0 or round(v_discount,2)<>v_discount
    or v_tax_rate<0 or v_tax_rate>40 or round(v_tax_rate,2)<>v_tax_rate
   then raise exception 'Invalid quantity, rate or GST rate' using errcode='22023';end if;
   v_base=round(v_qty*v_rate,2);
   if v_discount>v_base then raise exception 'Discount exceeds line amount' using errcode='22023';end if;
   v_tax=round((v_base-v_discount)*v_tax_rate/100,2);
   if v_type<>'tax_invoice' and v_tax_rate<>0 then
     raise exception 'Only tax invoices may charge tax' using errcode='22023';end if;
   if v_place=v_supplier_state then
    v_cgst=round(v_tax/2,2);v_sgst=v_tax-v_cgst;v_igst=0;
   else
    v_cgst=0;v_sgst=0;v_igst=v_tax;
   end if;
   v_lines=v_lines||jsonb_build_array(jsonb_build_object(
     'description',btrim(v_input_line->>'description'),'hsnSac',btrim(v_input_line->>'hsnSac'),
     'unit',btrim(v_input_line->>'unit'),'quantity',v_qty,'unitPrice',v_rate,
     'discount',v_discount,'gstRate',v_tax_rate,'taxable',v_base-v_discount,
     'cgst',v_cgst,'sgst',v_sgst,'igst',v_igst,'total',v_base-v_discount+v_tax));
   v_sum=v_sum+v_base;v_discounts=v_discounts+v_discount;v_taxable=v_taxable+v_base-v_discount;
   v_cgst_total=v_cgst_total+v_cgst;v_sgst_total=v_sgst_total+v_sgst;
   v_igst_total=v_igst_total+v_igst;v_total=v_total+v_base-v_discount+v_tax;
 end loop;
 if v_total<=0 then raise exception 'Positive total required' using errcode='22023';end if;
 if v_kind='sales_invoice' and nullif(p_input->>'marketplaceOrderId','') is not null then
   v_order_id=(p_input->>'marketplaceOrderId')::uuid;
   select * into v_order from private.marketplace_orders where id=v_order_id and status='accepted';
   if not found then raise exception 'Accepted marketplace purchase required' using errcode='22023';end if;
   select * into v_seller from private.marketplace_sellers
    where id=v_order.seller_id and organization_id=p_org and status='approved';
   if not found or v_order.currency<>'INR' then raise exception 'Invalid marketplace seller' using errcode='42501';end if;
   if jsonb_array_length(v_lines)<>1 or (v_lines->0->>'quantity')::numeric<>v_order.quantity
      or (v_lines->0->>'unitPrice')::numeric<>v_order.unit_price then
      raise exception 'Marketplace quantity and base rate must match accepted request' using errcode='22023';end if;
   v_buyer_org=v_order.buyer_organization_id;
   -- Sales invoice is shared read-only with its verified marketplace buyer.
   if not exists(select 1 from public.organizations where id=v_buyer_org and status in ('active','trial')) then
     raise exception 'Marketplace buyer unavailable' using errcode='22023';end if;
   select coalesce(p.legal_name,o.name),p.gstin,p.state_code
   into v_verified_name,v_verified_gstin,v_verified_state
   from public.organizations o left join private.gst_business_profiles p on p.organization_id=o.id
   where o.id=v_buyer_org;
   if lower(v_party)<>lower(v_verified_name)
      or (v_verified_gstin is not null and v_gstin is distinct from v_verified_gstin)
      or (v_verified_state is not null and v_state<>v_verified_state)
   then raise exception 'Marketplace invoice buyer details do not match registered company billing identity'
     using errcode='22023';end if;
 end if;
 if nullif(p_input->>'id','') is not null then
   perform private.finance_require(p_org,'invoice.manage');
   select * into d from private.gst_business_documents where id=(p_input->>'id')::uuid and organization_id=p_org for update;
   if not found or d.status<>'draft' or d.version<>(p_input->>'version')::int or d.kind<>v_kind
   then raise exception 'Stale or unavailable draft' using errcode='42501';end if;
   v_id=d.id;
   update private.gst_business_documents set document_date=v_date,due_date=v_due,number=v_number,
     party_name=v_party,party_address=coalesce(p_input->>'partyAddress',''),party_gstin=v_gstin,
     party_state_code=v_state,place_of_supply=v_place,
     delivery_address=coalesce(p_input->>'deliveryAddress',''),
     reverse_charge=(p_input->>'reverseCharge')::boolean,document_type=v_type,
     notes=coalesce(p_input->>'notes',''),lines=v_lines,subtotal=v_sum,discount=v_discounts,
     taxable=v_taxable,cgst=v_cgst_total,sgst=v_sgst_total,igst=v_igst_total,total=v_total,
     marketplace_order_id=v_order_id,counterparty_organization_id=v_buyer_org,version=version+1 where id=v_id;
 else
   insert into private.gst_business_documents(organization_id,kind,number,document_date,due_date,
    party_name,party_address,party_gstin,party_state_code,place_of_supply,delivery_address,
    reverse_charge,document_type,notes,lines,subtotal,discount,taxable,cgst,sgst,igst,total,
    marketplace_order_id,counterparty_organization_id,created_by)
   values(p_org,v_kind,v_number,v_date,v_due,v_party,coalesce(p_input->>'partyAddress',''),
    v_gstin,v_state,v_place,coalesce(p_input->>'deliveryAddress',''),
    (p_input->>'reverseCharge')::boolean,v_type,coalesce(p_input->>'notes',''),v_lines,
    v_sum,v_discounts,v_taxable,v_cgst_total,v_sgst_total,v_igst_total,v_total,
    v_order_id,v_buyer_org,auth.uid()) returning id into v_id;
 end if;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'gst.document.saved','gst_document',v_id::text);
 return v_id;
end $fn$;

create function public.gst_document_finalize(p_org uuid,p_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare d private.gst_business_documents;p private.gst_business_profiles;
 v_fy integer;v_year text;v_num integer;v_number text;v_counterparty jsonb;
begin
 perform private.finance_require(p_org,'invoice.issue');
 select * into d from private.gst_business_documents
 where id=p_id and organization_id=p_org for update;
 if not found or d.status<>'draft' or d.version<>p_version then
  raise exception 'Draft changed or unavailable' using errcode='42501';end if;
 select * into p from private.gst_business_profiles where organization_id=p_org;
 if not found then raise exception 'Business billing profile required' using errcode='22023';end if;
 if d.document_type='tax_invoice' and d.kind='sales_invoice'
  and (p.gstin is null or length(p.authorized_signatory)<2 or length(p.address)<5)
 then raise exception 'GSTIN, address and signatory required for issuing a tax invoice' using errcode='22023';end if;
 if d.kind='sales_invoice' and d.party_gstin is null and d.taxable>=50000
  and length(btrim(d.party_address))<5 then
  raise exception 'Recipient address required for large unregistered supply' using errcode='22023';end if;
 if d.kind='purchase_bill' and d.document_type='tax_invoice'
    and d.party_gstin is null and not d.reverse_charge then
  raise exception 'Supplier GSTIN required when recording an ordinary tax invoice'
  using errcode='22023';end if;
 if d.kind='sales_invoice' then
   v_fy=extract(year from d.document_date)::integer-
     case when extract(month from d.document_date)<4 then 1 else 0 end;
   v_year=right(v_fy::text,2)||right((v_fy+1)::text,2);
   insert into private.gst_business_sequences(organization_id,financial_year,last_number)
   values(p_org,v_year,1)
   on conflict(organization_id,financial_year) do update
   set last_number=private.gst_business_sequences.last_number+1
   returning last_number into v_num;
   if v_num>99999 then raise exception 'Invoice sequence exhausted' using errcode='22023';end if;
   v_number='INV-'||v_year||'-'||lpad(v_num::text,5,'0');
 else
   v_number=d.number;
 end if;
 -- Freeze source identity, tax breakdown and line values on issue.
 update private.gst_business_documents set number=v_number,
   status=case when d.kind='sales_invoice' then 'issued' else 'recorded' end,
   issued_at=now(),
   snapshot=jsonb_build_object(
     'kind',d.kind,'documentType',d.document_type,'number',v_number,
     'date',d.document_date,'dueDate',d.due_date,
     'issuer',jsonb_build_object('name',p.legal_name,'gstin',p.gstin,'stateCode',p.state_code,
         'address',p.address,'authorizedSignatory',p.authorized_signatory),
     'party',jsonb_build_object('name',d.party_name,'gstin',d.party_gstin,'stateCode',d.party_state_code,
         'address',d.party_address),
     'placeOfSupply',d.place_of_supply,'deliveryAddress',d.delivery_address,
     'reverseCharge',d.reverse_charge,'currency','INR','lines',d.lines,
     'subtotal',d.subtotal,'discount',d.discount,'taxable',d.taxable,'cgst',d.cgst,
     'sgst',d.sgst,'igst',d.igst,'total',d.total,'notes',d.notes,
     'marketplaceOrderId',d.marketplace_order_id),
   version=version+1
 where id=d.id;
 insert into public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 values(auth.uid(),p_org,'gst.document.finalized','gst_document',p_id::text);
 return p_id;
end $fn$;

create function public.gst_documents(p_org uuid,p_kind text default 'all')
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.finance_require(p_org,'invoice.view');
 if p_kind not in ('all','sales_invoice','purchase_bill','incoming') then
   raise exception 'Invalid document kind' using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(t)) from (
   select d.id,d.organization_id as "organizationId",d.kind,d.status,d.number,
     d.document_date as "date",
     case when p_kind='incoming' then coalesce(s.legal_name,o.name)
          else d.party_name end as "partyName",
     d.total,d.version,d.cgst,d.sgst,d.igst,d.created_at as "createdAt"
   from private.gst_business_documents d
   join public.organizations o on o.id=d.organization_id
   left join private.gst_business_profiles s on s.organization_id=o.id
   where
    (p_kind<>'incoming' and d.organization_id=p_org and (p_kind='all' or d.kind=p_kind))
    or (p_kind='incoming' and d.counterparty_organization_id=p_org and d.status='issued')
   order by d.document_date desc,d.id desc limit 100
 ) t),'[]'::jsonb);
end $fn$;

create function public.gst_document(p_org uuid,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare d private.gst_business_documents;v_owner boolean;
begin
 perform private.finance_require(p_org,'invoice.view');
 select * into d from private.gst_business_documents where id=p_id
   and (organization_id=p_org or (counterparty_organization_id=p_org and status='issued'));
 if not found then raise exception 'Document unavailable' using errcode='42501';end if;
 v_owner=(d.organization_id=p_org);
 return jsonb_build_object(
   'id',d.id,'kind',d.kind,'status',d.status,'number',d.number,'date',d.document_date,
   'dueDate',d.due_date,'partyName',d.party_name,'partyAddress',d.party_address,
   'partyGstin',d.party_gstin,'partyState',d.party_state_code,'placeOfSupply',d.place_of_supply,
   'deliveryAddress',d.delivery_address,'reverseCharge',d.reverse_charge,
   'documentType',d.document_type,'notes',d.notes,'lines',d.lines,
   'subtotal',d.subtotal,'discount',d.discount,'taxable',d.taxable,
   'cgst',d.cgst,'sgst',d.sgst,'igst',d.igst,'total',d.total,'version',d.version,
   'marketplaceOrderId',d.marketplace_order_id,
   'isOwner',v_owner,'snapshot',case when d.status='draft' then null else d.snapshot end);
end $fn$;

-- Admin sees aggregate adoption only; never raw tenant billing data.
create function public.platform_gst_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
begin
 perform private.require_platform('platform.organizations.view');
 return jsonb_build_object(
 'organizations',(select count(*) from public.organizations),
 'configured',(select count(*) from private.gst_business_profiles),
 'gstRegistered',(select count(*) from private.gst_business_profiles where gstin is not null),
 'issuedInvoices',(select count(*) from private.gst_business_documents where kind='sales_invoice' and status='issued'),
 'purchaseBills',(select count(*) from private.gst_business_documents where kind='purchase_bill' and status='recorded'));
end $fn$;

revoke all on function
 public.gst_profile_read(uuid),public.gst_profile_save(uuid,jsonb),
 public.gst_document_save(uuid,jsonb),public.gst_document_finalize(uuid,uuid,integer),
 public.gst_documents(uuid,text),public.gst_document(uuid,uuid),
 public.platform_gst_summary() from public,anon;
grant execute on function
 public.gst_profile_read(uuid),public.gst_profile_save(uuid,jsonb),
 public.gst_document_save(uuid,jsonb),public.gst_document_finalize(uuid,uuid,integer),
 public.gst_documents(uuid,text),public.gst_document(uuid,uuid),
 public.platform_gst_summary() to authenticated;
commit;
