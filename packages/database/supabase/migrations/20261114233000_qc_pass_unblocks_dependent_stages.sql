-- A structural design approval and an in-field QC pass are sufficient to
-- begin dependent physical work. The formal clearance remains independent and
-- continues to gate stage-certified payment requests and handover records.
CREATE OR REPLACE FUNCTION private.construction_stage_qc_items_passed(
  p_org uuid,
  p_project uuid,
  p_stage uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(
    (
      jsonb_array_length(s.inspection_topics) = 0
      AND s.hold_point IS DISTINCT FROM 'structural'
    ) OR (
      jsonb_array_length(s.inspection_topics) > 0
      AND NOT private.construction_stage_has_open_qc_failures(p_org, p_project, s.id)
      AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(s.inspection_topics) WITH ORDINALITY required(topic, ordinal)
      WHERE NOT EXISTS (
        SELECT 1
        FROM private.construction_stage_qc_item_reviews review
        WHERE review.organization_id = p_org
          AND review.project_id = p_project
          AND review.stage_id = s.id
          AND review.check_index = required.ordinal - 1
          AND review.decision = 'passed'
          AND NOT EXISTS (
            SELECT 1
            FROM private.construction_stage_qc_item_reviews newer
            WHERE newer.organization_id = review.organization_id
              AND newer.project_id = review.project_id
              AND newer.stage_id = review.stage_id
              AND newer.check_index = review.check_index
              AND (newer.reviewed_at, newer.id) > (review.reviewed_at, review.id)
          )
        )
      )
    ),
    false
  )
  FROM private.construction_project_stages s
  WHERE s.organization_id = p_org AND s.project_id = p_project AND s.id = p_stage
$function$;

REVOKE ALL ON FUNCTION private.construction_stage_qc_items_passed(uuid, uuid, uuid)
  FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.construction_stage_start_blockers(
  p_org uuid,
  p_project uuid,
  p_stage uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
      ON pred.id = dep.predecessor_id
     AND pred.organization_id = dep.organization_id
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
    IF NOT private.construction_stage_current(p_org, p_project, v_pred.id)
      AND v_status = 'ready_for_qc'
      AND NOT private.construction_stage_qc_items_passed(p_org, p_project, v_pred.id) THEN
      v_blocks := v_blocks || jsonb_build_array('On-site QC items pending: ' || v_pred.title);
    ELSIF v_status IS DISTINCT FROM 'ready_for_qc' AND NOT private.construction_stage_current(p_org, p_project, v_pred.id) THEN
      v_blocks := v_blocks || jsonb_build_array('Finish prerequisite: ' || v_pred.title);
    END IF;
  END LOOP;
  RETURN v_blocks;
END
$function$;
