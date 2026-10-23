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
    cross join lateral jsonb_array_elements(g.flow)
      with ordinality as step(value,position)
    where g.organization_id=p_org and g.project_id=p_project and g.stage_id=p_stage
      and step.value->>'kind'='qc'
      and (step.value->>'index')::integer=p_index
      -- A QC visit in the middle of a stage may start only when all the
      -- preceding quotation steps are actually completed/passed.
      and not exists (
        select 1 from jsonb_array_elements(g.flow)
          with ordinality as before(value,position)
        where before.position < step.position and not (
          case
            when before.value->>'kind'='work' then exists (
              select 1 from private.project_stage_activity_progress work
              where work.organization_id=p_org and work.project_id=p_project
                and work.stage_id=p_stage
                and work.activity_index=(before.value->>'index')::integer
                and work.status='completed')
            when before.value->>'kind' in ('check','test') then exists (
              select 1 from private.construction_stage_record_links link
              join private.site_checks sc on sc.id=link.check_id
                and sc.organization_id=link.organization_id
                and sc.project_id=link.project_id
              where link.organization_id=p_org and link.project_id=p_project
                and link.stage_id=p_stage and link.record_kind='check'
                and lower(trim(sc.title))=lower(trim(v_stage.inspection_topics->>(
                  before.value->>'index')::integer))
                and sc.status='passed')
            when before.value->>'kind'='qc' then (
              select review.decision='passed'
              from private.construction_stage_qc_item_reviews review
              where review.organization_id=p_org and review.project_id=p_project
                and review.stage_id=p_stage
                and review.check_index=(before.value->>'index')::integer
              order by review.reviewed_at desc,review.id desc limit 1)
            else false
          end
        )
      )
  )) then
$replacement$);
 EXECUTE fn;
END
$migration$;

-- A mid-stage QC finding is audited identically to a QC finding after stage
-- submission. Failure still triggers recheck and keeps the stage in progress.
