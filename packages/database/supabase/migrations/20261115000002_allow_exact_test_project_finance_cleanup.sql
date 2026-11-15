CREATE OR REPLACE FUNCTION private.test_fixture_cleanup_allowed(p_org uuid,p_project uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $f$
 SELECT private.owner_test_reset_allowed(p_org)
 AND EXISTS(
   SELECT 1 FROM public.projects p
   JOIN public.customers c ON c.organization_id=p.organization_id AND c.id=p.customer_id
   WHERE p.organization_id=p_org AND p.id=p_project
     AND p.name='TEST ONLY — Project Management Workflow Demo'
     AND p.notes='TEST ONLY — synthetic internal workflow record. No real customer; do not contact.'
     AND c.display_name='TEST ONLY — ProPulse Workflow QA'
 );
$f$;
REVOKE ALL ON FUNCTION private.test_fixture_cleanup_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.finance_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 a jsonb:=to_jsonb(old);
 b jsonb:=to_jsonb(new);
 parent_status text;
 v_org uuid;
 v_project uuid;
 v_contract uuid;
BEGIN
 IF tg_op='DELETE' THEN
  v_org:=nullif(a->>'organization_id','')::uuid;
  v_project:=nullif(a->>'project_id','')::uuid;
  v_contract:=nullif(a->>'contract_id','')::uuid;
  IF v_project IS NULL AND v_contract IS NOT NULL THEN
    SELECT c.project_id INTO v_project FROM public.contracts c
      WHERE c.organization_id=v_org AND c.id=v_contract;
  END IF;
  IF v_project IS NULL AND nullif(a->>'payment_id','') IS NOT NULL THEN
    SELECT p.project_id INTO v_project FROM public.payments p
      WHERE p.organization_id=v_org AND p.id=(a->>'payment_id')::uuid;
  END IF;
  IF coalesce(current_setting('business_os.test_reset_org',true),'')=coalesce(v_org::text,'')
     AND v_project IS NOT NULL
     AND private.test_fixture_cleanup_allowed(v_org,v_project) THEN
    RETURN old;
  END IF;
  IF tg_table_name IN ('invoice_items','change_order_items','payment_schedule_items') THEN
    IF tg_table_name='invoice_items' THEN
      SELECT status INTO parent_status FROM public.invoices WHERE id=old.invoice_id FOR UPDATE;
    ELSIF tg_table_name='change_order_items' THEN
      SELECT status INTO parent_status FROM public.change_orders WHERE id=old.change_order_id FOR UPDATE;
    ELSE
      SELECT status INTO parent_status FROM public.payment_schedules WHERE id=old.schedule_id FOR UPDATE;
    END IF;
    IF parent_status='draft' THEN RETURN old; END IF;
  END IF;
  RAISE EXCEPTION 'Financial history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF tg_op='UPDATE' AND (a->'id' IS DISTINCT FROM b->'id'
   OR a->'organization_id' IS DISTINCT FROM b->'organization_id'
   OR a->'contract_id' IS DISTINCT FROM b->'contract_id') THEN
   RAISE EXCEPTION 'Stable financial identity required' USING ERRCODE='23514';
 END IF;
 IF tg_table_name IN ('invoice_items','change_order_items','payment_schedule_items') THEN
  IF tg_table_name='invoice_items' THEN
    IF tg_op='UPDATE' AND old.invoice_id<>new.invoice_id THEN RAISE EXCEPTION 'Stable parent required' USING ERRCODE='23514'; END IF;
    SELECT status INTO parent_status FROM public.invoices WHERE id=new.invoice_id FOR UPDATE;
  ELSIF tg_table_name='change_order_items' THEN
    IF tg_op='UPDATE' AND old.change_order_id<>new.change_order_id THEN RAISE EXCEPTION 'Stable parent required' USING ERRCODE='23514'; END IF;
    SELECT status INTO parent_status FROM public.change_orders WHERE id=new.change_order_id FOR UPDATE;
  ELSE
    IF tg_op='UPDATE' AND old.schedule_id<>new.schedule_id THEN RAISE EXCEPTION 'Stable parent required' USING ERRCODE='23514'; END IF;
    SELECT status INTO parent_status FROM public.payment_schedules WHERE id=new.schedule_id FOR UPDATE;
  END IF;
  IF parent_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Frozen financial lines' USING ERRCODE='23514'; END IF;
 ELSIF tg_op='UPDATE' THEN
  IF tg_table_name='contracts'
    AND a-ARRAY['status','version','started_at','completed_at','closed_at','cancelled_at','status_reason','updated_at']
       IS DISTINCT FROM b-ARRAY['status','version','started_at','completed_at','closed_at','cancelled_at','status_reason','updated_at'] THEN
    RAISE EXCEPTION 'Frozen contract baseline' USING ERRCODE='23514';
  ELSIF tg_table_name IN ('invoices','change_orders','payment_schedules') AND (a->>'status')<>'draft' THEN
    IF a-ARRAY['status','version','voided_at','void_reason','approved_at','approved_by','approval_evidence','decision_reason','updated_at']
       IS DISTINCT FROM b-ARRAY['status','version','voided_at','void_reason','approved_at','approved_by','approval_evidence','decision_reason','updated_at'] THEN
      RAISE EXCEPTION 'Frozen commercial document' USING ERRCODE='23514';
    END IF;
    IF (a->>'status') IN ('approved','void','rejected','cancelled','superseded') THEN
      RAISE EXCEPTION 'Terminal financial document' USING ERRCODE='23514';
    END IF;
    IF (tg_table_name='invoices' AND NOT ((a->>'status')='issued' AND (b->>'status')='void'))
      OR (tg_table_name='change_orders' AND NOT ((a->>'status')='issued' AND (b->>'status') IN ('approved','rejected','cancelled')))
      OR (tg_table_name='payment_schedules' AND NOT ((a->>'status')='active' AND (b->>'status')='superseded')) THEN
      RAISE EXCEPTION 'Invalid financial transition' USING ERRCODE='23514';
    END IF;
  ELSIF tg_table_name IN ('payments','receipts','payment_requests') THEN
    IF a-ARRAY['status','voided_at','voided_by','void_reason','updated_at']
       IS DISTINCT FROM b-ARRAY['status','voided_at','voided_by','void_reason','updated_at']
       OR (a->>'status')='void' OR (b->>'status')<>'void' THEN
      RAISE EXCEPTION 'Frozen payment document' USING ERRCODE='23514';
    END IF;
  ELSIF tg_table_name='payment_allocations' THEN
    IF old.reversed_at IS NOT NULL OR new.reversed_at IS NULL
       OR a-ARRAY['reversed_at','reversed_by','reversal_reason','updated_at']
          IS DISTINCT FROM b-ARRAY['reversed_at','reversed_by','reversal_reason','updated_at'] THEN
      RAISE EXCEPTION 'Frozen allocation' USING ERRCODE='23514';
    END IF;
  END IF;
 END IF;
 RETURN new;
END;
$function$;