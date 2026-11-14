-- Design stage sequence requested for construction projects:
-- floor plan -> structural -> electrical -> plumbing / MEP.
-- Each next drawing waits for technical approval and the recorded owner decision.
BEGIN;

CREATE OR REPLACE FUNCTION private.site_design_sequence_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  required_kind text;
  current_status text;
  owner_approved_at timestamptz;
BEGIN
  required_kind := CASE new.kind
    WHEN 'structural_design' THEN private.project_floor_plan_kind(new.organization_id, new.project_id)
    WHEN 'electrical_plan' THEN 'structural_design'
    WHEN 'plumbing_plan' THEN 'electrical_plan'
    ELSE NULL
  END;
  IF required_kind IS NULL THEN RETURN new; END IF;

  SELECT d.status, d.client_approved_at
    INTO current_status, owner_approved_at
    FROM private.site_designs d
   WHERE d.organization_id = new.organization_id
     AND d.project_id = new.project_id
     AND d.kind = required_kind
   ORDER BY d.revision DESC
   LIMIT 1;

  IF current_status IS DISTINCT FROM 'approved' OR owner_approved_at IS NULL THEN
    RAISE EXCEPTION 'The latest % must be technically approved and owner-approved before % starts',
      replace(required_kind, '_', ' '), replace(new.kind, '_', ' ')
      USING errcode = '23514';
  END IF;
  RETURN new;
END
$function$;

DO $patch$
DECLARE
  definition text;
  old_required text := $old$else array['architectural_plan','structural_design','3d_design','electrical_plan','plumbing_plan']::text[] end$old$;
  new_required text := $new$else array['architectural_plan','structural_design','electrical_plan','plumbing_plan']::text[] end$new$;
  old_review text := $old$select status from private.site_designs d$old$;
  new_review text := $new$select status,client_approved_at from private.site_designs d$new$;
  old_pending text := $old$where latest.status is distinct from 'approved'$old$;
  new_pending text := $new$where latest.status is distinct from 'approved' or latest.client_approved_at is null$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO definition;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Missing project_site_command design release gate';
  END IF;
  IF position(old_required IN definition) > 0 THEN
    definition := replace(definition, old_required, new_required);
  ELSIF position(new_required IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected construction plan sequence in project_site_command';
  END IF;
  IF position(old_review IN definition) > 0 THEN
    definition := replace(definition, old_review, new_review);
  END IF;
  IF position(old_pending IN definition) > 0 THEN
    definition := replace(definition, old_pending, new_pending);
  END IF;
  EXECUTE definition;

  SELECT pg_get_functiondef(
    'public.client_portal_design_decide(uuid,text,text,text)'::regprocedure
  ) INTO definition;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Missing client portal design release gate';
  END IF;
  IF position(old_required IN definition) > 0 THEN
    definition := replace(definition, old_required, new_required);
  ELSIF position(new_required IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected construction plan sequence in client portal';
  END IF;
  IF position(old_review IN definition) > 0 THEN
    definition := replace(definition, old_review, new_review);
  END IF;
  IF position(old_pending IN definition) > 0 THEN
    definition := replace(definition, old_pending, new_pending);
  END IF;
  EXECUTE definition;
END
$patch$;

COMMIT;
