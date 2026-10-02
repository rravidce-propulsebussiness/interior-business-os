-- Optional disposable demo configuration; no fabricated customer acceptance or payments.
begin;
do $$declare org uuid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';actor uuid;begin
 select created_by into actor from public.organizations where id=org;
 if actor is null then raise exception 'Apply development user seed first';end if;
 insert into public.organization_billing_settings(organization_id,legal_name,billing_address,default_terms,payment_instructions,receipt_footer,created_by) values(org,'Demo Interiors','Demo office','Payment according to the agreed milestone schedule.','Use the payment reference when making an offline transfer.','Thank you for your payment.',actor) on conflict(organization_id) do nothing;
 insert into public.payment_methods(organization_id,name,kind,created_by) values(org,'Bank transfer','bank_transfer',actor),(org,'UPI','upi',actor),(org,'Cash','cash',actor),(org,'Cheque','cheque',actor),(org,'Offline card','card_offline',actor),(org,'Other','other',actor) on conflict(organization_id,name) do nothing;
 insert into public.tax_codes(organization_id,code,jurisdiction,components,created_by) values(org,'DEMO-INTRA-18','India - demonstration only','[{"name":"CGST","rate":"9"},{"name":"SGST","rate":"9"}]',actor),(org,'DEMO-INTER-18','India - demonstration only','[{"name":"IGST","rate":"18"}]',actor) on conflict(organization_id,code) do nothing;
end$$;
commit;
