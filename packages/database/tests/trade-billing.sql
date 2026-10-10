\set ON_ERROR_STOP on
begin;
create function private.trade_assert(ok boolean,label text) returns void language plpgsql as $fn$
begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;raise notice 'PASS: %',label;end $fn$;
create function private.trade_denied(cmd text,label text,code text default '42501')
returns void language plpgsql as $fn$
begin
 begin execute cmd;exception when others then
 if sqlstate=code then raise notice 'PASS: %',label;return;end if;
 raise;end;
 raise exception 'FAILED: %',label;
end $fn$;

-- Existing demo organization Owner (from development seed) has Billing permissions.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.trade_billing_profile_save(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"name":"Example Construction Seller","address":"12 Road, Hyderabad, Telangana","gstin":"36ABCDE1234F1Z5","state":"36","prefix":"INV"}'::jsonb
);
select private.trade_assert(
 public.trade_billing_profile('dddddddd-dddd-4ddd-8ddd-dddddddddddd')->>'state'='36',
 'business GST configuration saved');

select public.trade_document_save(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 jsonb_build_object('kind','sales_invoice','issueDate',current_date::text,'dueDate','',
   'counterparty',jsonb_build_object('name','Buyer Store','address','Bangalore, Karnataka 560001',
      'gstin','29ABCDE1234F1Z5','state','29'),
   'placeOfSupply','29','deliveryAddress','','reverseCharge',false,'reference','','notes','PO 111',
   'lines',jsonb_build_array(jsonb_build_object(
    'description','Premium plywood sheets','hsn','4412','unit','sheet',
    'quantity',2,'rate',1000,'gstRate',18)))
) as sale_id \gset
select private.trade_assert(
 (public.trade_document_get('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id')->>'igst')::numeric=360
 and (public.trade_document_get('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id')->>'total')::numeric=2360,
 'inter-state server GST calculation is correct');
select public.trade_document_issue('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id') as issued_no \gset
select private.trade_assert(
 length(:'issued_no')<=16 and :'issued_no' ~ '^INV-[0-9]{2}-[0-9]{6}$',
 'issued serial is GST-length compliant');
select private.trade_assert(
 public.trade_document_issue('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id')=:'issued_no',
 'invoice issuance is idempotent');
select private.trade_denied(
 format('select public.trade_document_save(%L::uuid,%L::jsonb)','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 jsonb_build_object('id',:'sale_id','kind','sales_invoice','issueDate',current_date::text,
  'counterparty',jsonb_build_object('name','Any Buyer','address','Bengaluru Karnataka',
    'gstin','29ABCDE1234F1Z5','state','29'),'placeOfSupply','29',
  'lines',jsonb_build_array(jsonb_build_object('description','Steel plates','hsn','7208',
   'unit','piece','quantity',1,'rate',1000,'gstRate',18)))::text),
 'issued document cannot be edited');

select public.trade_payment_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id',800,current_date,'bank','UTR123') as pay_id \gset
select private.trade_assert(
 (public.trade_document_get('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id')->>'balance')::numeric=1560,
 'payment updates outstanding balance');
select private.trade_denied(
 format('select public.trade_payment_record(%L::uuid,%L::uuid,2000,current_date,%L,%L)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id','bank','DOUBLE'),
 'overpayment is rejected','22023');
select private.trade_denied(
 format('select public.trade_document_void(%L::uuid,%L::uuid,%L)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id','Cancelled'),
 'paid invoice cannot be voided');

-- Intra-state new draft splits into CGST/SGST.
select public.trade_document_save(
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 jsonb_build_object('kind','sales_invoice','issueDate',current_date::text,
   'counterparty',jsonb_build_object('name','Local Buyer','address','Hyderabad 500001',
      'gstin','','state','36'),'placeOfSupply','36',
   'lines',jsonb_build_array(jsonb_build_object(
    'description','Tile materials','hsn','6907','unit','box',
    'quantity',1,'rate',1000,'gstRate',18)))
) as local_id \gset
select private.trade_assert(
 (public.trade_document_get('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'local_id')->>'cgst')::numeric=90
 and (public.trade_document_get('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'local_id')->>'sgst')::numeric=90,
 'intra-state CGST SGST calculation');
select public.trade_document_issue('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'local_id') as local_no \gset
select private.trade_assert(:'local_no'<>:'issued_no','financial year series increments');
-- Company privacy is enforced on every read.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select private.trade_denied(
 format('select public.trade_document_get(%L::uuid,%L::uuid)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'sale_id'),
 'unauthorized employee cannot access invoice');

-- Platform admins cannot read tenant invoices by default.
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select private.trade_denied(
 format('select public.trade_documents_list(%L::uuid)','dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
 'platform access does not grant private invoice access');

-- Second tenant provisioned by verified owner (sales user) can record supplier bill.
select public.platform_company_create(
 '{"name":"Separate Purchaser","slug":"trade-billing-buyer","ownerEmail":"sales@example.test",
 "country":"IN","currency":"INR","timezone":"Asia/Kolkata","industries":["interior"],"seller":false}'
) as buyer \gset
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.trade_billing_profile_save(
 (:'buyer'::jsonb->>'organizationId')::uuid,
 '{"name":"Separate Purchaser","address":"18 Street, Bengaluru, Karnataka","gstin":"29ABCDE1234F1Z5","state":"29","prefix":"BUY"}'::jsonb
);
select public.trade_document_save(
 (:'buyer'::jsonb->>'organizationId')::uuid,
 jsonb_build_object('kind','purchase_bill','issueDate',current_date::text,
   'reference','SUP-2026-77',
   'counterparty',jsonb_build_object('name','Example Seller','address','Hyderabad, Telangana',
      'gstin','36ABCDE1234F1Z5','state','36'),
   'placeOfSupply','29','lines',jsonb_build_array(jsonb_build_object(
      'description','Hardware supplies','hsn','8302','unit','piece',
      'quantity',2,'rate',500,'gstRate',18)))
) as bill_id \gset
select public.trade_document_issue((:'buyer'::jsonb->>'organizationId')::uuid,:'bill_id');
select private.trade_assert(
 (public.trade_document_get((:'buyer'::jsonb->>'organizationId')::uuid,:'bill_id')->>'reference')='SUP-2026-77',
 'supplier original bill number preserved');
select private.trade_denied(
 format('select public.trade_document_get(%L::uuid,%L::uuid)',
 (:'buyer'::jsonb->>'organizationId'),:'sale_id'),
 'buyer cannot read seller company invoice');
select private.trade_denied(
 format('select public.trade_document_save(%L::uuid,%L::jsonb)',
 (:'buyer'::jsonb->>'organizationId'),
 jsonb_build_object('kind','purchase_bill','issueDate',current_date::text,'reference','SUP-2026-77',
  'counterparty',jsonb_build_object('name','Example Seller','address','Hyderabad, Telangana',
   'gstin','36ABCDE1234F1Z5','state','36'),
  'placeOfSupply','29','lines',jsonb_build_array(jsonb_build_object(
   'description','Hardware supplies','hsn','8302','unit','piece',
   'quantity',1,'rate',1000,'gstRate',18)))::text),
 'duplicate supplier purchase bill blocked when issued','23505');
rollback;
