-- Import the ORIGINAL agreed payment milestones from the immutable quotation
-- into the contract's operational schedule. Never create a second copy, issue
-- an invoice, invent a receipt, or certify work based on payment terms.
BEGIN;

CREATE FUNCTION private.sync_signed_quotation_schedule(
  p_org uuid, p_contract uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $sync$
DECLARE
  c public.contracts%ROWTYPE;
  r public.quotation_revisions%ROWTYPE;
  v_block text;
  v_terms text;
  v_line text;
  v_match text[];
  v_name text;
  v_percent numeric;
  v_total numeric := 0;
  v_names text[] := ARRAY[]::text[];
  v_rates numeric[] := ARRAY[]::numeric[];
  v_count integer;
  v_index integer;
  v_basis numeric;
  v_amount numeric;
  v_allocated numeric := 0;
  v_schedule uuid;
BEGIN
  -- Serialize the import with contract transitions and concurrent retries.
  SELECT * INTO c FROM public.contracts
   WHERE organization_id=p_org AND id=p_contract FOR UPDATE;
  IF c.id IS NULL OR c.status <> 'active' THEN RETURN NULL; END IF;

  -- Existing manually configured schedules must never be overwritten,
  -- even when they are still drafts. New calls are idempotent.
  IF EXISTS (
    SELECT 1 FROM public.payment_schedules ps
    WHERE ps.organization_id=p_org AND ps.contract_id=c.id
  ) THEN
    SELECT ps.id INTO v_schedule FROM public.payment_schedules ps
    WHERE ps.organization_id=p_org AND ps.contract_id=c.id AND ps.status='active'
    ORDER BY ps.activated_at DESC NULLS LAST,ps.id LIMIT 1;
    RETURN v_schedule;
  END IF;

  -- Do not infer agreement from a pending contract, a PDF upload without
  -- recorded signing evidence, a revoked event, or an outdated scope.
  IF NOT EXISTS (
    SELECT 1 FROM private.project_agreement_events e
    WHERE e.organization_id=p_org AND e.project_id=c.project_id
      AND e.contract_id=c.id AND e.event_kind='signed_copy_recorded'
      AND e.scope_fingerprint=private.project_agreement_scope(c.id)
      AND e.sequence=(
        SELECT MAX(latest.sequence) FROM private.project_agreement_events latest
        WHERE latest.organization_id=p_org AND latest.project_id=c.project_id
          AND latest.contract_id=c.id
      )
  ) THEN RETURN NULL; END IF;

  SELECT * INTO r FROM public.quotation_revisions
    WHERE organization_id=p_org AND id=c.revision_id AND status='issued';
  IF r.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.quotations q
    WHERE q.organization_id=p_org AND q.id=r.quotation_id
      AND q.customer_id=c.customer_id AND q.current_revision_id=r.id
      AND q.status='issued'
  ) THEN RETURN NULL; END IF;
  IF private.contract_value(c.id) IS DISTINCT FROM
     private.finance_decimal(c.original_contract_value)
  THEN RETURN NULL; END IF;

  v_terms := COALESCE(r.terms,'');
  -- The same format validated by savedStagePaymentPlan() in the app.
  IF (length(v_terms)-length(replace(v_terms,'[STAGE_PAYMENT_PLAN]','')))
       <> length('[STAGE_PAYMENT_PLAN]')
     OR (length(v_terms)-length(replace(v_terms,'[/STAGE_PAYMENT_PLAN]','')))
       <> length('[/STAGE_PAYMENT_PLAN]')
  THEN RETURN NULL; END IF;
  v_block := split_part(split_part(v_terms,
    '[STAGE_PAYMENT_PLAN]',2),'[/STAGE_PAYMENT_PLAN]',1);
  v_block := btrim(v_block,E' \t\r\n');
  IF v_block='' THEN RETURN NULL; END IF;

  FOREACH v_line IN ARRAY regexp_split_to_array(v_block,E'\r?\n') LOOP
    v_match := regexp_match(btrim(v_line),
      '^(.+)\|([0-9]+(\.[0-9]{1,2})?)$');
    IF v_match IS NULL THEN RETURN NULL; END IF;
    v_name := btrim(v_match[1]);
    v_percent := v_match[2]::numeric;
    IF length(v_name) NOT BETWEEN 1 AND 100
       OR v_percent<=0 OR v_percent>100 THEN RETURN NULL; END IF;
    v_names := array_append(v_names,v_name);
    v_rates := array_append(v_rates,v_percent);
    v_total := v_total+v_percent;
    IF array_length(v_names,1)>40 THEN RETURN NULL; END IF;
  END LOOP;
  v_count := COALESCE(array_length(v_names,1),0);
  IF v_count<1 OR abs(v_total-100)>0.001 THEN RETURN NULL; END IF;

  v_basis := private.contract_value(c.id);
  IF v_basis IS NULL OR v_basis<0 THEN RETURN NULL; END IF;

  INSERT INTO public.payment_schedules(
    organization_id,contract_id,label,basis_value,created_by
  ) VALUES (
    p_org,c.id,'Agreed quotation payment schedule',
    trim_scale(v_basis)::text,c.created_by
  ) RETURNING id INTO v_schedule;

  FOR v_index IN 1..v_count LOOP
    -- Preserve the agreed percentages. A final rounding adjustment
    -- allocates exactly the frozen contract value, not extra money.
    v_amount := CASE WHEN v_index=v_count
      THEN v_basis-v_allocated
      ELSE round(v_basis*v_rates[v_index]/100,c.precision)
    END;
    IF v_amount<0 THEN RAISE EXCEPTION 'Invalid quoted milestone distribution'
      USING ERRCODE='23514'; END IF;
    v_allocated := v_allocated+v_amount;
    INSERT INTO public.payment_schedule_items(
      organization_id,contract_id,schedule_id,label,description,
      calculation_type,value,expected_amount,due_trigger,due_date,sort_order
    ) VALUES (
      p_org,c.id,v_schedule,v_names[v_index],
      'From signed quotation, without a duplicate payment plan',
      'percentage',trim_scale(v_rates[v_index])::text,
      trim_scale(v_amount)::text,v_names[v_index],NULL,v_index-1
    );
  END LOOP;

  UPDATE public.payment_schedules
   SET status='active',activated_at=now(),version=version+1
   WHERE id=v_schedule AND organization_id=p_org AND status='draft';
  IF auth.uid() IS NOT NULL THEN
    PERFORM private.crm_audit(p_org,
      'payment_schedule.activated_from_signed_quotation',
      'payment_schedules',v_schedule);
  END IF;
  RETURN v_schedule;
END;
$sync$;

REVOKE ALL ON FUNCTION private.sync_signed_quotation_schedule(uuid,uuid)
  FROM PUBLIC,anon,authenticated;

-- A contract activated after signing inherits the already agreed schedule.
CREATE FUNCTION private.auto_signed_quote_schedule_on_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $trigger$
BEGIN
  IF new.status='active' AND old.status IS DISTINCT FROM 'active' THEN
    PERFORM private.sync_signed_quotation_schedule(new.organization_id,new.id);
  END IF;
  RETURN new;
END;
$trigger$;
CREATE TRIGGER auto_signed_quote_schedule_on_contract
  AFTER UPDATE OF status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION private.auto_signed_quote_schedule_on_contract();

-- Also support the legitimate order: activate contract, then record signing.
CREATE FUNCTION private.auto_signed_quote_schedule_on_signing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $trigger$
BEGIN
  IF new.event_kind='signed_copy_recorded' THEN
    PERFORM private.sync_signed_quotation_schedule(new.organization_id,new.contract_id);
  END IF;
  RETURN new;
END;
$trigger$;
CREATE TRIGGER auto_signed_quote_schedule_on_signing
  AFTER INSERT ON private.project_agreement_events
  FOR EACH ROW EXECUTE FUNCTION private.auto_signed_quote_schedule_on_signing();

-- Recover previously signed and active projects exactly once. Ineligible
-- contracts and all user-customized schedules remain untouched.
DO $backfill$
DECLARE entry record;
BEGIN
  FOR entry IN
    SELECT c.organization_id,c.id FROM public.contracts c
    WHERE c.status='active' AND NOT EXISTS(
      SELECT 1 FROM public.payment_schedules ps
      WHERE ps.organization_id=c.organization_id AND ps.contract_id=c.id)
  LOOP
    PERFORM private.sync_signed_quotation_schedule(entry.organization_id,entry.id);
  END LOOP;
END;
$backfill$;

COMMIT;
