-- Customer evidence -> bank verification -> single canonical Finance payment + receipt.
-- Screenshot is never proof of bank credit on its own.
BEGIN;
CREATE TABLE private.client_payment_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 project_id uuid NOT NULL,
 contract_id uuid NOT NULL,
 request_id uuid NOT NULL,
 submitted_by uuid NOT NULL REFERENCES auth.users(id),
 amount text NOT NULL,
 bank_reference text NOT NULL,
 method text NOT NULL CHECK (method IN ('upi','bank_transfer','cheque','cash','other')),
 object_key text NOT NULL UNIQUE,
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
 byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','approved','rejected')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text NOT NULL DEFAULT '',
 payment_id uuid UNIQUE,
 receipt_id uuid UNIQUE,
 UNIQUE(organization_id,bank_reference),
 FOREIGN KEY(organization_id,project_id) REFERENCES public.projects(organization_id,id),
 FOREIGN KEY(organization_id,contract_id) REFERENCES public.contracts(organization_id,id),
 FOREIGN KEY(organization_id,request_id) REFERENCES public.payment_requests(organization_id,id),
 FOREIGN KEY(organization_id,payment_id) REFERENCES public.payments(organization_id,id),
 FOREIGN KEY(organization_id,receipt_id) REFERENCES public.receipts(organization_id,id)
);
CREATE UNIQUE INDEX one_pending_client_proof_per_request
 ON private.client_payment_proofs(organization_id,request_id)
 WHERE status='pending';
CREATE INDEX client_proof_contract_queue
 ON private.client_payment_proofs(organization_id,contract_id,status,submitted_at DESC);
ALTER TABLE private.client_payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.client_payment_proofs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.client_payment_proofs FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.client_payment_proof_request(
 p_project uuid,p_request uuid,p_amount numeric,p_reference text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $validate$
DECLARE req record; received numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT private.client_portal_accessible(p_project) THEN
  RAISE EXCEPTION 'Project invitation required' USING ERRCODE='42501'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000
  OR round(p_amount,2)<>p_amount THEN
  RAISE EXCEPTION 'Invalid payment amount' USING ERRCODE='22023'; END IF;
 IF p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 6 AND 110
   OR btrim(p_reference) !~ '^[A-Za-z0-9 _./:-]+$' THEN
  RAISE EXCEPTION 'Valid bank or UPI reference required' USING ERRCODE='22023'; END IF;
 SELECT r.organization_id,r.contract_id,r.amount,r.status,c.project_id,c.status AS contract_status
 INTO req FROM public.payment_requests r
 JOIN public.contracts c ON c.organization_id=r.organization_id
   AND c.id=r.contract_id
 JOIN public.projects p ON p.organization_id=c.organization_id AND p.id=c.project_id
 WHERE r.id=p_request AND p.id=p_project AND p.status='active'
   AND NOT p.is_sales_prospect AND NOT p.removed_from_workspace;
 IF NOT FOUND OR req.status<>'issued' OR req.contract_status NOT IN ('active','on_hold')
 THEN RAISE EXCEPTION 'Payment request unavailable' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(sum(private.finance_decimal(cp.amount)),0) INTO received
 FROM private.client_payment_proofs cp JOIN public.payments pay
   ON pay.id=cp.payment_id AND pay.organization_id=cp.organization_id
 WHERE cp.organization_id=req.organization_id AND cp.request_id=p_request
   AND cp.status='approved' AND pay.status='recorded';
 IF p_amount>private.finance_decimal(req.amount)-received THEN
  RAISE EXCEPTION 'Amount exceeds remaining requested payment'
   USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('organization_id',req.organization_id,
  'contract_id',req.contract_id,'remaining',
   private.finance_decimal(req.amount)-received);
END;
$validate$;

CREATE FUNCTION public.client_payment_proof_prepare(
 p_project uuid,p_request uuid,p_amount numeric,p_reference text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $prepare$
BEGIN
 RETURN private.client_payment_proof_request(p_project,p_request,
   p_amount,p_reference);
END;$prepare$;

CREATE FUNCTION public.client_payment_proof_submit(
 p_project uuid,p_request uuid,p_amount numeric,p_reference text,
 p_method text,p_proof_id uuid,p_object_key text,p_mime text,p_bytes integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $submit$
DECLARE allowed jsonb; org uuid; contract uuid;
BEGIN
 allowed:=private.client_payment_proof_request(p_project,p_request,
  p_amount,p_reference);
 org:=(allowed->>'organization_id')::uuid;
 contract:=(allowed->>'contract_id')::uuid;
 IF p_proof_id IS NULL OR p_method NOT IN
   ('upi','bank_transfer','cheque','cash','other')
  OR p_mime NOT IN ('image/jpeg','image/png','image/webp','application/pdf')
  OR p_bytes NOT BETWEEN 1 AND 5242880 OR
  p_object_key IS DISTINCT FROM
    'payment-proof/'||org||'/'||p_project||'/'||p_proof_id
 THEN RAISE EXCEPTION 'Invalid payment proof' USING ERRCODE='22023';END IF;
 INSERT INTO private.client_payment_proofs(
  id,organization_id,project_id,contract_id,request_id,submitted_by,
  amount,bank_reference,method,object_key,mime,byte_size
 ) VALUES(p_proof_id,org,p_project,contract,p_request,auth.uid(),
  trim_scale(p_amount)::text,upper(btrim(p_reference)),p_method,
  p_object_key,p_mime,p_bytes);
 PERFORM private.crm_audit(org,'customer.payment_proof_submitted',
  'client_payment_proofs',p_proof_id);
 RETURN p_proof_id;
END;$submit$;

-- A client sees the evidence, review status, and receipt ONLY for their
-- own invited project. For each milestone show the latest submission.
CREATE FUNCTION public.client_payment_proof_list(p_project uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
BEGIN
 IF NOT private.client_portal_accessible(p_project) THEN
  RAISE EXCEPTION 'Project invitation required' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',v.id,'requestId',v.request_id,'amount',private.finance_decimal(v.amount),
  'reference',v.bank_reference,'status',
   CASE WHEN v.status='approved' AND pay.status='void' THEN 'reversed'
    ELSE v.status END,
  'date',v.submitted_at,'reviewNote',v.review_note,
  'receiptId',CASE WHEN rc.status='issued' THEN rc.id ELSE NULL END
 ) ORDER BY v.submitted_at DESC)
 FROM private.client_payment_proofs v
 LEFT JOIN public.payments pay ON pay.id=v.payment_id
 LEFT JOIN public.receipts rc ON rc.id=v.receipt_id
 WHERE v.project_id=p_project AND v.submitted_by=auth.uid()
 ),'[]'::jsonb);
END;$read$;

CREATE FUNCTION public.staff_payment_proof_list(
 p_org uuid,p_contract uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $read$
BEGIN
 IF NOT private.finance_access(p_org,'payment.record') THEN
  RAISE EXCEPTION 'Payment recording permission required'
   USING ERRCODE='42501';END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',pr.id,'projectId',pr.project_id,'contractId',pr.contract_id,
  'requestId',pr.request_id,'requestNumber',req.request_number,
  'amount',private.finance_decimal(pr.amount),'reference',pr.bank_reference,
  'method',pr.method,'status',pr.status,'date',pr.submitted_at,
  'projectName',p.name,'reviewNote',pr.review_note,
  'paymentId',pr.payment_id,'receiptId',pr.receipt_id
 ) ORDER BY pr.submitted_at DESC)
 FROM private.client_payment_proofs pr
 JOIN public.projects p ON p.id=pr.project_id
 JOIN public.payment_requests req ON req.id=pr.request_id
 WHERE pr.organization_id=p_org AND (p_contract IS NULL OR pr.contract_id=p_contract)
 LIMIT 200),'[]'::jsonb);
END;$read$;

-- The media key is only returned after a fresh access check.
CREATE FUNCTION public.client_payment_proof_media(
 p_project uuid,p_proof uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $media$
BEGIN
 IF NOT private.client_portal_accessible(p_project) THEN
  RAISE EXCEPTION 'Project invitation required' USING ERRCODE='42501';END IF;
 RETURN (SELECT jsonb_build_object('key',pr.object_key,'mime',pr.mime)
 FROM private.client_payment_proofs pr
 WHERE pr.project_id=p_project AND pr.id=p_proof
   AND pr.submitted_by=auth.uid());
END;$media$;

CREATE FUNCTION public.staff_payment_proof_media(
 p_org uuid,p_proof uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $media$
BEGIN
 IF NOT private.finance_access(p_org,'payment.record') THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 RETURN (SELECT jsonb_build_object('key',pr.object_key,'mime',pr.mime)
 FROM private.client_payment_proofs pr
 WHERE pr.organization_id=p_org AND pr.id=p_proof);
END;$media$;

CREATE FUNCTION public.client_payment_proof_receipt(p_project uuid,p_proof uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $receipt$
BEGIN
 IF NOT private.client_portal_accessible(p_project) THEN
  RAISE EXCEPTION 'Project invitation required' USING ERRCODE='42501';END IF;
 RETURN (SELECT rc.document_snapshot FROM private.client_payment_proofs pr
 JOIN public.payments pay ON pay.id=pr.payment_id AND pay.status='recorded'
 JOIN public.receipts rc ON rc.id=pr.receipt_id AND rc.status='issued'
 WHERE pr.project_id=p_project AND pr.id=p_proof AND pr.status='approved'
   AND pr.submitted_by=auth.uid());
END;$receipt$;

CREATE FUNCTION public.staff_payment_proof_decide(
 p_org uuid,p_proof uuid,p_action text,p_method uuid DEFAULT NULL,
 p_confirm_bank_credit boolean DEFAULT false,
 p_allow_partial boolean DEFAULT false,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $decide$
DECLARE pr private.client_payment_proofs%ROWTYPE;
 req public.payment_requests%ROWTYPE;
 value_due numeric; previously_received numeric; outstanding numeric; contract_received numeric;
 payment uuid; receipt uuid; is_owner boolean; payment_day date;
BEGIN
 PERFORM private.finance_require(p_org,'payment.record');
 IF NOT EXISTS(
  SELECT 1 FROM public.organization_memberships m
  JOIN public.membership_roles mr ON mr.membership_id=m.id
    AND mr.organization_id=m.organization_id
  JOIN public.roles role ON role.id=mr.role_id
    AND role.organization_id=m.organization_id
  WHERE m.organization_id=p_org AND m.user_id=auth.uid()
    AND m.status='active' AND lower(role.name) IN ('owner','accountant')
 ) THEN
  RAISE EXCEPTION 'Owner or Accountant role required'
   USING ERRCODE='42501';
 END IF;
 SELECT EXISTS(
  SELECT 1 FROM public.organization_memberships m
  JOIN public.membership_roles mr ON mr.membership_id=m.id
    AND mr.organization_id=m.organization_id
  JOIN public.roles role ON role.id=mr.role_id
    AND role.organization_id=m.organization_id
  WHERE m.organization_id=p_org AND m.user_id=auth.uid()
   AND m.status='active' AND role.is_owner
 ) INTO is_owner;
 SELECT * INTO pr FROM private.client_payment_proofs
  WHERE organization_id=p_org AND id=p_proof FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment proof unavailable'
   USING ERRCODE='42501'; END IF;
 IF pr.status='approved' AND p_action='approve' THEN
   RETURN jsonb_build_object('status','approved','paymentId',pr.payment_id,
    'receiptId',pr.receipt_id);
 END IF;
 IF pr.status<>'pending' OR p_action NOT IN ('approve','reject') THEN
   RAISE EXCEPTION 'Payment proof already reviewed' USING ERRCODE='22023';END IF;
 IF length(btrim(coalesce(p_note,'')))>1000 THEN
   RAISE EXCEPTION 'Review note too long' USING ERRCODE='22023';END IF;
 IF p_action='reject' THEN
   IF length(btrim(coalesce(p_note,'')))<8 THEN
    RAISE EXCEPTION 'Rejection reason required' USING ERRCODE='22023';END IF;
   UPDATE private.client_payment_proofs SET status='rejected',reviewed_by=auth.uid(),
     reviewed_at=now(),review_note=btrim(p_note) WHERE id=p_proof;
   PERFORM private.crm_audit(p_org,'customer.payment_proof_rejected',
    'client_payment_proofs',p_proof);
   RETURN jsonb_build_object('status','rejected');
 END IF;
 IF NOT p_confirm_bank_credit THEN
  RAISE EXCEPTION 'Confirm actual bank credit before approval'
   USING ERRCODE='22023';END IF;
 IF p_allow_partial AND NOT is_owner THEN
  RAISE EXCEPTION 'Only company Owner can approve partial milestone payments'
   USING ERRCODE='42501';END IF;
 IF p_method IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.payment_methods WHERE organization_id=p_org
    AND id=p_method AND active
 ) THEN RAISE EXCEPTION 'Select an enabled payment method'
   USING ERRCODE='22023';END IF;
 SELECT * INTO req FROM public.payment_requests
  WHERE organization_id=p_org AND id=pr.request_id AND status='issued';
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment request no longer issued'
    USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM public.payments
     WHERE organization_id=p_org AND status='recorded'
       AND upper(btrim(external_reference))=pr.bank_reference) THEN
  RAISE EXCEPTION 'This transaction reference was already recorded'
   USING ERRCODE='23505';END IF;
 -- One verified request may receive several Owner-authorized partial
 -- payments. Receipt linking is explicit, no second ledger.
 SELECT COALESCE(sum(private.finance_decimal(other.amount)),0)
 INTO previously_received FROM private.client_payment_proofs other
 JOIN public.payments pay ON pay.id=other.payment_id
  AND pay.organization_id=other.organization_id AND pay.status='recorded'
 WHERE other.organization_id=p_org AND other.request_id=pr.request_id
  AND other.status='approved';
 outstanding:=private.finance_decimal(req.amount)-previously_received;
 value_due:=private.finance_decimal(pr.amount);
 IF value_due>outstanding OR value_due<=0 THEN
  RAISE EXCEPTION 'Payment exceeds outstanding request' USING ERRCODE='22023';END IF;
 IF value_due<outstanding AND NOT p_allow_partial THEN
  RAISE EXCEPTION 'Full milestone payment required; Owner may permit partial'
   USING ERRCODE='22023';END IF;
 -- Protect against manual Finance receipts not recorded through this proof
 -- flow. Check the real ledger, not only proof-linked payments.
 SELECT COALESCE(sum(private.finance_decimal(pay.amount)),0)
 INTO contract_received FROM public.payments pay
 WHERE pay.organization_id=p_org AND pay.contract_id=pr.contract_id
  AND pay.status='recorded';
 IF contract_received+value_due>private.contract_value(pr.contract_id) THEN
  RAISE EXCEPTION 'Payment would exceed remaining signed contract value'
   USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contracts
    WHERE organization_id=p_org AND id=pr.contract_id
    AND project_id=pr.project_id AND status NOT IN ('closed','cancelled')) THEN
   RAISE EXCEPTION 'Contract not payable' USING ERRCODE='22023';END IF;
 payment_day:=(now() at time zone (SELECT default_timezone
  FROM public.organizations WHERE id=p_org))::date;
 payment:=public.payment_record(p_org,pr.contract_id,
   jsonb_build_object('idempotency_key',pr.id,'payment_date',payment_day,
    'amount',pr.amount,'method_id',p_method,
    'external_reference',pr.bank_reference,
    'notes','Verified customer payment evidence '||pr.id,
    'allocations','[]'::jsonb));
 SELECT rc.id INTO receipt FROM public.receipts rc
  WHERE rc.organization_id=p_org AND rc.payment_id=payment AND rc.status='issued';
 IF receipt IS NULL THEN
  RAISE EXCEPTION 'Receipt creation failed' USING ERRCODE='23514';END IF;
 UPDATE private.client_payment_proofs SET status='approved',
  reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(coalesce(p_note,'')),
  payment_id=payment,receipt_id=receipt WHERE id=p_proof;
 PERFORM private.crm_audit(p_org,'customer.payment_proof_approved',
   'client_payment_proofs',p_proof);
 RETURN jsonb_build_object('status','approved','paymentId',payment,'receiptId',receipt);
END;$decide$;

-- Keep the owner-only test reset aware of the new FK descendant.
CREATE OR REPLACE FUNCTION private.test_reset_targets()
RETURNS regclass[] LANGUAGE sql STABLE SET search_path=''
AS $f$ SELECT pg_catalog.array_remove(ARRAY[
  'private.automation_email_payloads'::regclass,
  'private.client_design_decisions'::regclass,
  'private.client_payment_proofs'::regclass,
  'private.client_project_access'::regclass,
  'private.construction_project_roles'::regclass,
  'private.construction_project_stages'::regclass,
  'private.construction_project_workflows'::regclass,
  'private.construction_role_history'::regclass,
  'private.construction_stage_clearances'::regclass,
  'private.construction_stage_dependencies'::regclass,
  'private.construction_stage_inspections'::regclass,
  'private.construction_stage_record_links'::regclass,
  'private.construction_stage_reviews'::regclass,
  'private.construction_stage_tasks'::regclass,
  'private.gst_business_documents'::regclass,
  'private.gst_customer_invoice_links'::regclass,
  'private.gst_invoice_document_layouts'::regclass,
  'private.gst_stage_invoice_links'::regclass,
  'private.gst_won_lead_invoice_links'::regclass,
  'private.labour_disbursements'::regclass,
  'private.lead_quotation_links'::regclass,
  'private.project_advance_proformas'::regclass,
  'private.project_advance_requirements'::regclass,
  'private.project_agreement_events'::regclass,
  pg_catalog.to_regclass('private.project_client_requests'),
  'private.project_preflight'::regclass,
  'private.project_quote_timeline_sources'::regclass,
  'private.project_stage_owner_history'::regclass,
  'private.project_stage_owner_overrides'::regclass,
  'private.quotation_final_selections'::regclass,
  'private.quotation_public_limits'::regclass,
  'private.quotation_share_secrets'::regclass,
  'private.site_checks'::regclass,
  'private.site_designs'::regclass,
  'private.site_events'::regclass,
  'private.site_gate'::regclass,
  'private.site_manager_updates'::regclass,
  'private.site_material_needs'::regclass,
  'private.site_material_quantity_revisions'::regclass,
  'private.site_media'::regclass,
  'private.site_report_reviews'::regclass,
  'private.site_reports'::regclass,
  'private.site_state'::regclass,
  'private.site_team'::regclass,
  'public.change_order_items'::regclass,
  'public.change_orders'::regclass,
  'public.communication_consents'::regclass,
  'public.contracts'::regclass,
  'public.customer_contacts'::regclass,
  'public.customers'::regclass,
  'public.email_deliveries'::regclass,
  'public.estimation_recipe_item_costs'::regclass,
  'public.estimation_recipe_items'::regclass,
  'public.execution_estimate_documents'::regclass,
  'public.execution_estimate_line_costs'::regclass,
  'public.execution_estimate_lines'::regclass,
  'public.execution_estimate_revisions'::regclass,
  'public.execution_estimate_scope_items'::regclass,
  'public.execution_estimates'::regclass,
  'public.execution_plan_revisions'::regclass,
  'public.execution_plans'::regclass,
  'public.goods_receipt_items'::regclass,
  'public.goods_receipts'::regclass,
  'public.handover_records'::regclass,
  'public.inventory_counts'::regclass,
  'public.inventory_locations'::regclass,
  'public.inventory_lot_costs'::regclass,
  'public.inventory_lots'::regclass,
  'public.inventory_movements'::regclass,
  'public.inventory_transactions'::regclass,
  'public.invoice_items'::regclass,
  'public.invoices'::regclass,
  'public.lead_activities'::regclass,
  'public.lead_followups'::regclass,
  'public.leads'::regclass,
  'public.material_cost_revisions'::regclass,
  'public.material_issue_request_items'::regclass,
  'public.material_issue_requests'::regclass,
  'public.material_unit_conversions'::regclass,
  'public.material_variants'::regclass,
  'public.materials'::regclass,
  'public.payment_allocations'::regclass,
  'public.payment_requests'::regclass,
  'public.payment_schedule_items'::regclass,
  'public.payment_schedules'::regclass,
  'public.payments'::regclass,
  'public.project_areas'::regclass,
  'public.project_execution_events'::regclass,
  'public.project_execution_members'::regclass,
  'public.project_inspections'::regclass,
  'public.project_milestones'::regclass,
  'public.project_snags'::regclass,
  'public.project_tasks'::regclass,
  'public.projects'::regclass,
  'public.purchase_order_costs'::regclass,
  'public.purchase_order_item_costs'::regclass,
  'public.purchase_order_items'::regclass,
  'public.purchase_orders'::regclass,
  'public.purchase_requisition_items'::regclass,
  'public.purchase_requisition_sources'::regclass,
  'public.purchase_requisitions'::regclass,
  'public.quotation_customer_responses'::regclass,
  'public.quotation_item_costs'::regclass,
  'public.quotation_items'::regclass,
  'public.quotation_revisions'::regclass,
  'public.quotation_share_links'::regclass,
  'public.quotation_studio_attachments'::regclass,
  'public.quotations'::regclass,
  'public.receipts'::regclass,
  'public.rfq_items'::regclass,
  'public.rfq_vendors'::regclass,
  'public.rfqs'::regclass,
  'public.site_visits'::regclass,
  'public.subcontractor_work_order_costs'::regclass,
  'public.subcontractor_work_orders'::regclass,
  'public.task_dependencies'::regclass,
  'public.vendor_contacts'::regclass,
  'public.vendor_execution_profiles'::regclass,
  'public.vendor_materials'::regclass,
  'public.vendor_quote_items'::regclass,
  'public.vendor_quotes'::regclass,
  'public.vendors'::regclass,
  'public.work_measurement_costs'::regclass,
  'public.work_measurements'::regclass,
  'public.work_packages'::regclass
]::regclass[],NULL) $f$;


REVOKE ALL ON FUNCTION private.client_payment_proof_request(uuid,uuid,numeric,text),
 public.client_payment_proof_prepare(uuid,uuid,numeric,text),
 public.client_payment_proof_submit(uuid,uuid,numeric,text,text,uuid,text,text,integer),
 public.client_payment_proof_list(uuid),public.staff_payment_proof_list(uuid,uuid),
 public.client_payment_proof_media(uuid,uuid),public.staff_payment_proof_media(uuid,uuid),
 public.client_payment_proof_receipt(uuid,uuid),
 public.staff_payment_proof_decide(uuid,uuid,text,uuid,boolean,boolean,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.client_payment_proof_prepare(uuid,uuid,numeric,text),
 public.client_payment_proof_submit(uuid,uuid,numeric,text,text,uuid,text,text,integer),
 public.client_payment_proof_list(uuid),public.staff_payment_proof_list(uuid,uuid),
 public.client_payment_proof_media(uuid,uuid),public.staff_payment_proof_media(uuid,uuid),
 public.client_payment_proof_receipt(uuid,uuid),
 public.staff_payment_proof_decide(uuid,uuid,text,uuid,boolean,boolean,text)
 TO authenticated;
COMMIT;