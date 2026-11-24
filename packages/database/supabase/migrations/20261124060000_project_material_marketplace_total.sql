-- The project Materials register shows what each request cost, whether it
-- was bought outside (order amount) or through the marketplace (the seller
-- order total and status), so spend can be compared with the BOQ.
DO $patch$
DECLARE
  definition text := pg_get_functiondef('public.project_material_access_read(uuid,uuid)'::regprocedure);
  old_text text := $o$        'decision_note', n.decision_note
      )) FROM private.site_material_needs n$o$;
  new_text text := $n$        'decision_note', n.decision_note,
        'marketplace_total', (SELECT o.total::text FROM private.marketplace_orders o
          WHERE o.id = n.marketplace_order_id AND o.buyer_organization_id = p_org),
        'marketplace_status', (SELECT o.status FROM private.marketplace_orders o
          WHERE o.id = n.marketplace_order_id AND o.buyer_organization_id = p_org)
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
