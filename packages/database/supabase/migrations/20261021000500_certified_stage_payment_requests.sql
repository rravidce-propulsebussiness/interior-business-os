-- A certified construction stage can release a payment request for an agreed,
-- explicitly mapped quotation milestone. It NEVER marks cash as received and
-- NEVER invents a GST tax invoice. Contract and quote have frozen values.
BEGIN;

CREATE FUNCTION private.certified_stage_payment_requests(
 p_org uuid,p_project uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $auto$
DECLARE
 contract public.contracts%ROWTYPE;
 revision public.quotation_revisions%ROWTYPE;
 schedule public.payment_schedules%ROWTYPE;
 item public.payment_schedule_items%ROWTYPE;
 quote_lines text[];
 quote_line text;
 parts text[];
 bindings jsonb;
 bind_row jsonb;
 code text;
 stage_id uuid;
 existing_link uuid;
 qualified boolean;
 request_id uuid;
 number text;
 snapshot jsonb;
 issued_count integer:=0;
 total_percent numeric:=0;
 expected_percent numeric;
 index_no integer;
BEGIN
 -- Serialize concurrent certification and link activity against the contract.
 SELECT * INTO contract FROM public.contracts
 WHERE organization_id=p_org AND project_id=p_project AND status='active'
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF (SELECT count(*) FROM public.contracts
      WHERE organization_id=p_org AND project_id=p_project AND status='active')<>1
 THEN RETURN 0; END IF;
 IF contract.id IS NULL OR NOT private.project_agreement_authorized(p_org,p_project)
 THEN RETURN 0; END IF;
 SELECT * INTO revision FROM public.quotation_revisions
 WHERE organization_id=p_org AND id=contract.revision_id
   AND status='issued';
 IF revision.id IS NULL THEN RETURN 0; END IF;
 SELECT * INTO schedule FROM public.payment_schedules
 WHERE organization_id=p_org AND contract_id=contract.id AND status='active'
 ORDER BY activated_at DESC NULLS LAST,id LIMIT 1;
 IF schedule.id IS NULL OR
   private.finance_decimal(schedule.basis_value)<>private.contract_value(contract.id)
 THEN RETURN 0; END IF;
 -- Payment milestones MUST be the signed quotation's exact lines, not a
 -- similarly named hand-entered finance schedule or a newer sales quote.
 IF (length(revision.terms)-length(replace(revision.terms,'[STAGE_PAYMENT_PLAN]','')))
    <>length('[STAGE_PAYMENT_PLAN]') OR
    (length(revision.terms)-length(replace(revision.terms,'[/STAGE_PAYMENT_PLAN]','')))
    <>length('[/STAGE_PAYMENT_PLAN]')
 THEN RETURN 0; END IF;
 quote_lines:=regexp_split_to_array(btrim(split_part(split_part(
   revision.terms,'[STAGE_PAYMENT_PLAN]',2),'[/STAGE_PAYMENT_PLAN]',1)),
   E'\r?\n');
 IF array_length(quote_lines,1) IS NULL OR array_length(quote_lines,1)>40
 THEN RETURN 0; END IF;

 -- Optional stage-code mapping captured in the immutable accepted quote.
 -- Without it, a manager can link the existing payment item to the LAST
 -- certifiable stage via construction_stage_record_command.
 IF strpos(revision.terms,'[STAGE_PAYMENT_LINKS]')>0 THEN
   BEGIN
    bindings:=btrim(split_part(split_part(revision.terms,
       '[STAGE_PAYMENT_LINKS]',2),'[/STAGE_PAYMENT_LINKS]',1))::jsonb;
   EXCEPTION WHEN invalid_text_representation THEN RETURN 0;
   END;
   IF jsonb_typeof(bindings)<>'array' OR
      jsonb_array_length(bindings)<>array_length(quote_lines,1)
   THEN RETURN 0; END IF;
 END IF;
 IF (SELECT count(*) FROM public.payment_schedule_items
     WHERE organization_id=p_org AND contract_id=contract.id
       AND schedule_id=schedule.id) <> array_length(quote_lines,1)
 THEN RETURN 0; END IF;

 -- Validate ALL quoted rows before creating ANY request.
 FOR item IN SELECT * FROM public.payment_schedule_items
    WHERE organization_id=p_org AND contract_id=contract.id
      AND schedule_id=schedule.id ORDER BY sort_order LOOP
   index_no:=item.sort_order+1;
   IF index_no NOT BETWEEN 1 AND array_length(quote_lines,1)
   THEN RETURN 0; END IF;
   quote_line:=btrim(quote_lines[index_no]);
   parts:=regexp_match(quote_line,'^(.+)\|([0-9]+(\.[0-9]{1,2})?)$');
   IF parts IS NULL OR item.label<>btrim(parts[1])
     OR item.calculation_type<>'percentage'
     OR private.finance_decimal(item.value)<>parts[2]::numeric
   THEN RETURN 0; END IF;
   total_percent:=total_percent+parts[2]::numeric;
 END LOOP;
 IF abs(total_percent-100)>0.001 THEN RETURN 0; END IF;

 FOR item IN SELECT * FROM public.payment_schedule_items
    WHERE organization_id=p_org AND contract_id=contract.id
      AND schedule_id=schedule.id ORDER BY sort_order LOOP
  qualified:=false;
  index_no:=item.sort_order;
  bind_row:=CASE WHEN bindings IS NOT NULL THEN bindings->index_no ELSE NULL END;
  IF bind_row IS NOT NULL AND jsonb_typeof(bind_row)<>'array' THEN
   CONTINUE;
  END IF;
  IF bind_row IS NOT NULL AND jsonb_array_length(bind_row)>0 THEN
   qualified:=true;
   -- Every bound stage must exist in this precise project, and possess
   -- CURRENT independent QC certification. Never treat UI status as proof.
   FOR code IN SELECT value FROM jsonb_array_elements_text(bind_row) LOOP
    SELECT id INTO stage_id FROM private.construction_project_stages
    WHERE organization_id=p_org AND project_id=p_project AND instance_code=code;
    IF stage_id IS NULL OR NOT private.construction_stage_current(
      p_org,p_project,stage_id)
    THEN qualified:=false; EXIT; END IF;
   END LOOP;
  ELSE
   -- Legacy contract: only an explicitly manager-linked payment milestone.
   SELECT l.stage_id INTO existing_link
   FROM private.construction_stage_record_links l
   WHERE l.organization_id=p_org AND l.project_id=p_project
     AND l.record_kind='payment' AND l.contract_id=contract.id
     AND l.payment_item_id=item.id
   ORDER BY l.sequence DESC LIMIT 1;
   qualified:=existing_link IS NOT NULL
     AND private.construction_stage_current(p_org,p_project,existing_link);
  END IF;
  IF NOT qualified THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_requests r
    WHERE r.organization_id=p_org AND r.schedule_item_id=item.id)
  -- A manually voided request must NOT be recreated by an unrelated
  -- certification. Finance can resolve the cancellation deliberately.
  THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.invoice_items il
    JOIN public.invoices inv ON inv.id=il.invoice_id
      AND inv.organization_id=il.organization_id
    WHERE il.organization_id=p_org AND il.source_type='milestone'
      AND il.source_id=item.id AND inv.status='issued')
  THEN CONTINUE; END IF;
  -- Legacy GST invoice authored for this exact quotation stage also wins.
  IF EXISTS(SELECT 1 FROM private.gst_stage_invoice_links l
    JOIN private.gst_business_documents d ON d.id=l.invoice_id
      AND d.organization_id=l.organization_id
    WHERE l.organization_id=p_org AND l.project_id=p_project
      AND l.revision_id=contract.revision_id AND l.stage_number=index_no+1
      AND d.status='issued')
  THEN CONTINUE; END IF;

  number:=private.finance_number(p_org,'payment_request','PR');
  snapshot:=private.finance_header(contract.id)||jsonb_build_object(
   'kind','payment_request','number',number,'date',current_date,
   'due_date',item.due_date,'notes',
   'Automatically requested after the last linked construction stage received independent quality certification. Not a GST tax invoice or a receipt.',
   'terms','Quoted milestone '||trim_scale(private.finance_decimal(item.value))||'%',
   'total',item.expected_amount,
   'lines',jsonb_build_array(jsonb_build_object(
     'description',item.label,'quantity','1','unit','milestone',
     'rate',item.expected_amount,'amount',item.expected_amount)));
  INSERT INTO public.payment_requests(
   organization_id,contract_id,schedule_item_id,request_number,amount,
   due_date,note,document_snapshot,created_by
  ) VALUES(
   p_org,contract.id,item.id,number,item.expected_amount,item.due_date,
   'Automatically issued from signed quotation and certified project stages',
   snapshot,auth.uid())
  ON CONFLICT DO NOTHING RETURNING id INTO request_id;
  IF request_id IS NOT NULL THEN
   issued_count:=issued_count+1;
   PERFORM private.crm_audit(p_org,'payment_request.issued_after_stage_certification',
      'payment_requests',request_id);
  END IF;
 END LOOP;
 RETURN issued_count;
END;
$auto$;

REVOKE ALL ON FUNCTION private.certified_stage_payment_requests(uuid,uuid)
 FROM PUBLIC,anon,authenticated;

-- A confirmed quality certificate, NOT a visual stage-completed flag.
CREATE FUNCTION private.auto_payment_after_stage_clear()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $t$
BEGIN
 PERFORM private.certified_stage_payment_requests(new.organization_id,new.project_id);
 RETURN new;
END;
$t$;
CREATE TRIGGER auto_payment_after_stage_clear
 AFTER INSERT ON private.construction_stage_clearances
 FOR EACH ROW EXECUTE FUNCTION private.auto_payment_after_stage_clear();

-- If a legacy milestone is linked AFTER its final stage was certified, catch
-- up immediately. Never scan old projects during deployment/migration.
CREATE FUNCTION private.auto_payment_after_stage_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $t$
BEGIN
 IF new.record_kind='payment' THEN
  PERFORM private.certified_stage_payment_requests(new.organization_id,new.project_id);
 END IF;
 RETURN new;
END;
$t$;
CREATE TRIGGER auto_payment_after_stage_link
 AFTER INSERT ON private.construction_stage_record_links
 FOR EACH ROW EXECUTE FUNCTION private.auto_payment_after_stage_link();

-- Client sees only issued requests of its EXACT invited active project.
CREATE FUNCTION public.client_portal_stage_payment_requests(p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $f$
 SELECT CASE WHEN private.client_portal_accessible(p_project_id) THEN
 COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
   'id',req.id,'number',req.request_number,'label',i.label,
   'total',private.finance_decimal(req.amount),
   'date',req.issued_at::date,'dueDate',req.due_date,
   'paymentStatus','payment_requested',
   'contractNumber',c.contract_number
  ) ORDER BY req.issued_at DESC,req.id DESC)
  FROM public.payment_requests req
  JOIN public.payment_schedule_items i
   ON i.id=req.schedule_item_id AND i.organization_id=req.organization_id
  JOIN public.contracts c
   ON c.id=req.contract_id AND c.organization_id=req.organization_id
  JOIN public.projects p ON p.id=c.project_id
   AND p.organization_id=c.organization_id
  WHERE p.id=p_project_id AND p.status='active'
   AND NOT p.is_sales_prospect AND NOT p.removed_from_workspace
   AND req.status='issued'
 ),'[]'::jsonb)
 ELSE NULL END;
$f$;

CREATE FUNCTION public.client_portal_stage_request_read(
 p_project_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $f$
BEGIN
 IF NOT private.client_portal_accessible(p_project_id) THEN
  RAISE EXCEPTION 'Only this project client can read payment requests'
   USING ERRCODE='42501'; END IF;
 RETURN (SELECT req.document_snapshot
  FROM public.payment_requests req
  JOIN public.contracts c ON c.id=req.contract_id
   AND c.organization_id=req.organization_id
  JOIN public.projects p ON p.id=c.project_id
   AND p.organization_id=c.organization_id
  WHERE p.id=p_project_id AND req.id=p_request_id AND req.status='issued'
   AND p.status='active' AND NOT p.is_sales_prospect
   AND NOT p.removed_from_workspace);
END;
$f$;
REVOKE ALL ON FUNCTION public.client_portal_stage_payment_requests(uuid),
 public.client_portal_stage_request_read(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_stage_payment_requests(uuid),
 public.client_portal_stage_request_read(uuid,uuid) TO authenticated;
COMMIT;
