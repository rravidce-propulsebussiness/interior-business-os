-- Issue new sales invoices directly from Save, in one transaction; expose
-- issued invoices only to the invited customer of the EXACT active project.
-- Draft invoices and supplier bills never reach the customer.
BEGIN;

CREATE FUNCTION public.gst_sales_invoice_save_and_issue(
 p_org uuid,p_input jsonb,p_customer uuid DEFAULT NULL,
 p_won_lead uuid DEFAULT NULL,p_stage_lead uuid DEFAULT NULL,
 p_revision uuid DEFAULT NULL,p_stage integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $invoice$
DECLARE saved uuid; saved_version integer;
BEGIN
 PERFORM private.finance_require(p_org,'invoice.create');
 PERFORM private.finance_require(p_org,'invoice.issue');
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR p_input->>'kind'<>'sales_invoice' THEN
   RAISE EXCEPTION 'Select a valid sales invoice' USING ERRCODE='22023';
 END IF;
 IF (p_customer IS NOT NULL)::int+(p_won_lead IS NOT NULL)::int+
    (p_stage_lead IS NOT NULL)::int>1
 THEN RAISE EXCEPTION 'Select only one invoice customer source'
    USING ERRCODE='22023'; END IF;
 IF p_stage_lead IS NOT NULL THEN
   IF p_revision IS NULL OR p_stage IS NULL THEN
     RAISE EXCEPTION 'Quotation revision and stage required' USING ERRCODE='22023';
   END IF;
   saved:=public.gst_stage_invoice_save(p_org,p_input,p_stage_lead,p_revision,p_stage);
 ELSIF p_won_lead IS NOT NULL THEN
   IF p_revision IS NOT NULL OR p_stage IS NOT NULL THEN
     RAISE EXCEPTION 'Cannot combine customer and stage billing' USING ERRCODE='22023'; END IF;
   saved:=public.gst_won_lead_invoice_save(p_org,p_input,p_won_lead);
 ELSIF nullif(p_input->>'marketplaceOrderId','') IS NOT NULL THEN
   IF p_customer IS NOT NULL OR p_revision IS NOT NULL OR p_stage IS NOT NULL
   THEN RAISE EXCEPTION 'Marketplace invoices cannot be relinked'
       USING ERRCODE='22023'; END IF;
   saved:=public.gst_document_with_template_save(p_org,p_input,NULL);
 ELSE
   IF p_revision IS NOT NULL OR p_stage IS NOT NULL THEN
     RAISE EXCEPTION 'A selected stage requires a lead' USING ERRCODE='22023'; END IF;
   saved:=public.gst_customer_invoice_save(p_org,p_input,p_customer);
 END IF;
 SELECT d.version INTO saved_version
 FROM private.gst_business_documents d WHERE d.organization_id=p_org
   AND d.id=saved AND d.kind='sales_invoice' AND d.status='draft'
 FOR UPDATE;
 IF saved_version IS NULL THEN RAISE EXCEPTION 'Invoice is not a draft'
   USING ERRCODE='23514'; END IF;
 -- Official number and frozen GST identity assigned exactly once.
 -- If issuance fails, all save/link changes rollback with it.
 PERFORM public.gst_document_finalize(p_org,saved,saved_version);
 RETURN saved;
END;
$invoice$;

CREATE FUNCTION private.client_project_invoice_allowed(p_project uuid,p_invoice uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $allowed$
 SELECT private.client_portal_accessible(p_project) AND EXISTS(
   SELECT 1 FROM public.projects p
   JOIN private.gst_business_documents d
     ON d.organization_id=p.organization_id
   WHERE p.id=p_project AND d.id=p_invoice
     AND d.kind='sales_invoice' AND d.status='issued'
     AND p.status='active' AND NOT p.is_sales_prospect
     AND NOT p.removed_from_workspace
     AND (
       EXISTS(SELECT 1 FROM private.gst_stage_invoice_links l
         WHERE l.organization_id=p.organization_id AND l.invoice_id=d.id
           AND l.project_id=p.id)
       OR (
         EXISTS(SELECT 1 FROM private.gst_customer_invoice_links l
           WHERE l.organization_id=p.organization_id AND l.invoice_id=d.id
             AND l.customer_id=p.customer_id)
         AND (SELECT count(*) FROM public.projects other
           WHERE other.organization_id=p.organization_id
             AND other.customer_id=p.customer_id AND other.status='active'
             AND NOT other.is_sales_prospect
             AND NOT other.removed_from_workspace)=1
       )
     )
 );
$allowed$;

CREATE FUNCTION public.client_portal_invoices(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
BEGIN
 IF NOT private.client_portal_accessible(p_project_id) THEN
   RAISE EXCEPTION 'Project invitation required' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'id',d.id,'number',d.number,'documentType',d.document_type,
    'date',d.document_date,'dueDate',d.due_date,
    'total',d.total,'paymentStatus','payment_requested'
  ) ORDER BY d.issued_at DESC,d.id DESC)
  FROM private.gst_business_documents d
  JOIN public.projects p ON p.organization_id=d.organization_id
    AND p.id=p_project_id
  WHERE d.kind='sales_invoice' AND d.status='issued'
    AND private.client_project_invoice_allowed(p_project_id,d.id)
 ),'[]'::jsonb);
END;
$read$;

CREATE FUNCTION public.client_portal_invoice_read(p_project_id uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
BEGIN
 IF NOT private.client_project_invoice_allowed(p_project_id,p_invoice) THEN
   RAISE EXCEPTION 'Invoice not available for this project'
     USING ERRCODE='42501'; END IF;
 RETURN (
  SELECT jsonb_build_object(
    'id',d.id,'number',d.number,'documentType',d.document_type,
    'date',d.document_date,'dueDate',d.due_date,
    'partyName',d.party_name,'partyAddress',d.party_address,
    'partyGstin',d.party_gstin,'partyState',d.party_state_code,
    'placeOfSupply',d.place_of_supply,
    'lines',d.lines,'subtotal',d.subtotal,'discount',d.discount,
    'taxable',d.taxable,'cgst',d.cgst,'sgst',d.sgst,'igst',d.igst,
    'total',d.total,'notes',d.notes,'snapshot',d.snapshot,
    'paymentStatus','payment_requested'
  ) FROM private.gst_business_documents d WHERE d.id=p_invoice
 );
END;
$read$;

REVOKE ALL ON FUNCTION
 public.gst_sales_invoice_save_and_issue(uuid,jsonb,uuid,uuid,uuid,uuid,integer),
 private.client_project_invoice_allowed(uuid,uuid),
 public.client_portal_invoices(uuid),
 public.client_portal_invoice_read(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.gst_sales_invoice_save_and_issue(uuid,jsonb,uuid,uuid,uuid,uuid,integer),
 public.client_portal_invoices(uuid),
 public.client_portal_invoice_read(uuid,uuid)
 TO authenticated;
COMMIT;
