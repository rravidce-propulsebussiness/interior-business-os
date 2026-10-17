-- Final quotation is a CUSTOMER-LEVEL presentation decision, independent of
-- immutable quotation revision statuses and project records.
-- Default: newest active quotation. Explicit selection lasts until a newer
-- quotation is created, after which the latest becomes Final automatically.
CREATE TABLE private.quotation_final_selections (
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE RESTRICT,
  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by uuid NOT NULL,
  PRIMARY KEY(organization_id,customer_id),
  FOREIGN KEY(organization_id,customer_id)
    REFERENCES public.customers(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX quotation_final_selections_quote_idx
  ON private.quotation_final_selections(quotation_id);
ALTER TABLE private.quotation_final_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.quotation_final_selections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.quotation_final_selections FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.quotation_final_choices(
  p_org uuid, p_customer_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  IF NOT COALESCE(private.has_permission(p_org,'quotation.view'),false) THEN
    RAISE EXCEPTION 'Not authorized to view quotations' USING ERRCODE='42501';
  END IF;
  IF p_customer_ids IS NULL OR COALESCE(array_length(p_customer_ids,1),0)>100 THEN
    RAISE EXCEPTION 'Invalid customer selection' USING ERRCODE='22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(c.id::text,
      COALESCE(CASE WHEN pinned.id IS NOT NULL
                         AND sel.selected_at>=newest.created_at
                    THEN pinned.id END, newest.id)::text)
    FROM public.customers c
    JOIN LATERAL (
      SELECT q.id,q.created_at
      FROM public.quotations q
      WHERE q.organization_id=p_org AND q.customer_id=c.id
        AND q.status IN ('draft','issued')
      ORDER BY q.created_at DESC,q.id DESC
      LIMIT 1
    ) newest ON true
    LEFT JOIN private.quotation_final_selections sel
      ON sel.organization_id=p_org AND sel.customer_id=c.id
    LEFT JOIN public.quotations pinned
      ON pinned.organization_id=p_org AND pinned.id=sel.quotation_id
      AND pinned.customer_id=c.id AND pinned.status IN ('draft','issued')
    WHERE c.organization_id=p_org AND c.id=ANY(p_customer_ids)
  ),'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.quotation_final_choices(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quotation_final_choices(uuid,uuid[]) TO authenticated;

CREATE FUNCTION public.quotation_mark_final(
  p_org uuid, p_quotation uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_quote public.quotations%ROWTYPE;
BEGIN
  IF NOT COALESCE(private.has_permission(p_org,'quotation.edit'),false) THEN
    RAISE EXCEPTION 'Not authorized to select final quotation' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_quote FROM public.quotations q
  WHERE q.organization_id=p_org AND q.id=p_quotation
    AND q.status IN ('draft','issued') FOR UPDATE;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Select an active quotation from this company' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.quotation_final_selections(
    organization_id,customer_id,quotation_id,selected_at,selected_by
  ) VALUES(p_org,v_quote.customer_id,v_quote.id,now(),auth.uid())
  ON CONFLICT(organization_id,customer_id) DO UPDATE
    SET quotation_id=excluded.quotation_id,
        selected_at=excluded.selected_at,selected_by=excluded.selected_by;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.quotation_mark_final(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quotation_mark_final(uuid,uuid) TO authenticated;
