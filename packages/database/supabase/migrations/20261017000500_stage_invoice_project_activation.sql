-- Link GST sales invoices to agreed quotation stage payments and activate an
-- existing quotation prospect project only when its first stage invoice issues.
-- Requires 20261017000400_gst_readonly_authorization.sql.
CREATE TABLE private.gst_stage_invoice_links (
  invoice_id uuid PRIMARY KEY REFERENCES private.gst_business_documents(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  revision_id uuid NOT NULL REFERENCES public.quotation_revisions(id),
  stage_number integer NOT NULL CHECK (stage_number BETWEEN 1 AND 40),
  stage_base_amount numeric(16,2) NOT NULL CHECK (stage_base_amount > 0),
  project_id uuid REFERENCES public.projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,invoice_id)
);
CREATE INDEX gst_stage_invoice_lead ON private.gst_stage_invoice_links(organization_id,lead_id,revision_id,stage_number);
ALTER TABLE private.gst_stage_invoice_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gst_stage_invoice_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.gst_stage_invoice_links FROM PUBLIC,anon,authenticated;

-- Parse the SAVED quotation terms (not unsaved template suggestions). Use
-- integer paise rounding and allocate the remainder to the final stage.
CREATE FUNCTION private.gst_invoice_quoted_stage(p_org uuid,p_rev uuid,p_stage integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 r public.quotation_revisions;
 block text; lines text[]; line text; halves text[];
 total numeric; pct numeric; sum_pct numeric:=0; distributed numeric:=0;
 i integer; number_of_stages integer; requested_name text:=''; requested_pct numeric:=0;
 computed numeric; expected numeric:=0;
BEGIN
 SELECT * INTO r FROM public.quotation_revisions WHERE id=p_rev AND organization_id=p_org;
 IF r.id IS NULL OR r.totals IS NULL
   OR (r.totals->>'final_amount') !~ '^[0-9]+(\.[0-9]{1,2})?$'
 THEN RAISE EXCEPTION 'Quotation unavailable or total invalid' USING ERRCODE='22023'; END IF;
 total := (r.totals->>'final_amount')::numeric;
 IF total <= 0 OR total > 999999999999.99 THEN
   RAISE EXCEPTION 'Invalid agreed quotation total' USING ERRCODE='22023'; END IF;
 IF strpos(r.terms,'[STAGE_PAYMENT_PLAN]')=0
   OR strpos(r.terms,'[/STAGE_PAYMENT_PLAN]')=0 THEN
   RAISE EXCEPTION 'Save the quotation payment schedule first' USING ERRCODE='22023'; END IF;
 block:=btrim(split_part(split_part(r.terms,'[STAGE_PAYMENT_PLAN]',2),'[/STAGE_PAYMENT_PLAN]',1),E' \r\n\t');
 lines:=regexp_split_to_array(block,E'\r?\n');
 number_of_stages:=coalesce(array_length(lines,1),0);
 IF number_of_stages NOT BETWEEN 1 AND 40
   OR p_stage IS NULL OR p_stage NOT BETWEEN 1 AND number_of_stages
 THEN RAISE EXCEPTION 'Invalid payment milestone' USING ERRCODE='22023'; END IF;
 FOR i IN 1..number_of_stages LOOP
   line:=btrim(lines[i]);
   halves:=string_to_array(line,'|');
   IF coalesce(array_length(halves,1),0)<>2
     OR length(btrim(halves[1])) NOT BETWEEN 2 AND 100
     OR btrim(halves[2]) !~ '^[0-9]+(\.[0-9]{1,2})?$'
   THEN RAISE EXCEPTION 'Invalid saved payment plan' USING ERRCODE='22023';END IF;
   pct:=btrim(halves[2])::numeric;
   IF pct<=0 OR pct>100 THEN RAISE EXCEPTION 'Invalid payment percentage' USING ERRCODE='22023'; END IF;
   sum_pct:=sum_pct+pct;
   computed:=CASE WHEN i=number_of_stages THEN total-distributed
             ELSE round(total*pct/100,2) END;
   distributed:=distributed+computed;
   IF i=p_stage THEN
     requested_name:=btrim(halves[1]);requested_pct:=pct;expected:=computed;
   END IF;
 END LOOP;
 IF abs(sum_pct-100)>0.001 OR expected<=0 OR expected>999999999999.99 THEN
   RAISE EXCEPTION 'Invalid payment schedule allocation' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('name',requested_name,'percent',requested_pct,
                          'expected',expected,'quoteTotal',total);
END;
$$;
REVOKE ALL ON FUNCTION private.gst_invoice_quoted_stage(uuid,uuid,integer) FROM PUBLIC;

-- Only approved, linked, won leads may be used for stage invoicing.
CREATE FUNCTION public.gst_stage_invoice_options(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 PERFORM private.finance_require_read(p_org,'invoice.create');
 IF NOT private.has_permission(p_org,'lead.view') THEN
   RAISE EXCEPTION 'Lead access required' USING ERRCODE='42501';END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (
   SELECT DISTINCT ON (l.id)
     l.id AS "leadId",l.lead_number AS "leadNumber",
     l.name AS "leadName",l.site_address AS "siteAddress",
     l.service_type AS "serviceType",l.converted_project_id AS "convertedProjectId",
     q.customer_id AS "customerId",q.project_id AS "projectId",
     p.name AS "projectName",p.project_type AS "projectType",
     c.display_name AS "clientName",c.tax_identifier AS "clientGstin",
     c.billing_address AS "billingAddress",
     r.id AS "revisionId",q.id AS "quotationId",
     q.quotation_number AS "quoteNumber",r.terms,r.totals,
     l.won_at AS "wonAt"
   FROM public.leads l
   JOIN private.lead_quotation_links lk
     ON lk.organization_id=l.organization_id AND lk.lead_id=l.id
   JOIN public.quotations q
     ON q.id=lk.quotation_id AND q.organization_id=p_org
   JOIN public.quotation_revisions r
     ON r.id=q.current_revision_id AND r.organization_id=p_org
   JOIN public.quotation_customer_responses a
     ON a.revision_id=r.id AND a.organization_id=p_org AND a.action='approved'
   JOIN public.projects p
     ON p.id=q.project_id AND p.organization_id=p_org AND p.status='active'
   JOIN public.customers c
     ON c.id=q.customer_id AND c.organization_id=p_org AND c.status='active'
   WHERE l.organization_id=p_org AND l.lifecycle='won'
     AND q.status<>'cancelled'
     AND r.terms LIKE '%[STAGE_PAYMENT_PLAN]%'
     AND r.terms LIKE '%[/STAGE_PAYMENT_PLAN]%'
     AND (l.converted_project_id IS NULL OR l.converted_project_id=q.project_id)
   ORDER BY l.id,a.responded_at DESC,r.created_at DESC
   LIMIT 100
 ) t),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.gst_stage_invoice_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_stage_invoice_options(uuid) TO authenticated;

CREATE FUNCTION public.gst_stage_invoice_context(p_org uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
 PERFORM private.finance_require_read(p_org,'invoice.view');
 RETURN (SELECT jsonb_build_object('leadId',lk.lead_id,'revisionId',lk.revision_id,
   'stageNumber',lk.stage_number,'stageBaseAmount',lk.stage_base_amount,
   'projectId',lk.project_id)
 FROM private.gst_stage_invoice_links lk
 JOIN private.gst_business_documents d
   ON d.id=lk.invoice_id AND d.organization_id=p_org
 WHERE lk.organization_id=p_org AND lk.invoice_id=p_invoice);
END;
$$;
REVOKE ALL ON FUNCTION public.gst_stage_invoice_context(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_stage_invoice_context(uuid,uuid) TO authenticated;

CREATE FUNCTION public.gst_stage_invoice_save(
 p_org uuid,p_input jsonb,p_lead uuid,p_revision uuid,p_stage integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 l public.leads; q public.quotations; stage jsonb;
 current_id uuid; other private.gst_stage_invoice_links;
 first_line jsonb; base numeric; invoice_id uuid;
BEGIN
 PERFORM private.finance_require(p_org,'invoice.create');
 IF NOT private.has_permission(p_org,'lead.view')
   OR NOT private.has_permission(p_org,'lead.convert')
   OR NOT private.commercial_access(p_org,'project.view','projects')
 THEN RAISE EXCEPTION 'Project and lead permissions required' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM public.leads WHERE id=p_lead AND organization_id=p_org;
 IF l.id IS NULL OR l.lifecycle<>'won' THEN
   RAISE EXCEPTION 'A won lead is required' USING ERRCODE='22023';END IF;
 SELECT q.* INTO q FROM public.quotations q
 JOIN private.lead_quotation_links lk
   ON lk.quotation_id=q.id AND lk.organization_id=q.organization_id AND lk.lead_id=p_lead
 JOIN public.quotation_customer_responses response
   ON response.revision_id=p_revision AND response.organization_id=p_org AND response.action='approved'
 WHERE q.organization_id=p_org AND q.current_revision_id=p_revision
   AND q.status<>'cancelled'
   AND (l.converted_project_id IS NULL OR l.converted_project_id=q.project_id)
 ORDER BY lk.created_at DESC LIMIT 1;
 IF q.id IS NULL THEN
   RAISE EXCEPTION 'Select an approved quotation belonging to this won lead' USING ERRCODE='22023';END IF;
 stage:=private.gst_invoice_quoted_stage(p_org,p_revision,p_stage);
 IF p_input->>'kind'<>'sales_invoice' OR p_input ? 'marketplaceOrderId' THEN
   RAISE EXCEPTION 'Stage payments require a sales invoice' USING ERRCODE='22023';END IF;
 first_line:=p_input->'lines'->0;
 IF first_line IS NULL OR jsonb_typeof(first_line)<>'object'
   OR (first_line->>'quantity')::numeric<>1
   OR coalesce((first_line->>'discount')::numeric,0)<>0
   OR btrim(coalesce(first_line->>'description',''))<>('Stage payment - '||(stage->>'name'))
   OR (first_line->>'unitPrice')::numeric<=0
   OR (first_line->>'unitPrice')::numeric>(stage->>'expected')::numeric
 THEN RAISE EXCEPTION 'Stage line must match the agreed milestone' USING ERRCODE='22023';END IF;
 base:=(first_line->>'unitPrice')::numeric;
 IF base <>round(base,2) THEN RAISE EXCEPTION 'Stage amount must use paise precision' USING ERRCODE='22023';END IF;
 IF p_input ? 'id' THEN
   current_id:=(p_input->>'id')::uuid;
   SELECT * INTO other FROM private.gst_stage_invoice_links WHERE invoice_id=current_id FOR UPDATE;
   IF other.invoice_id IS NOT NULL
     AND (other.organization_id<>p_org OR other.lead_id<>p_lead OR other.revision_id<>p_revision)
   THEN RAISE EXCEPTION 'Cannot change the originating lead or quotation' USING ERRCODE='42501';END IF;
 END IF;
 invoice_id:=public.gst_document_save(p_org,p_input);
 INSERT INTO private.gst_stage_invoice_links(invoice_id,organization_id,lead_id,revision_id,stage_number,stage_base_amount)
 VALUES(invoice_id,p_org,p_lead,p_revision,p_stage,base)
 ON CONFLICT(invoice_id) DO UPDATE
 SET stage_number=excluded.stage_number,stage_base_amount=excluded.stage_base_amount;
 RETURN invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.gst_stage_invoice_save(uuid,jsonb,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_stage_invoice_save(uuid,jsonb,uuid,uuid,integer) TO authenticated;

-- Called from the existing trusted finalizer in the SAME transaction:
-- a failure rolls back issuance and the invoice number allocation.
CREATE FUNCTION private.gst_stage_invoice_after_issue(p_org uuid,p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
 link private.gst_stage_invoice_links;
 d private.gst_business_documents; l public.leads; q public.quotations;
 stage jsonb; paid_base numeric; previous_base numeric;
 conversion jsonb; selected_project uuid; prospect_name text;
BEGIN
 SELECT * INTO link FROM private.gst_stage_invoice_links
 WHERE organization_id=p_org AND invoice_id=p_invoice FOR UPDATE;
 IF link.invoice_id IS NULL THEN RETURN;END IF;
 SELECT * INTO d FROM private.gst_business_documents
 WHERE organization_id=p_org AND id=p_invoice;
 IF d.kind<>'sales_invoice' OR d.status<>'issued' THEN
   RAISE EXCEPTION 'Stage invoice must be issued' USING ERRCODE='22023';END IF;
 SELECT * INTO l FROM public.leads
 WHERE id=link.lead_id AND organization_id=p_org FOR UPDATE;
 IF l.id IS NULL OR l.lifecycle<>'won' THEN
   RAISE EXCEPTION 'Lead is not closed-won' USING ERRCODE='22023';END IF;
 SELECT q.* INTO q FROM public.quotations q
 JOIN private.lead_quotation_links lk ON lk.quotation_id=q.id
   AND lk.lead_id=l.id AND lk.organization_id=p_org
 JOIN public.quotation_customer_responses a ON a.revision_id=link.revision_id
   AND a.organization_id=p_org AND a.action='approved'
 WHERE q.organization_id=p_org AND q.current_revision_id=link.revision_id
   AND q.status<>'cancelled' LIMIT 1;
 IF q.id IS NULL THEN
   RAISE EXCEPTION 'Accepted quotation changed' USING ERRCODE='22023';END IF;
 stage:=private.gst_invoice_quoted_stage(p_org,link.revision_id,link.stage_number);
 IF btrim(coalesce(d.lines->0->>'description',''))<>'Stage payment - '||(stage->>'name')
   OR (d.lines->0->>'quantity')::numeric<>1
   OR (d.lines->0->>'unitPrice')::numeric<>link.stage_base_amount
 THEN RAISE EXCEPTION 'Stage invoice amount changed after saving' USING ERRCODE='22023';END IF;
 SELECT coalesce(sum(other.stage_base_amount),0) INTO previous_base
 FROM private.gst_stage_invoice_links other
 JOIN private.gst_business_documents issued ON issued.id=other.invoice_id
 WHERE other.organization_id=p_org AND other.revision_id=link.revision_id
   AND other.stage_number=link.stage_number AND other.invoice_id<>p_invoice
   AND issued.status='issued';
 IF previous_base+link.stage_base_amount>(stage->>'expected')::numeric THEN
   RAISE EXCEPTION 'Stage invoice exceeds the quotation milestone' USING ERRCODE='22023';END IF;
 SELECT name INTO prospect_name FROM public.projects
 WHERE id=q.project_id AND organization_id=p_org AND status='active';
 IF prospect_name IS NULL THEN
   RAISE EXCEPTION 'Quotation project not available' USING ERRCODE='22023';END IF;
 conversion:=public.crm_convert(p_org,jsonb_build_object(
   'id',l.id,'version',l.version,'customer_id',q.customer_id,
   'project_id',q.project_id,'project_name',prospect_name
 ));
 selected_project:=(conversion->>'project_id')::uuid;
 IF selected_project IS DISTINCT FROM q.project_id THEN
   RAISE EXCEPTION 'Converted project does not match quotation' USING ERRCODE='22023';END IF;
 UPDATE public.projects SET is_sales_prospect=false
 WHERE id=selected_project AND organization_id=p_org;
 UPDATE public.customers SET is_sales_prospect=false
 WHERE id=q.customer_id AND organization_id=p_org;
 UPDATE private.gst_stage_invoice_links SET project_id=selected_project
 WHERE invoice_id=p_invoice;
 INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id)
 VALUES(auth.uid(),p_org,'gst.stage_invoice.project_linked','gst_document',p_invoice::text);
END;
$$;
REVOKE ALL ON FUNCTION private.gst_stage_invoice_after_issue(uuid,uuid) FROM PUBLIC;

-- Keep all original issuance conditions / snapshots / numbering / permissions.
-- Append the project link inside the existing function, not as a later,
-- separate server action that could partially fail or create duplicates.
DO $stage_guard$
DECLARE original text; signature oid;
BEGIN
 SELECT p.oid,pg_get_functiondef(p.oid) INTO signature,original
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='gst_document_finalize'
  AND pg_get_function_identity_arguments(p.oid)='p_org uuid, p_id uuid, p_version integer';
 IF original IS NULL OR position('return p_id;' in original)=0 THEN
   RAISE EXCEPTION 'GST finalizer signature changed; inspect manually';
 END IF;
 IF position('private.gst_stage_invoice_after_issue' in original)=0 THEN
   EXECUTE replace(original, 'return p_id;',
    'perform private.gst_stage_invoice_after_issue(p_org,p_id); return p_id;');
 END IF;
END;
$stage_guard$;

-- SQL assertions, do not silently deploy an unenforced "project on issue" UI.
DO $verified$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='gst_document_finalize'
   AND position('private.gst_stage_invoice_after_issue' in pg_get_functiondef(p.oid))>0
 ) THEN RAISE EXCEPTION 'Stage finalization hook missing'; END IF;
END;
$verified$;
