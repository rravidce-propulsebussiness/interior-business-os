-- QC evidence remains mandatory; inspection notes are optional for both pass and fail.
DO $migration$
DECLARE
  fn text;
BEGIN
  SELECT pg_get_functiondef(
    'public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)'::regprocedure
  ) INTO fn;

  IF position('construction_stage_qc_item_command' IN fn)=0 THEN
    RAISE EXCEPTION 'Unexpected QC command version';
  END IF;

  fn := replace(fn,
    '   or (p_decision=''failed'' and length(trim(coalesce(p_notes,'''')))<10)' || chr(10),
    '');
  fn := replace(fn,
    '  if length(trim(coalesce(p_notes,'''')))<12 then raise exception ''Owner self-QC requires an inspection note of at least 12 characters'' using errcode=''22023''; end if;' || chr(10),
    '');

  IF position('Owner self-QC requires an inspection note' IN fn)>0
    OR position('p_decision=''failed'' and length(trim(coalesce(p_notes' IN fn)>0 THEN
    RAISE EXCEPTION 'QC note validation was not fully removed';
  END IF;

  EXECUTE fn;
END
$migration$;
