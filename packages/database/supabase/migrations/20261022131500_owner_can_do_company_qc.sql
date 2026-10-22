-- Owner-managed QC for companies without a dedicated quality inspector.
-- Verify organization ownership through private.site_owner and project membership.
-- Preserve photos, physical visit confirmation, failure remarks and structural approvals.
ALTER TABLE private.construction_stage_qc_item_reviews
  ADD COLUMN IF NOT EXISTS self_review boolean NOT NULL DEFAULT false;

DO $migration$
DECLARE fn text;
BEGIN
  SELECT pg_get_functiondef('public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)'::regprocedure) INTO fn;
  IF position('Assign this project QC inspector before recording on-site QC' IN fn)=0 THEN
    RAISE EXCEPTION 'Unexpected QC command version';
  END IF;
  fn := replace(fn,
    'if not exists (' || chr(10) || '   select 1 from private.construction_project_roles role',
    'if not private.site_owner(p_org) and not exists (' || chr(10) || '   select 1 from private.construction_project_roles role');
  fn := replace(fn,
    'if p_decision=''passed'' and v_check.checked_by=v_actor then' || chr(10) ||
      '  raise exception ''Site check performer cannot QC-approve the same item'' using errcode=''42501'';',
    'if p_decision=''passed'' and v_check.checked_by=v_actor then' || chr(10) ||
      '  if not private.site_owner(p_org) then raise exception ''Non-owner may not QC their own site check'' using errcode=''42501''; end if;' || chr(10) ||
      '  if length(trim(coalesce(p_notes,'''')))<12 then raise exception ''Owner self-QC requires an inspection note of at least 12 characters'' using errcode=''22023''; end if;');
  fn := replace(fn,
    'decision,notes,photo_id,reviewed_by,onsite_confirmed' || chr(10),
    'decision,notes,photo_id,reviewed_by,onsite_confirmed,self_review' || chr(10));
  fn := replace(fn,
    'p_photo,v_actor,true) returning id into v_id;',
    'p_photo,v_actor,true,(v_check.checked_by=v_actor)) returning id into v_id;');
  EXECUTE fn;

  SELECT pg_get_functiondef('public.construction_stage_qc_item_read(uuid,uuid)'::regprocedure) INTO fn;
  IF position('''can_review'',exists(' IN fn)=0 THEN RAISE EXCEPTION 'Unexpected QC read version'; END IF;
  fn := replace(fn,'''can_review'',exists(','''can_review'',private.site_owner(p_org) or exists(');
  fn := replace(fn,'''has_inspector'',exists(','''is_owner'',private.site_owner(p_org),' || chr(10) ||
    '  ''has_inspector'',private.site_owner(p_org) or exists(');
  fn := replace(fn,'''reviewed_by'',r.reviewed_by,','''reviewed_by'',r.reviewed_by,''self_review'',r.self_review,');
  EXECUTE fn;
END
$migration$;
