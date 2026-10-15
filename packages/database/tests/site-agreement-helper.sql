-- Temp fixture function: executed only in disposable transaction by Demo owner.
create function pg_temp.site_signed_agreement(org uuid,project uuid,existing_media uuid default null)
returns uuid language plpgsql as $$
declare contract uuid;revision uuid;schedule uuid;media uuid;
begin
 select qr.id into revision from public.quotation_revisions qr
   join public.quotations q on q.id=qr.quotation_id
   where qr.organization_id=org and qr.project_id=project
     and q.quotation_number='SITE-AGREEMENT-TEST';
 contract=public.contract_create(org,revision);
 media=coalesce(existing_media,public.project_site_media_put(org,project,'agreement','signed-agreement.pdf',
   'application/pdf',encode(convert_to('%PDF-1.7'||chr(10)||
       'Demo fixture only; not a verified electronic signature','UTF8'),'base64'),
   'Staff-uploaded signed agreement fixture'));
 perform public.project_agreement_command(org,project,contract,'record_signed_pdf',
   jsonb_build_object('media_id',media,'note',
    'Received paper agreement copy, signatures unverified by digital provider'));
 perform public.contract_transition(org,contract,1,'active');
 schedule=public.payment_schedule_save(org,contract,
   '{"label":"Contractual sample","items":[{"label":"Final stage","calculation_type":"remaining","value":"0"}]}'::jsonb);
 perform public.payment_schedule_activate(org,schedule,1);
 return contract;
end$$;

-- Real recorded advance fixture. Agreement evidence alone cannot open physical work.
create function pg_temp.site_record_advance(org uuid,contract uuid)
returns uuid language plpgsql as $$
declare method uuid;payment uuid;
begin
 select id into method from public.payment_methods
 where organization_id=org and kind='bank_transfer' limit 1;
 if method is null then raise exception 'Demo bank transfer method missing';end if;
 payment=public.payment_record(org,contract,jsonb_build_object(
   'idempotency_key',gen_random_uuid(),
   'payment_date',current_date,'amount','100','method_id',method));
 return payment;
end$$;
