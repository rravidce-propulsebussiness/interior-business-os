-- The owner may record that the final quotation is the agreed project scope
-- and that any separate agreement was handled offline / is intentionally
-- omitted. This is an auditable owner exception, never a signed-agreement
-- claim. Continue to bind all stages and payment rows to the immutable quote.
BEGIN;

DO $patch$
DECLARE
  definition text;
  old_guard text;
  new_guard text;
BEGIN
  -- An offline-agreement exception is valid for floor-plan preparation and
  -- site survey, but only while it is the latest current-scope owner event.
  SELECT pg_get_functiondef(
    'public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO definition;
  old_guard := $before$and event.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$and event.event_kind in ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL OR position(old_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_site_command agreement guard';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);

  SELECT pg_get_functiondef(
    'public.project_preflight_save(uuid,uuid,text,text)'::regprocedure
  ) INTO definition;
  old_guard := $before$and ev.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$and ev.event_kind in ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL OR position(old_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_preflight_save agreement guard';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);

  -- Only the owner exception can replace the paper-upload/signature evidence.
  -- The agreed advance still comes from the exact quotation's payment terms.
  SELECT pg_get_functiondef(
    'public.project_advance_proforma_prepare(uuid,uuid,numeric)'::regprocedure
  ) INTO definition;
  old_guard := $before$and ev.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$and ev.event_kind in ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL OR position(old_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_advance_proforma_prepare agreement guard';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);

  -- Activate the payment schedule from the same immutable final quotation
  -- after the owner exception, just as when an offline signed copy is logged.
  SELECT pg_get_functiondef(
    'private.sync_signed_quotation_schedule(uuid,uuid)'::regprocedure
  ) INTO definition;
  old_guard := $before$AND e.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$AND e.event_kind IN ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL OR position(old_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected quotation schedule agreement guard';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);

  SELECT pg_get_functiondef(
    'private.auto_signed_quote_schedule_on_signing()'::regprocedure
  ) INTO definition;
  old_guard := $before$IF new.event_kind='signed_copy_recorded' THEN$before$;
  new_guard := $after$IF new.event_kind IN ('signed_copy_recorded','owner_exception') THEN$after$;
  IF definition IS NULL OR position(old_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected quotation schedule event trigger';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);
END
$patch$;

COMMIT;
