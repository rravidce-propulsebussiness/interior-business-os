-- Site preparation uses owner/site-engineer checks as its completion gate.
-- It does not enter the independent QC queue used for physical construction.
BEGIN;

ALTER TABLE private.construction_stage_execution
  DROP CONSTRAINT IF EXISTS construction_stage_execution_status_check;

ALTER TABLE private.construction_stage_execution
  ADD CONSTRAINT construction_stage_execution_status_check
  CHECK (status IN ('in_progress', 'on_hold', 'ready_for_qc', 'completed'));

CREATE OR REPLACE FUNCTION public.site_preparation_complete_command(
  p_org uuid,
  p_project uuid,
  p_stage uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_stage private.construction_project_stages;
  v_execution private.construction_stage_execution;
  v_total integer;
  v_completed integer;
  v_optional integer;
  v_missing_checks integer;
BEGIN
  IF NOT private.site_allowed(p_org, p_project, ARRAY['manager', 'site_engineer']) THEN
    RAISE EXCEPTION 'Project owner, site engineer or manager required' USING errcode = '42501';
  END IF;

  SELECT * INTO v_stage
    FROM private.construction_project_stages
   WHERE organization_id = p_org AND project_id = p_project AND id = p_stage;
  IF NOT FOUND OR v_stage.template_code <> 'SITE_PREP' THEN
    RAISE EXCEPTION 'Only the site marking and excavation stage can be completed without QC' USING errcode = '22023';
  END IF;

  SELECT * INTO v_execution
    FROM private.construction_stage_execution
   WHERE organization_id = p_org AND project_id = p_project AND stage_id = p_stage
   FOR UPDATE;
  IF v_execution.stage_id IS NULL OR v_execution.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Start site preparation before completing it' USING errcode = '23514';
  END IF;

  SELECT jsonb_array_length(v_stage.activities) INTO v_total;
  SELECT count(*) INTO v_completed
    FROM private.project_stage_activity_progress x
   WHERE x.organization_id = p_org AND x.project_id = p_project AND x.stage_id = p_stage
     AND x.activity_index < v_total AND x.status = 'completed';
  IF v_completed <> v_total THEN
    RAISE EXCEPTION 'Complete all % site preparation work items first (% recorded)', v_total, v_completed
      USING errcode = '23514';
  END IF;
  SELECT count(*) INTO v_optional
    FROM private.project_stage_optional_items o
   WHERE o.organization_id = p_org AND o.project_id = p_project AND o.stage_id = p_stage
     AND NOT EXISTS (
       SELECT 1 FROM private.project_stage_activity_progress x
        WHERE x.organization_id = p_org AND x.project_id = p_project AND x.stage_id = p_stage
          AND x.activity_index = o.item_index AND x.status IN ('completed', 'skipped')
     );
  IF v_optional > 0 THEN
    RAISE EXCEPTION 'Complete or skip % owner-added site preparation work items first', v_optional
      USING errcode = '23514';
  END IF;

  SELECT count(*) INTO v_missing_checks
    FROM jsonb_array_elements_text(v_stage.inspection_topics) AS required(topic_name)
   WHERE NOT EXISTS (
     SELECT 1
       FROM private.site_checks c
       JOIN private.construction_stage_record_links l
         ON l.organization_id = c.organization_id
        AND l.project_id = c.project_id
        AND l.check_id = c.id
        AND l.record_kind = 'check'
      WHERE l.organization_id = p_org AND l.project_id = p_project AND l.stage_id = p_stage
        AND lower(trim(c.title)) = lower(trim(required.topic_name))
        AND c.status = 'passed' AND c.photo_id IS NOT NULL
   );
  IF v_missing_checks > 0 THEN
    RAISE EXCEPTION 'Complete all % site checks with evidence before finishing site preparation', v_missing_checks
      USING errcode = '23514';
  END IF;

  UPDATE private.construction_stage_execution
     SET status = 'completed', field_finished_at = now(), updated_at = now(), updated_by = auth.uid()
   WHERE organization_id = p_org AND project_id = p_project AND stage_id = p_stage;
  PERFORM private.site_log(p_org, p_project, 'construction.stage.site_preparation_completed', p_stage);
  RETURN jsonb_build_object('saved', true, 'status', 'completed');
END
$function$;

REVOKE ALL ON FUNCTION public.site_preparation_complete_command(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.site_preparation_complete_command(uuid, uuid, uuid) TO authenticated;

DO $patch$
DECLARE
  definition text;
  old_guard text := $old$v_exec in ('ready_for_qc','certified')$old$;
  new_guard text := $new$v_exec in ('ready_for_qc','certified','completed')$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.project_work_item_command(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure
  ) INTO definition;
  IF definition IS NULL OR position(old_guard IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected project work-item completion guards';
  END IF;
  EXECUTE replace(definition, old_guard, new_guard);
END
$patch$;

CREATE OR REPLACE FUNCTION private.construction_stage_start_blockers(p_org uuid, p_project uuid, p_stage uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_stage private.construction_project_stages;
  v_pred record;
  v_blocks jsonb := '[]'::jsonb;
  v_status text;
BEGIN
  SELECT * INTO v_stage
    FROM private.construction_project_stages
   WHERE organization_id = p_org AND project_id = p_project AND id = p_stage;
  IF NOT FOUND THEN RETURN jsonb_build_array('Stage not found'); END IF;
  IF v_stage.template_code IN ('QUOTED_SCOPE', 'PRECONSTRUCTION', 'DESIGN', 'DESIGN_APPROVAL', 'SITE_SURVEY') THEN
    RETURN jsonb_build_array('Planning and design stages follow their existing approval workflow');
  END IF;
  IF (SELECT stage FROM private.site_state WHERE organization_id = p_org AND project_id = p_project) IS DISTINCT FROM 'execution' THEN
    v_blocks := v_blocks || jsonb_build_array('Complete the signed-agreement and design execution gate');
  END IF;
  IF NOT private.project_agreement_authorized(p_org, p_project) THEN
    v_blocks := v_blocks || jsonb_build_array('Authorized signed agreement required');
  END IF;

  FOR v_pred IN
    SELECT pred.*
      FROM private.construction_stage_dependencies dep
      JOIN private.construction_project_stages pred
        ON pred.id = dep.predecessor_id AND pred.organization_id = dep.organization_id
       AND pred.project_id = dep.project_id
     WHERE dep.organization_id = p_org AND dep.project_id = p_project AND dep.stage_id = p_stage
  LOOP
    IF v_pred.template_code IN ('QUOTED_SCOPE', 'PRECONSTRUCTION', 'DESIGN', 'DESIGN_APPROVAL', 'SITE_SURVEY') THEN
      CONTINUE;
    END IF;
    IF private.construction_stage_has_open_qc_failures(p_org, p_project, v_pred.id) THEN
      v_blocks := v_blocks || jsonb_build_array('QC corrections pending: ' || v_pred.title);
    END IF;
    SELECT status INTO v_status
      FROM private.construction_stage_execution
     WHERE organization_id = p_org AND project_id = p_project AND stage_id = v_pred.id;
    IF v_status IS DISTINCT FROM 'ready_for_qc' AND v_status IS DISTINCT FROM 'completed'
       AND NOT private.construction_stage_current(p_org, p_project, v_pred.id) THEN
      v_blocks := v_blocks || jsonb_build_array('Finish prerequisite: ' || v_pred.title);
    ELSIF v_pred.hold_point = 'structural' AND NOT private.construction_stage_current(p_org, p_project, v_pred.id) THEN
      v_blocks := v_blocks || jsonb_build_array('Structural sign-off required: ' || v_pred.title);
    END IF;
  END LOOP;
  RETURN v_blocks;
END
$function$;

COMMIT;
