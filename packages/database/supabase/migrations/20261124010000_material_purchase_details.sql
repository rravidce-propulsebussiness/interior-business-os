-- Material requests record what the purchase cost, how much actually
-- arrived and why a request was rejected, so procurement can be compared
-- with the BOQ. Existing order, receipt and approval commands are unchanged.

ALTER TABLE private.site_material_needs
  ADD COLUMN IF NOT EXISTS order_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS received_quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS decision_note text;

ALTER TABLE private.site_material_needs
  DROP CONSTRAINT IF EXISTS site_material_needs_purchase_details_check;
ALTER TABLE private.site_material_needs
  ADD CONSTRAINT site_material_needs_purchase_details_check CHECK (
    (order_amount IS NULL OR order_amount BETWEEN 0 AND 100000000)
    AND (received_quantity IS NULL OR received_quantity > 0)
    AND (decision_note IS NULL OR length(decision_note) BETWEEN 3 AND 1000)
  );

CREATE OR REPLACE FUNCTION public.project_material_details_set(
  p_org uuid,
  p_project uuid,
  p_material uuid,
  p_order_amount numeric DEFAULT NULL,
  p_received_quantity numeric DEFAULT NULL,
  p_decision_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_item private.site_material_needs;
  v_note text := nullif(trim(coalesce(p_decision_note, '')), '');
BEGIN
  IF NOT private.site_access(p_org, p_project)
     OR NOT (private.site_allowed(p_org, p_project, ARRAY['manager', 'site_engineer', 'procurement'])
             OR private.project_material_can_order(p_org, p_project)) THEN
    RAISE EXCEPTION 'Material permission required' USING errcode = '42501';
  END IF;
  SELECT * INTO v_item FROM private.site_material_needs
   WHERE organization_id = p_org AND project_id = p_project AND id = p_material
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material request not found' USING errcode = '22023';
  END IF;
  IF p_order_amount IS NOT NULL AND v_item.status NOT IN ('ordered', 'received') THEN
    RAISE EXCEPTION 'Order amount is recorded after ordering' USING errcode = '23514';
  END IF;
  IF p_received_quantity IS NOT NULL AND v_item.status <> 'received' THEN
    RAISE EXCEPTION 'Received quantity is recorded after receipt' USING errcode = '23514';
  END IF;
  IF v_note IS NOT NULL AND v_item.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision note follows an approval decision' USING errcode = '23514';
  END IF;
  UPDATE private.site_material_needs
     SET order_amount = coalesce(p_order_amount, order_amount),
         received_quantity = coalesce(p_received_quantity, received_quantity),
         decision_note = coalesce(v_note, decision_note),
         updated_at = now()
   WHERE id = v_item.id;
  PERFORM private.site_log(p_org, p_project, 'material.details_recorded', p_material);
  RETURN jsonb_build_object('saved', true);
END
$function$;

REVOKE ALL ON FUNCTION public.project_material_details_set(uuid, uuid, uuid, numeric, numeric, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.project_material_details_set(uuid, uuid, uuid, numeric, numeric, text) TO authenticated;

DO $patch$
DECLARE
  definition text := pg_get_functiondef('public.project_material_access_read(uuid,uuid)'::regprocedure);
  old_text text := $o$        'homeowner_paid_note', n.homeowner_paid_note
      )) FROM private.site_material_needs n$o$;
  new_text text := $n$        'homeowner_paid_note', n.homeowner_paid_note,
        'order_amount', n.order_amount::text,
        'received_quantity', n.received_quantity::text,
        'decision_note', n.decision_note
      )) FROM private.site_material_needs n$n$;
BEGIN
  IF position(new_text IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(old_text IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected project_material_access_read definition';
  END IF;
  EXECUTE replace(definition, old_text, new_text);
END
$patch$;
