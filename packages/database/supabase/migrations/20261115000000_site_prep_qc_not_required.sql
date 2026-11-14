-- Stage 1 site preparation has engineer checks but no separate company QC
-- review. Those checks are validated when the stage is submitted for QC.
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
    s.template_code IN ('SITE_PREP', 'SITE_PREPARATION') OR (
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
      )
    ),
    false
  )
  FROM private.construction_project_stages s
  WHERE s.organization_id = p_org AND s.project_id = p_project AND s.id = p_stage
$function$;

REVOKE ALL ON FUNCTION private.construction_stage_qc_items_passed(uuid, uuid, uuid)
  FROM public, anon, authenticated;
