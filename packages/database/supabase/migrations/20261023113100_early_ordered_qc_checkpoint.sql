-- Allow an explicit signed-quotation QC checkpoint to be reviewed mid-stage.
-- This does not certify the stage, bypass the matching passed site check,
-- bypass onsite photo evidence or grant any extra reviewer permission.
-- Keep all previously added owner/self-review and failure-guard rules.
DO $migration$
DECLARE fn text; source_pattern text;
BEGIN
 SELECT pg_get_functiondef(
  'public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)'::regprocedure
 ) INTO fn;
 source_pattern := 'if v_existing.status is distinct from ''ready_for_qc'' then';
 IF position(source_pattern in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected QC command version; do not weaken its status guard';
 END IF;
 fn := replace(fn,source_pattern,$replacement$
if v_existing.status is distinct from 'ready_for_qc'
  and not (v_existing.status = 'in_progress' and exists (
    select 1
    from private.project_stage_guidance g
    cross join lateral jsonb_array_elements(g.flow) as step(value)
    where g.organization_id=p_org and g.project_id=p_project and g.stage_id=p_stage
      and step.value->>'kind'='qc'
      and (step.value->>'index')::integer=p_index
  )) then
$replacement$);
 EXECUTE fn;
END
$migration$;

-- A mid-stage QC finding is audited identically to a QC finding after stage
-- submission. Failure still triggers recheck and keeps the stage in progress.
