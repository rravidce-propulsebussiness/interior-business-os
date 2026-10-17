-- Billing/GST read RPCs execute as STABLE, where SELECT ... FOR UPDATE
-- is not permitted. Preserve write transaction locking in finance_require().
-- Never weaken authorization or change financial writes to solve a read failure.
--
-- New read-only permission gate uses the same tenant permission and billing
-- entitlement checks as the write gate, without a locking read.
CREATE OR REPLACE FUNCTION private.finance_require_read(org uuid, permission text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $finance_read$
BEGIN
  IF NOT private.finance_access(org, permission) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$finance_read$;

-- Only the trusted SECURITY DEFINER RPCs may use the private gate.
REVOKE ALL ON FUNCTION private.finance_require_read(uuid, text) FROM PUBLIC;

-- Full original definitions retained: only switch read-only permission
-- calls from finance_require to finance_require_read.
-- gst_document
CREATE OR REPLACE FUNCTION public.gst_document(p_org uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.gst_business_documents;v_owner boolean;
begin
 perform private.finance_require_read(p_org,'invoice.view');
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
end $function$;

-- gst_document_layout
CREATE OR REPLACE FUNCTION public.gst_document_layout(p_org uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_document private.gst_business_documents;
begin
 perform private.finance_require_read(p_org,'invoice.view');
 select * into v_document from private.gst_business_documents
 where id=p_id and (
 organization_id=p_org or (counterparty_organization_id=p_org and status='issued'));
 if not found then raise exception 'Document unavailable' using errcode='42501';end if;
 return (select jsonb_build_object('templateId',t.template_id,
 'name',t.template_name,'config',t.config) from private.gst_invoice_document_layouts t
 where t.document_id=p_id);
end $function$;

-- gst_documents
CREATE OR REPLACE FUNCTION public.gst_documents(p_org uuid, p_kind text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.finance_require_read(p_org,'invoice.view');
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
end $function$;

-- gst_filing_workpaper
CREATE OR REPLACE FUNCTION public.gst_filing_workpaper(p_org uuid, p_from date, p_to date, p_kind text DEFAULT 'sales_invoice'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_count integer; v_rows jsonb;
begin
 perform private.finance_require_read(p_org,'invoice.view');
 if p_from is null or p_to is null or p_to<p_from
    or p_to>p_from+interval '366 days'
    or p_kind not in ('sales_invoice','purchase_bill') then
    raise exception 'Choose a valid filing period and document kind' using errcode='22023';
 end if;
 select count(*) into v_count from private.gst_business_documents d
 where d.organization_id=p_org and d.kind=p_kind
 and d.status=case when p_kind='sales_invoice' then 'issued' else 'recorded' end
 and d.document_date between p_from and p_to;
 if v_count>5000 then
   raise exception 'More than 5000 documents; split the export into shorter periods' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(
   jsonb_build_object(
     'number',d.number,'kind',d.kind,'documentType',d.document_type,
     'date',d.document_date,'placeOfSupply',d.place_of_supply,
     'partyName',d.party_name,'partyGstin',d.party_gstin,'partyState',d.party_state_code,
     'supplierName',d.snapshot#>>'{issuer,name}',
     'supplierGstin',d.snapshot#>>'{issuer,gstin}',
     'reverseCharge',d.reverse_charge,
     'taxable',d.taxable,'cgst',d.cgst,'sgst',d.sgst,'igst',d.igst,
     'discount',d.discount,'total',d.total,'lines',d.lines)
   order by d.document_date,d.number,d.id),'[]'::jsonb)
 into v_rows
 from private.gst_business_documents d
 where d.organization_id=p_org and d.kind=p_kind
 and d.status=case when p_kind='sales_invoice' then 'issued' else 'recorded' end
 and d.document_date between p_from and p_to;
 return v_rows;
end $function$;

-- gst_profile_read
CREATE OR REPLACE FUNCTION public.gst_profile_read(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.finance_require_read(p_org,'invoice.view');
 return coalesce((select jsonb_build_object('legalName',p.legal_name,'address',p.address,
  'stateCode',p.state_code,'gstin',p.gstin,'authorizedSignatory',p.authorized_signatory)
 from private.gst_business_profiles p where organization_id=p_org),'null'::jsonb);
end $function$;

-- gst_standard_invoice_format
CREATE OR REPLACE FUNCTION public.gst_standard_invoice_format(p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_org is null then
   perform private.require_platform('platform.catalog.view');
 else
   perform private.finance_require_read(p_org,'invoice.view');
 end if;
 return (select jsonb_build_object('templateId',template_id,'name',name,'config',config)
         from private.gst_invoice_standard where id=true);
end $function$;

-- gst_template_list
CREATE OR REPLACE FUNCTION public.gst_template_list(p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_org is null then
   perform private.require_platform('platform.catalog.view');
 else
   perform private.finance_require_read(p_org,'invoice.view');
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',t.id,'name',t.name,'kind',t.kind,'status',t.status,'config',t.config)
   order by t.kind,t.name)
   from private.gst_invoice_templates t
   where p_org is null or t.status='active'),'[]'::jsonb);
end $function$;

-- Transactional schema checks: fail rather than silently skip a read RPC.
DO $billing_read_checks$
DECLARE
  names text[] := ARRAY['gst_document', 'gst_document_layout', 'gst_documents', 'gst_filing_workpaper', 'gst_profile_read', 'gst_standard_invoice_format', 'gst_template_list'];
  name text;
BEGIN
  FOREACH name IN ARRAY names LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname=name AND p.prokind='f'
        AND p.provolatile='s' AND p.prosecdef
        AND pg_get_functiondef(p.oid) LIKE '%perform private.finance_require_read(%'
        AND pg_get_functiondef(p.oid) NOT LIKE '%perform private.finance_require(%'
    ) THEN
      RAISE EXCEPTION 'Billing read gate not correctly installed for %', name;
    END IF;
  END LOOP;
END;
$billing_read_checks$;
