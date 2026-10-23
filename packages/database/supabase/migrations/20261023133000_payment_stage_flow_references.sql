-- Extend quote-driven execution order with display-only Finance milestones.
-- Payment is a pointer to an already agreed payment-schedule row; never a
-- second invoice/receipt and never an approval or new construction gate.
-- The existing advance gate and stage certification remain fully enforced.
DO $payment_flow$
DECLARE
 fn text;
 before_pattern text;
BEGIN
 SELECT pg_get_functiondef(
  'public.project_quote_stage_guidance_import(uuid,uuid)'::regprocedure
 ) INTO fn;
 before_pattern := 'f.value->>''kind'' not in (''work'',''check'',''test'',''qc'')';
 IF position(before_pattern in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected quote importer validation; cannot enable payment flow';
 END IF;
 fn:=replace(fn,before_pattern,
  'f.value->>''kind'' not in (''work'',''check'',''test'',''qc'',''payment'')');
 EXECUTE fn;

 SELECT pg_get_functiondef(
  'public.project_stage_checklist_command(uuid,uuid,uuid,text,integer,text,text,text,uuid)'::regprocedure
 ) INTO fn;
 before_pattern := 'when previous.step->>''kind''=''qc'' then coalesce((';
 IF position(before_pattern in fn)=0 OR
    position('else false' in substring(fn from position(before_pattern in fn)))=0 THEN
  RAISE EXCEPTION 'Unexpected stage dependency function';
 END IF;
 -- A payment milestone remains informational in the timeline. Payment
 -- collection is handled by Finance and existing signed-agreement gates.
 fn:=replace(fn,'      else false' || chr(10) || '      end',
                 '      when previous.step->>''kind''=''payment'' then true' || chr(10) ||
                 '      else false' || chr(10) || '      end');
 IF position('when previous.step->>''kind''=''payment'' then true' in fn)=0 THEN
  RAISE EXCEPTION 'Payment stage display must not block canonical site checklist';
 END IF;
 EXECUTE fn;

 SELECT pg_get_functiondef(
  'public.construction_stage_qc_item_command(uuid,uuid,uuid,integer,text,text,uuid,boolean)'::regprocedure
 ) INTO fn;
 IF position('when before.value->>''kind''=''qc'' then coalesce((' in fn)=0 THEN
  RAISE EXCEPTION 'Unexpected onsite QC dependency function';
 END IF;
 fn:=replace(fn,'            else false' || chr(10) || '          end',
                 '            when before.value->>''kind''=''payment'' then true' || chr(10) ||
                 '            else false' || chr(10) || '          end');
 IF position('when before.value->>''kind''=''payment'' then true' in fn)=0 THEN
  RAISE EXCEPTION 'Payment milestone must not bypass on-site QC rules';
 END IF;
 EXECUTE fn;
END
$payment_flow$;
