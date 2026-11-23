-- Site preparation is closed by the owner/site engineer with
-- site_preparation_complete_command, which stores status 'completed'.
-- A completed site-preparation stage must release dependent foundation work
-- in the same way as a stage whose field work passed on-site QC.
DO $patch$
DECLARE
  definition text;
  old_guard text := $old$ELSIF v_status IS DISTINCT FROM 'ready_for_qc' AND NOT private.construction_stage_current(p_org, p_project, v_pred.id) THEN$old$;
  new_guard text := $new$ELSIF v_status IS DISTINCT FROM 'ready_for_qc' AND v_status IS DISTINCT FROM 'completed' AND NOT private.construction_stage_current(p_org, p_project, v_pred.id) THEN$new$;
BEGIN
  SELECT pg_get_functiondef('private.construction_stage_start_blockers(uuid,uuid,uuid)'::regprocedure)
    INTO definition;
  IF position(new_guard IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(old_guard IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected construction stage prerequisite guard';
  END IF;
  EXECUTE replace(definition, old_guard, new_guard);
END
$patch$;
