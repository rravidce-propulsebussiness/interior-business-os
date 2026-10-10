\set ON_ERROR_STOP on
begin;
create function private.gst_assert(ok boolean,label text) returns void language plpgsql as $fn$
begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;
raise notice 'PASS: %',label;end $fn$;
create function private.gst_denied(command text,label text) returns void language plpgsql as $fn$
begin
 begin execute command;
 exception when sqlstate '42501' then raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $fn$;
create function private.gst_invalid(command text,label text) returns void language plpgsql as $fn$
begin
 begin execute command;
 exception when sqlstate '22023' then raise notice 'PASS: %',label;return;
 end;
 raise exception 'FAILED: %',label;
end $fn$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.gst_profile_save('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"legalName":"Test Interiors Ltd","address":"Plot 9 Hyderabad, Telangana","stateCode":"36","gstin":"36ABCDE1234F1Z5","authorizedSignatory":"Owner"}');
select private.gst_assert(public.gst_profile_read('dddddddd-dddd-4ddd-8ddd-dddddddddddd')->>'gstin'='36ABCDE1234F1Z5',
 'tenant billing profile is saved');

select public.gst_document_save('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"kind":"sales_invoice","documentType":"tax_invoice","date":"2026-10-10","dueDate":"2026-11-10",
 "partyName":"Customer ABC","partyAddress":"Hyderabad","partyGstin":"36ABCDE1234F1Z5",
 "partyState":"36","placeOfSupply":"36","deliveryAddress":"","reverseCharge":false,"notes":"",
 "lines":[{"description":"Engineered panel","hsnSac":"4412","unit":"sheet","quantity":2,"unitPrice":1000,"discount":100,"gstRate":18}]}'
 ::jsonb) as first_invoice \gset
select private.gst_assert(
 (public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice')->>'total')::numeric=2242
 and (public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice')->>'cgst')::numeric=171
 and (public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice')->>'sgst')::numeric=171,
 'intrastate invoice calculates CGST and SGST');
select public.gst_document_finalize('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice',1);
select private.gst_assert(
 public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice')->>'status'='issued'
 and length(public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice')->>'number')<=16,
 'GST invoice issued with short financial-year number');
select private.gst_denied(
 format('select public.gst_document_finalize(%L,%L,1)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice'),
 'issued invoice cannot be issued again');
select private.gst_denied(
 format('select public.gst_document_save(%L,%L::jsonb)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"id":"' || :'first_invoice' || '","version":2,"kind":"sales_invoice","documentType":"tax_invoice","date":"2026-10-10","partyName":"Changed","partyState":"36","placeOfSupply":"36","reverseCharge":false,"lines":[{"description":"Engineered panel","hsnSac":"4412","unit":"sheet","quantity":2,"unitPrice":1000,"discount":100,"gstRate":18}]}'),
 'issued document cannot be overwritten');

select public.gst_document_save('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"kind":"sales_invoice","documentType":"tax_invoice","date":"2026-10-10",
 "partyName":"Different State","partyAddress":"Mumbai","partyState":"27","placeOfSupply":"27",
 "reverseCharge":false,"notes":"",
 "lines":[{"description":"Design service","hsnSac":"9983","unit":"service","quantity":1,"unitPrice":5000,"discount":0,"gstRate":18}]}'
 ::jsonb) as second_invoice \gset
select private.gst_assert(
 (public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'second_invoice')->>'igst')::numeric=900
 and (public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'second_invoice')->>'cgst')::numeric=0,
 'interstate service invoice calculates IGST');

select public.gst_document_save('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"kind":"purchase_bill","number":"VEND-123","documentType":"tax_invoice","date":"2026-10-09",
 "partyName":"Supplier Ltd","partyAddress":"Bengaluru","partyGstin":"29ABCDE1234F1Z5",
 "partyState":"29","placeOfSupply":"36","reverseCharge":false,"notes":"Supplier original retained",
 "lines":[{"description":"Fasteners","hsnSac":"7318","unit":"box","quantity":3,"unitPrice":100,"discount":0,"gstRate":18}]}'
 ::jsonb) as bill_id \gset
select public.gst_document_finalize('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'bill_id',1);
select private.gst_assert(
 (public.gst_document('dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'bill_id')->>'status')='recorded'
 and jsonb_array_length(public.gst_documents('dddddddd-dddd-4ddd-8ddd-dddddddddddd','purchase_bill'))=1,
 'received supplier bill is recorded');

select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select private.gst_denied(
 $$select public.gst_documents('dddddddd-dddd-4ddd-8ddd-dddddddddddd','all')$$,
 'platform admin cannot read tenant invoice lines');
select private.gst_denied(
 format('select public.gst_document(%L,%L)',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',:'first_invoice'),
 'platform admin cannot read tenant invoice document');
select private.gst_assert((public.platform_gst_summary()->>'issuedInvoices')::int>=1,
 'platform sees aggregates without tenant document contents');

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select private.gst_denied($$select * from private.gst_business_documents$$,
 'tenant cannot directly query private document table');
select private.gst_invalid(
 $$select public.gst_document_save('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '{"kind":"purchase_bill","number":"INVOICE-3","documentType":"tax_invoice","date":"2026-10-10",
 "partyName":"Invalid State","partyState":"36","placeOfSupply":"36","reverseCharge":false,
 "lines":[{"description":"Bad","hsnSac":"4412","unit":"sheet","quantity":1,"unitPrice":100,"discount":0,"gstRate":50}]}'::jsonb)$$,
 'reject invalid GST rates');
rollback;
