-- When a quotation defines an order, do not allow later site work/checks to
-- be marked finished before preceding work, site tests, and specified QC pass.
-- This only guards stages carrying an explicit signed-quotation flow.
-- Existing photo, role, signature and stage-state checks remain unchanged.
DO $migration$
DECLARE fn text; needle text;
BEGIN
 SELECT pg_get_functiondef(
  'public.project_stage_checklist_command(uuid,uuid,uuid,text,integer,text,text,text,uuid)'::regprocedure
 ) INTO fn;
 needle := 'if p_kind=''work'' then';
 IF position(needle in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected stage checklist command version';
 END IF;
 fn := replace(fn,needle,$replacement$
if p_action='done' and exists (
  select 1 from private.project_stage_guidance g
  where g.organization_id=p_org and g.project_id=p_project
    and g.stage_id=p_stage and jsonb_array_length(g.flow)>0
) then
  if p_kind='check'
     and lower(trim(p_title)) is distinct from
         lower(trim(v_stage.inspection_topics->>p_index)) then
    raise exception 'Check does not match its quotation stage item' using errcode='22023';
  end if;
  if not exists (
    select 1 from private.project_stage_guidance g
    cross join lateral jsonb_array_elements(g.flow) as item(value)
    where g.organization_id=p_org and g.project_id=p_project and g.stage_id=p_stage
      and (item.value->>'index')::integer=p_index
      and (p_kind='work' and item.value->>'kind'='work'
        or p_kind='check' and item.value->>'kind' in ('check','test'))
  ) then raise exception 'This site item is not in the signed execution order' using errcode='23514';
  end if;
  if exists (
    with sequence as (
      select item.value as step,item.ordinality::integer as position
      from private.project_stage_guidance g
      cross join lateral jsonb_array_elements(g.flow) with ordinality as item(value,ordinality)
      where g.organization_id=p_org and g.project_id=p_project and g.stage_id=p_stage
    ), destination as (
      select position from sequence
      where (step->>'index')::integer=p_index
        and (p_kind='work' and step->>'kind'='work'
          or p_kind='check' and step->>'kind' in ('check','test'))
      limit 1
    )
    select 1 from sequence previous cross join destination destination
    where previous.position < destination.position and not (
      case
      when previous.step->>'kind'='work' then exists (
        select 1 from private.project_stage_activity_progress a
        where a.organization_id=p_org and a.project_id=p_project
          and a.stage_id=p_stage
          and a.activity_index=(previous.step->>'index')::integer
          and a.status='completed')
      when previous.step->>'kind' in ('check','test') then exists (
        select 1 from private.construction_stage_record_links l
        join private.site_checks ch on ch.id=l.check_id
          and ch.organization_id=l.organization_id and ch.project_id=l.project_id
        where l.organization_id=p_org and l.project_id=p_project
          and l.stage_id=p_stage and l.record_kind='check'
          and lower(trim(ch.title))=lower(trim(
            v_stage.inspection_topics->>(previous.step->>'index')::integer))
          and ch.status='passed')
      when previous.step->>'kind'='qc' then coalesce((
        select q.decision='passed'
        from private.construction_stage_qc_item_reviews q
        where q.organization_id=p_org and q.project_id=p_project
          and q.stage_id=p_stage
          and q.check_index=(previous.step->>'index')::integer
        order by q.reviewed_at desc,q.id desc limit 1),false)
      else false
      end
    )
  ) then
    raise exception 'Complete the preceding quotation work, test or QC checkpoint first'
      using errcode='23514';
  end if;
end if;
if p_kind='work' then
$replacement$);
 EXECUTE fn;
END
$migration$;
