-- Record a homeowner's direct cash settlement with a project material supplier.
-- This is a procurement evidence marker, not a company receipt or expense.
BEGIN;

ALTER TABLE private.site_material_needs
  ADD COLUMN homeowner_paid_amount numeric(16,2),
  ADD COLUMN homeowner_paid_date date,
  ADD COLUMN homeowner_paid_by uuid REFERENCES public.profiles(id),
  ADD COLUMN homeowner_paid_to text,
  ADD COLUMN homeowner_paid_method text,
  ADD COLUMN homeowner_paid_reference text NOT NULL DEFAULT '',
  ADD COLUMN homeowner_paid_note text NOT NULL DEFAULT '',
  ADD COLUMN homeowner_paid_request_hash text,
  ADD CONSTRAINT site_material_homeowner_paid_fields_check CHECK (
    (homeowner_paid_amount IS NULL AND homeowner_paid_date IS NULL
      AND homeowner_paid_by IS NULL AND homeowner_paid_to IS NULL
      AND homeowner_paid_method IS NULL AND homeowner_paid_request_hash IS NULL)
    OR (homeowner_paid_amount > 0 AND homeowner_paid_date IS NOT NULL
      AND homeowner_paid_by IS NOT NULL
      AND length(trim(homeowner_paid_to)) BETWEEN 2 AND 200
      AND homeowner_paid_method = 'cash'
      AND homeowner_paid_request_hash IS NOT NULL)
  ),
  ADD CONSTRAINT site_material_homeowner_paid_text_check CHECK (
    length(homeowner_paid_reference) <= 200 AND length(homeowner_paid_note) <= 1500
  );

CREATE OR REPLACE FUNCTION public.project_material_homeowner_cash_paid(
  p_org uuid,
  p_project uuid,
  p_material uuid,
  p_amount numeric,
  p_paid_date date,
  p_supplier text,
  p_reference text DEFAULT '',
  p_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_material private.site_material_needs;
  v_supplier text := btrim(coalesce(p_supplier, ''));
  v_reference text := btrim(coalesce(p_reference, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_hash text;
BEGIN
  IF NOT private.project_material_can_order(p_org, p_project) THEN
    RAISE EXCEPTION 'Project owner or authorized procurement role required'
      USING errcode = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000
    OR round(p_amount, 2) <> p_amount
    OR p_paid_date IS NULL
    OR p_paid_date > (now() AT TIME ZONE 'Asia/Kolkata')::date
    OR length(v_supplier) NOT BETWEEN 2 AND 200
    OR length(v_reference) > 200
    OR length(v_note) NOT BETWEEN 3 AND 1500
  THEN
    RAISE EXCEPTION 'Enter a valid cash amount, date, supplier, and note'
      USING errcode = '22023';
  END IF;

  PERFORM 1 FROM public.projects
   WHERE organization_id = p_org AND id = p_project FOR UPDATE;
  SELECT * INTO v_material FROM private.site_material_needs
   WHERE organization_id = p_org AND project_id = p_project AND id = p_material
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project material request unavailable' USING errcode = '42501';
  END IF;
  IF v_material.status NOT IN ('ordered', 'received')
    OR v_material.source NOT IN ('outside', 'marketplace')
    OR length(trim(v_material.vendor_reference)) < 3
  THEN
    RAISE EXCEPTION 'Record supplier confirmation before marking a direct payment'
      USING errcode = '23514';
  END IF;
  IF v_material.source = 'marketplace' AND NOT EXISTS (
    SELECT 1 FROM private.marketplace_orders o
     WHERE o.id = v_material.marketplace_order_id
       AND o.buyer_organization_id = p_org AND o.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Marketplace seller must accept the order first'
      USING errcode = '23514';
  END IF;

  v_hash := md5(concat_ws('|', p_org::text, p_project::text, p_material::text,
    trim_scale(p_amount)::text, p_paid_date::text, lower(v_supplier), v_reference, v_note));
  IF v_material.homeowner_paid_amount IS NOT NULL THEN
    IF v_material.homeowner_paid_request_hash = v_hash THEN
      RETURN jsonb_build_object('saved', true, 'already_recorded', true,
        'method', 'cash', 'amount', v_material.homeowner_paid_amount::text,
        'paid_date', v_material.homeowner_paid_date::text);
    END IF;
    RAISE EXCEPTION 'A homeowner direct payment is already recorded for this material'
      USING errcode = '23505';
  END IF;

  UPDATE private.site_material_needs
     SET homeowner_paid_amount = trim_scale(p_amount),
         homeowner_paid_date = p_paid_date,
         homeowner_paid_by = auth.uid(),
         homeowner_paid_to = v_supplier,
         homeowner_paid_method = 'cash',
         homeowner_paid_reference = v_reference,
         homeowner_paid_note = v_note,
         homeowner_paid_request_hash = v_hash,
         updated_at = now()
   WHERE organization_id = p_org AND project_id = p_project AND id = p_material;
  PERFORM private.site_log(p_org, p_project, 'material.homeowner_paid_direct', p_material);
  RETURN jsonb_build_object('saved', true, 'already_recorded', false,
    'method', 'cash', 'amount', trim_scale(p_amount)::text,
    'paid_date', p_paid_date::text);
END
$fn$;

CREATE OR REPLACE FUNCTION public.project_material_access_read(p_org uuid, p_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NOT private.site_access(p_org, p_project) THEN
    RAISE EXCEPTION 'Project unavailable' USING errcode = '42501';
  END IF;
  RETURN jsonb_build_object(
    'can_order', private.project_material_can_order(p_org, p_project),
    'can_approve', private.site_allowed(p_org, p_project, ARRAY['manager','procurement']),
    'delivery', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id,
        'expected_delivery_date', n.expected_delivery_date,
        'expected_delivery_window', n.expected_delivery_window,
        'ordered_at', n.ordered_at,
        'received_at', n.received_at,
        'homeowner_paid_amount', n.homeowner_paid_amount::text,
        'homeowner_paid_date', n.homeowner_paid_date::text,
        'homeowner_paid_to', n.homeowner_paid_to,
        'homeowner_paid_method', n.homeowner_paid_method,
        'homeowner_paid_reference', n.homeowner_paid_reference,
        'homeowner_paid_note', n.homeowner_paid_note
      )) FROM private.site_material_needs n
       WHERE n.organization_id = p_org AND n.project_id = p_project
    ), '[]'::jsonb),
    'grants', CASE WHEN private.site_is_manager(p_org, p_project) THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', t.user_id, 'can_order', t.can_order_materials)
        ORDER BY t.user_id) FROM private.site_team t
       WHERE t.organization_id = p_org AND t.project_id = p_project AND t.active
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.project_material_homeowner_cash_paid(uuid,uuid,uuid,numeric,date,text,text,text)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.project_material_homeowner_cash_paid(uuid,uuid,uuid,numeric,date,text,text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.project_material_access_read(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.project_material_access_read(uuid,uuid) TO authenticated;

COMMIT;
