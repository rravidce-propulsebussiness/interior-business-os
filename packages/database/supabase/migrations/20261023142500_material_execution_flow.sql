-- Materials in the signed milestone sequence are references to canonical
-- material planning, not duplicate purchase orders, receiving or payment.
DO $material$
DECLARE fn text; needle text;
BEGIN
 SELECT pg_get_functiondef('public.project_quote_stage_guidance_import(uuid,uuid)'::regprocedure) INTO fn;
 needle:='f.value->>''kind'' not in (''work'',''check'',''test'',''qc'',''payment'')';
 IF position(needle in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected signed quotation stage guidance importer';
 END IF;
 fn:=replace(fn,needle,
  'f.value->>''kind'' not in (''work'',''check'',''test'',''qc'',''payment'',''material'')');
 EXECUTE fn;

 SELECT pg_get_functiondef(
  'public.project_stage_checklist_command(uuid,uuid,uuid,text,integer,text,text,text,uuid)'::regprocedure) INTO fn;
 needle:='when previous.step->>''kind''=''payment'' then true';
 IF position(needle in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected signed stage dependency guard';
 END IF;
 fn:=replace(fn,needle,needle || chr(10) ||
  '      when previous.step->>''kind''=''material'' then true');
 EXECUTE fn;

 SELECT pg_get_functiondef(
  'public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)'::regprocedure) INTO fn;
 needle:='when before.value->>''kind''=''payment'' then true';
 IF position(needle in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected mid-stage QC order protection';
 END IF;
 fn:=replace(fn,needle,needle || chr(10) ||
  '            when before.value->>''kind''=''material'' then true');
 EXECUTE fn;
END
$material$;
