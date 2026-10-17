-- An invoice creator needs an existing-client picker even when the CRM
-- directory permission/module is not included in their billing role.
-- This is a tenant-filtered billing read, not a general CRM data endpoint.
CREATE FUNCTION public.gst_invoice_customer_options(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM private.finance_require_read(p_org,'invoice.create');
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(t)) FROM (
      SELECT c.id,c.display_name,c.legal_name,c.phone,c.email,
             c.tax_identifier,c.billing_address
      FROM public.customers c
      WHERE c.organization_id=p_org AND c.status='active'
        AND c.is_sales_prospect=false
      ORDER BY c.display_name,c.id
      LIMIT 1000
    ) AS t
  ),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.gst_invoice_customer_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_invoice_customer_options(uuid) TO authenticated;

-- The ordinary sales-invoice customer link uses the same invoice.create
-- permission as the customer picker. Strict tenant + active client validation
-- remains enforced in the database, and stage invoices cannot be relinked.
CREATE OR REPLACE FUNCTION public.gst_customer_invoice_save(
  p_org uuid, p_input jsonb, p_customer uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  saved_id uuid;
  existing_id uuid;
BEGIN
  PERFORM private.finance_require(p_org,'invoice.create');
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR p_input->>'kind'<>'sales_invoice' THEN
    RAISE EXCEPTION 'A sales invoice is required' USING ERRCODE='22023';
  END IF;
  existing_id:=NULLIF(p_input->>'id','')::uuid;
  IF existing_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM private.gst_stage_invoice_links s
    WHERE s.invoice_id=existing_id AND s.organization_id=p_org
  ) THEN
    RAISE EXCEPTION 'Stage invoice must remain linked to its approved quote'
      USING ERRCODE='22023';
  END IF;
  IF p_customer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id=p_customer AND c.organization_id=p_org
      AND c.status='active' AND c.is_sales_prospect=false
  ) THEN
    RAISE EXCEPTION 'Choose an active client from this company'
      USING ERRCODE='22023';
  END IF;
  saved_id:=public.gst_document_with_template_save(p_org,p_input,NULL);
  IF p_customer IS NOT NULL THEN
    INSERT INTO private.gst_customer_invoice_links (
      invoice_id,organization_id,customer_id
    ) VALUES (saved_id,p_org,p_customer)
    ON CONFLICT (invoice_id) DO UPDATE SET
      customer_id=excluded.customer_id,updated_at=now();
  ELSE
    DELETE FROM private.gst_customer_invoice_links lk
    WHERE lk.invoice_id=saved_id AND lk.organization_id=p_org;
  END IF;
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.gst_customer_invoice_save(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_customer_invoice_save(uuid,jsonb,uuid) TO authenticated;
