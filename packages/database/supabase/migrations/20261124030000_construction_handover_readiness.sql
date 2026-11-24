-- Construction projects run on the stage workflow (works, site checks, QC),
-- not the older operations tasks and final inspection record, so the
-- handover gate could never open for them. A construction project is ready
-- for handover when every construction stage is finished: QC passed,
-- certified, or (site preparation) completed, with no open QC failure and no
-- open critical snag. The operations readiness path is unchanged.
CREATE OR REPLACE FUNCTION private.construction_handover_ready(org uuid, project uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
      SELECT 1 FROM private.construction_project_stages s
       WHERE s.organization_id = org AND s.project_id = project
         AND s.template_code NOT IN ('QUOTED_SCOPE', 'PRECONSTRUCTION', 'DESIGN', 'DESIGN_APPROVAL', 'SITE_SURVEY')
    )
    AND NOT EXISTS (
      SELECT 1
        FROM private.construction_project_stages s
        LEFT JOIN private.construction_stage_execution e
          ON e.organization_id = s.organization_id AND e.project_id = s.project_id AND e.stage_id = s.id
       WHERE s.organization_id = org AND s.project_id = project
         AND s.template_code NOT IN ('QUOTED_SCOPE', 'PRECONSTRUCTION', 'DESIGN', 'DESIGN_APPROVAL', 'SITE_SURVEY')
         AND (
           private.construction_stage_has_open_qc_failures(org, project, s.id)
           OR NOT (
             e.status = 'completed'
             OR private.construction_stage_current(org, project, s.id)
             OR (e.status = 'ready_for_qc' AND private.construction_stage_qc_items_passed(org, project, s.id))
           )
         )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.project_snags
       WHERE organization_id = org AND project_id = project
         AND priority = 'critical' AND status <> 'closed'
    )
$function$;

REVOKE ALL ON FUNCTION private.construction_handover_ready(uuid, uuid) FROM public, anon, authenticated;

DO $patch$
DECLARE
  definition text := pg_get_functiondef('public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure);
  old_text text := $o$coalesce((private.ops_readiness(p_organization_id,p_project_id)->>'ready')::boolean,false)=false$o$;
  new_text text := $n$not (coalesce((private.ops_readiness(p_organization_id,p_project_id)->>'ready')::boolean,false) or private.construction_handover_ready(p_organization_id,p_project_id))$n$;
BEGIN
  IF position(new_text IN definition) > 0 THEN
    RETURN;
  END IF;
  IF position(old_text IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected project_site_command handover gate';
  END IF;
  EXECUTE replace(definition, old_text, new_text);
END
$patch$;
