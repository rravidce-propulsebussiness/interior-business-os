-- Associate ordinary sales invoices with existing customers without creating
-- duplicate CRM records or changing the stage/quotation project activation flow.
CREATE TABLE private.gst_customer_invoice_links (
  invoice_id uuid PRIMARY KEY REFERENCES private.gst_business_documents(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,invoice_id)
);
CREATE INDEX gst_customer_invoice_customer_idx
  ON private.gst_customer_invoice_links(organization_id,customer_id);
ALTER TABLE private.gst_customer_invoice_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gst_customer_invoice_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.gst_customer_invoice_links FROM PUBLIC,anon,authenticated;

-- Invoice creation permission is still required to read this invoice's linked
-- customer. This RPC returns only the identifier, not private customer details.
CREATE FUNCTION public.gst_customer_invoice_context(p_org uuid,p_invoice uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM private.finance_require_read(p_org,'invoice.view');
  RETURN (
    SELECT lk.customer_id
    FROM private.gst_customer_invoice_links lk
    JOIN private.gst_business_documents doc
      ON doc.id=lk.invoice_id AND doc.organization_id=p_org
    WHERE lk.organization_id=p_org AND lk.invoice_id=p_invoice
  );
END;
$$;
REVOKE ALL ON FUNCTION public.gst_customer_invoice_context(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_customer_invoice_context(uuid,uuid) TO authenticated;

-- Save ordinary/manual sales invoices and their customer link atomically.
-- p_customer=NULL is the intentional "new/one-time customer" choice.
-- It does NOT create a client or project. GST document numbering and the
-- standard document appearance stay managed by their existing functions.
CREATE FUNCTION public.gst_customer_invoice_save(
  p_org uuid, p_input jsonb, p_customer uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  invoice_id uuid;
  existing_id uuid;
BEGIN
  PERFORM private.finance_require(p_org,'invoice.create');
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object'
     OR p_input->>'kind'<>'sales_invoice' THEN
    RAISE EXCEPTION 'A sales invoice is required' USING ERRCODE='22023';
  END IF;
  existing_id:=NULLIF(p_input->>'id','')::uuid;
  IF existing_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM private.gst_stage_invoice_links stages
    WHERE stages.invoice_id=existing_id AND stages.organization_id=p_org
  ) THEN
    RAISE EXCEPTION 'Stage invoice must remain linked to its approved quote'
      USING ERRCODE='22023';
  END IF;
  IF p_customer IS NOT NULL THEN
    IF NOT private.commercial_access(p_org,'customer.view','customers') THEN
      RAISE EXCEPTION 'Client access required' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id=p_customer AND c.organization_id=p_org
        AND c.status='active' AND c.is_sales_prospect=false
    ) THEN
      RAISE EXCEPTION 'Choose an active client from this company'
        USING ERRCODE='22023';
    END IF;
  END IF;
  invoice_id:=public.gst_document_with_template_save(p_org,p_input,NULL);
  IF p_customer IS NOT NULL THEN
    INSERT INTO private.gst_customer_invoice_links(
      invoice_id,organization_id,customer_id
    ) VALUES(invoice_id,p_org,p_customer)
    ON CONFLICT (invoice_id) DO UPDATE
    SET customer_id=excluded.customer_id,updated_at=now();
  ELSE
    DELETE FROM private.gst_customer_invoice_links
      WHERE invoice_id=invoice_id AND organization_id=p_org;
  END IF;
  RETURN invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.gst_customer_invoice_save(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_customer_invoice_save(uuid,jsonb,uuid) TO authenticated;
