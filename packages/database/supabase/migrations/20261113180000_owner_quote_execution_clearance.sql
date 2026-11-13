-- An owner may proceed from the customer's current Final quotation without
-- uploading a separate agreement. This is an auditable owner choice, never a
-- customer signature or receipt. Keep the quote's payment groups canonical.
BEGIN;

DO $patch$
DECLARE
  definition text;
  old_guard text;
  new_guard text;
BEGIN
  SELECT pg_get_functiondef(
    'public.project_site_command(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO definition;
  old_guard := $before$and event.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$and event.event_kind in ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Unexpected project_site_command agreement guard';
  END IF;
  IF position(old_guard IN definition)>0 THEN
    EXECUTE replace(definition,old_guard,new_guard);
  ELSIF position(new_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_site_command agreement guard';
  END IF;

  SELECT pg_get_functiondef(
    'public.project_preflight_save(uuid,uuid,text,text)'::regprocedure
  ) INTO definition;
  old_guard := $before$and ev.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$and ev.event_kind in ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Unexpected project_preflight_save agreement guard';
  END IF;
  IF position(old_guard IN definition)>0 THEN
    EXECUTE replace(definition,old_guard,new_guard);
  ELSIF position(new_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_preflight_save agreement guard';
  END IF;

  SELECT pg_get_functiondef(
    'public.project_advance_proforma_prepare(uuid,uuid,numeric)'::regprocedure
  ) INTO definition;
  old_guard := $before$and ev.event_kind='signed_copy_recorded'$before$;
  new_guard := $after$and ev.event_kind in ('signed_copy_recorded','owner_exception')$after$;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Unexpected project_advance_proforma_prepare agreement guard';
  END IF;
  IF position(old_guard IN definition)>0 THEN
    EXECUTE replace(definition,old_guard,new_guard);
  ELSIF position(new_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected project_advance_proforma_prepare agreement guard';
  END IF;

  -- Allow the owner-prepared current Final draft only when it is still the
  -- customer's selected Final quote for this exact contract. Issued quotes
  -- and their digital acceptance path keep their existing validation.
  SELECT pg_get_functiondef(
    'private.sync_signed_quotation_schedule(uuid,uuid)'::regprocedure
  ) INTO definition;
  old_guard := $before$
  SELECT * INTO r FROM public.quotation_revisions
    WHERE organization_id=p_org AND id=c.revision_id AND status='issued';
  IF r.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.organization_id=p_org AND q.id=r.quotation_id
      AND q.customer_id=c.customer_id AND q.current_revision_id=r.id
      AND q.status='issued'
  ) THEN RETURN NULL; END IF;
$before$;
  new_guard := $after$
  SELECT * INTO r FROM public.quotation_revisions
    WHERE organization_id=p_org AND id=c.revision_id;
  IF r.id IS NULL OR NOT (
    (r.status='issued' AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.organization_id=p_org AND q.id=r.quotation_id
        AND q.customer_id=c.customer_id AND q.current_revision_id=r.id
        AND q.status='issued'
    ))
    OR (r.status='draft' AND c.acceptance_id IS NULL AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.organization_id=p_org AND q.id=r.quotation_id
        AND q.customer_id=c.customer_id AND q.current_revision_id=r.id
        AND q.status='draft'
        AND (public.quotation_final_choices(p_org,ARRAY[q.customer_id])->>q.customer_id::text)=q.id::text
    ))
  ) THEN RETURN NULL; END IF;
$after$;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Unexpected quotation schedule source guard';
  END IF;
  IF position(old_guard IN definition)>0 THEN
    definition := replace(definition,old_guard,new_guard);
  ELSIF position(new_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected quotation schedule source guard';
  END IF;
  definition := replace(definition,
    'payment_schedule.activated_from_signed_quotation',
    'payment_schedule.activated_from_quotation');
  EXECUTE definition;

  SELECT pg_get_functiondef(
    'private.auto_signed_quote_schedule_on_signing()'::regprocedure
  ) INTO definition;
  old_guard := $before$IF new.event_kind='signed_copy_recorded' THEN$before$;
  new_guard := $after$IF new.event_kind IN ('signed_copy_recorded','owner_exception') THEN$after$;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Unexpected quotation schedule event trigger';
  END IF;
  IF position(old_guard IN definition)>0 THEN
    EXECUTE replace(definition,old_guard,new_guard);
  ELSIF position(new_guard IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected quotation schedule event trigger';
  END IF;
END
$patch$;

-- An earlier owner choice may already have activated its contract before the
-- quotation schedule path was deployed. Import only those current, matching
-- owner-exception contracts. The canonical importer is idempotent and never
-- overwrites an existing manual or quotation schedule.
DO $backfill$
DECLARE
  v_contract record;
BEGIN
  FOR v_contract IN
    SELECT c.organization_id,c.id
      FROM public.contracts c
      JOIN LATERAL (
        SELECT e.event_kind,e.scope_fingerprint,e.sequence
          FROM private.project_agreement_events e
         WHERE e.organization_id=c.organization_id
           AND e.project_id=c.project_id AND e.contract_id=c.id
         ORDER BY e.sequence DESC LIMIT 1
      ) latest ON true
     WHERE c.status='active'
       AND latest.event_kind='owner_exception'
       AND latest.scope_fingerprint=private.project_agreement_scope(c.id)
  LOOP
    PERFORM private.sync_signed_quotation_schedule(v_contract.organization_id,v_contract.id);
  END LOOP;
END
$backfill$;

COMMIT;
