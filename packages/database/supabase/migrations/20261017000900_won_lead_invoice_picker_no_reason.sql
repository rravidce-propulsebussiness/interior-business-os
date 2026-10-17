-- A Won lead must be selectable for billing even before project conversion and
-- without an accepted/stage-planned quotation. No new customer/project is created.
-- Only an authorized invoice creator can read Won lead options or save linked drafts.
CREATE TABLE private.gst_won_lead_invoice_links (
  invoice_id uuid PRIMARY KEY REFERENCES private.gst_business_documents(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gst_won_lead_invoice_lead_idx
  ON private.gst_won_lead_invoice_links(organization_id,lead_id);
ALTER TABLE private.gst_won_lead_invoice_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.gst_won_lead_invoice_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.gst_won_lead_invoice_links FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gst_invoice_customer_options(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM private.finance_require_read(p_org,'invoice.create');
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(t)) FROM (
      SELECT * FROM (
        SELECT c.id,c.display_name,c.legal_name,c.phone,c.email,
               c.tax_identifier,c.billing_address,
               NULL::uuid AS won_lead_id,NULL::text AS won_lead_number
        FROM public.customers c
        WHERE c.organization_id=p_org AND c.status='active'
          AND c.is_sales_prospect=false
        UNION ALL
        SELECT l.id,l.name,COALESCE(linked.legal_name,NULL::text),
               l.phone,l.email,linked.tax_identifier,
               COALESCE(linked.billing_address,l.site_address),
               l.id AS won_lead_id,l.lead_number AS won_lead_number
        FROM public.leads l
        LEFT JOIN LATERAL (
          SELECT c.legal_name,c.tax_identifier,c.billing_address
          FROM private.lead_quotation_links lk
          JOIN public.quotations q ON q.id=lk.quotation_id AND q.organization_id=p_org
          JOIN public.customers c ON c.id=q.customer_id AND c.organization_id=p_org
          WHERE lk.lead_id=l.id AND lk.organization_id=p_org AND c.status='active'
          ORDER BY q.created_at DESC,q.id DESC LIMIT 1
        ) linked ON true
        WHERE l.organization_id=p_org AND l.lifecycle='won'
          AND l.converted_customer_id IS NULL
      ) pool
      ORDER BY display_name,id
      LIMIT 1000
    ) t
  ),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.gst_invoice_customer_options(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_invoice_customer_options(uuid) TO authenticated;

CREATE FUNCTION public.gst_won_lead_invoice_context(p_org uuid,p_invoice uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
BEGIN
  PERFORM private.finance_require_read(p_org,'invoice.view');
  RETURN (
    SELECT lk.lead_id
    FROM private.gst_won_lead_invoice_links lk
    JOIN private.gst_business_documents doc ON doc.id=lk.invoice_id
      AND doc.organization_id=p_org
    WHERE lk.organization_id=p_org AND lk.invoice_id=p_invoice
  );
END;
$$;
REVOKE ALL ON FUNCTION public.gst_won_lead_invoice_context(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_won_lead_invoice_context(uuid,uuid) TO authenticated;

CREATE FUNCTION public.gst_won_lead_invoice_save(p_org uuid,p_input jsonb,p_lead uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE saved_id uuid; current_id uuid;
BEGIN
  PERFORM private.finance_require(p_org,'invoice.create');
  IF p_lead IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
     OR p_input->>'kind'<>'sales_invoice' THEN
    RAISE EXCEPTION 'A Won lead and sales invoice are required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.leads l
    WHERE l.id=p_lead AND l.organization_id=p_org AND l.lifecycle='won'
  ) THEN
    RAISE EXCEPTION 'Select a Won lead belonging to this company' USING ERRCODE='22023';
  END IF;
  current_id:=NULLIF(p_input->>'id','')::uuid;
  IF current_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM private.gst_stage_invoice_links x
        WHERE x.invoice_id=current_id AND x.organization_id=p_org)
    OR EXISTS (SELECT 1 FROM private.gst_customer_invoice_links x
        WHERE x.invoice_id=current_id AND x.organization_id=p_org)
  ) THEN
    RAISE EXCEPTION 'This invoice is linked to another billing source' USING ERRCODE='22023';
  END IF;
  saved_id:=public.gst_document_with_template_save(p_org,p_input,NULL);
  INSERT INTO private.gst_won_lead_invoice_links(invoice_id,organization_id,lead_id)
  VALUES(saved_id,p_org,p_lead)
  ON CONFLICT(invoice_id) DO UPDATE
    SET lead_id=excluded.lead_id;
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.gst_won_lead_invoice_save(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_won_lead_invoice_save(uuid,jsonb,uuid) TO authenticated;

-- Prevent a Won-linked document being silently reassigned to a generic
-- customer through the existing save RPC. The user must use a new invoice.
CREATE OR REPLACE FUNCTION public.gst_customer_invoice_save(
  p_org uuid,p_input jsonb,p_customer uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE saved_id uuid; existing_id uuid;
BEGIN
  PERFORM private.finance_require(p_org,'invoice.create');
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object'
    OR p_input->>'kind'<>'sales_invoice' THEN
    RAISE EXCEPTION 'A sales invoice is required' USING ERRCODE='22023';
  END IF;
  existing_id:=NULLIF(p_input->>'id','')::uuid;
  IF existing_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM private.gst_stage_invoice_links s WHERE s.invoice_id=existing_id AND s.organization_id=p_org)
    OR EXISTS (SELECT 1 FROM private.gst_won_lead_invoice_links w WHERE w.invoice_id=existing_id AND w.organization_id=p_org)
  ) THEN
    RAISE EXCEPTION 'This invoice is linked to another billing source' USING ERRCODE='22023';
  END IF;
  IF p_customer IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.customers c WHERE c.id=p_customer
      AND c.organization_id=p_org AND c.status='active' AND c.is_sales_prospect=false
  ) THEN
    RAISE EXCEPTION 'Choose an active client from this company' USING ERRCODE='22023';
  END IF;
  saved_id:=public.gst_document_with_template_save(p_org,p_input,NULL);
  IF p_customer IS NOT NULL THEN
    INSERT INTO private.gst_customer_invoice_links(invoice_id,organization_id,customer_id)
    VALUES(saved_id,p_org,p_customer)
    ON CONFLICT(invoice_id) DO UPDATE SET customer_id=excluded.customer_id,updated_at=now();
  ELSE
    DELETE FROM private.gst_customer_invoice_links x
    WHERE x.invoice_id=saved_id AND x.organization_id=p_org;
  END IF;
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.gst_customer_invoice_save(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gst_customer_invoice_save(uuid,jsonb,uuid) TO authenticated;

-- The existing CRM permission checks and lost-reason requirement remain.
CREATE OR REPLACE FUNCTION public.crm_command(p_organization_id uuid, p_action text, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<command_state>>
declare org uuid=p_organization_id;l public.leads;s public.crm_pipeline_stages;f public.lead_followups;v public.site_visits;target uuid=(p_input->>'id')::uuid;permission text;status text;
begin
 perform 1 from public.organizations where id=org for update;
 permission=case p_action when 'assign' then 'lead.assign' when 'stage' then 'lead.manage' when 'archive' then 'lead.manage' when 'followup' then 'crm.followup.manage' when 'visit' then 'crm.site_visit.manage' else null end;
 if permission is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>16000 then raise exception 'Invalid command' using errcode='22023';end if;
 perform private.crm_require(org,permission);
 if p_action in ('assign','stage','archive') then
  select * into l from public.leads where organization_id=org and id=target;
  if l.id is null then raise exception 'Unavailable lead' using errcode='42501';end if;
  if l.version is distinct from (p_input->>'version')::integer then raise exception 'Stale lead' using errcode='40001';end if;
  if l.lifecycle='archived' then raise exception 'Archived lead' using errcode='22023';end if;
  if p_action='assign' then
   perform private.crm_assignee(org,(p_input->>'assigned_to')::uuid,l.branch_id);
   update public.leads set assigned_to=(p_input->>'assigned_to')::uuid,version=version+1 where id=l.id;
   perform private.crm_event(org,l.id,'assignment_change','Lead reassigned');
  elsif p_action='archive' then update public.leads set lifecycle='archived',version=version+1 where id=l.id;perform private.crm_event(org,l.id,'system','Lead archived');
  else
   select * into s from public.crm_pipeline_stages where organization_id=org and id=(p_input->>'stage_id')::uuid and active;
   if s.id is null then raise exception 'Unavailable stage' using errcode='22023';end if;
   if s.outcome='lost' and not exists(select 1 from public.crm_lost_reasons where organization_id=org and id=(p_input->>'lost_reason_id')::uuid and active) then raise exception 'Lost reason required' using errcode='22023';end if;
   if s.outcome='won' then perform private.crm_require(org,'lead.win');end if;
   update public.leads set stage_id=s.id,stage_entered_at=now(),lifecycle=s.outcome,version=version+1,outcome_note=coalesce(p_input->>'note',''),lost_reason_id=case when s.outcome='lost' then (p_input->>'lost_reason_id')::uuid end,lost_at=case when s.outcome='lost' then now() else lost_at end,lost_by=case when s.outcome='lost' then auth.uid() else lost_by end,won_at=case when s.outcome='won' then now() else won_at end,won_by=case when s.outcome='won' then auth.uid() else won_by end where id=l.id;
   perform private.crm_event(org,l.id,case when s.outcome='lost' then 'lost_reason' else 'stage_change' end,'Stage changed to '||s.name,jsonb_build_object('stage_id',s.id,'outcome',s.outcome,'reason_id',p_input->>'lost_reason_id','note',left(coalesce(p_input->>'note',''),1000)));
  end if;
  perform private.crm_audit(org,case when p_action='assign' then 'lead.assigned' when p_action='archive' then 'lead.archived' when s.outcome='lost' then 'lead.marked_lost' else 'lead.stage_changed' end,'leads',l.id);
 elsif p_action='followup' then
  select * into f from public.lead_followups where organization_id=org and id=target;
  status=p_input->>'status';
  if f.id is null then raise exception 'Unavailable follow-up' using errcode='42501';end if;
  if status not in ('completed','cancelled') or status is null then raise exception 'Invalid status' using errcode='22023';end if;
  if f.status=status then return f.id;end if;
  if f.status<>'pending' or f.version is distinct from (p_input->>'version')::integer then raise exception 'Stale follow-up' using errcode='40001';end if;
  update public.lead_followups set status=command_state.status,completed_at=now(),completed_by=auth.uid(),outcome=coalesce(p_input->>'outcome',''),version=version+1 where id=f.id;
  update public.leads set next_follow_up_at=(select min(due_at) from public.lead_followups where lead_id=f.lead_id and lead_followups.status='pending'),version=version+1 where id=f.lead_id;
  perform private.crm_event(org,f.lead_id,'follow_up','Follow-up '||status,jsonb_build_object('followup_id',f.id));perform private.crm_audit(org,'followup.'||status,'lead_followups',f.id);
 else
  select * into v from public.site_visits where organization_id=org and id=target;
  if v.id is null then raise exception 'Unavailable visit' using errcode='42501';end if;
  status=p_input->>'status';
  if status is null or status not in ('completed','cancelled','rescheduled') then raise exception 'Invalid status' using errcode='22023';end if;
  if v.version is distinct from (p_input->>'version')::integer or v.status in ('completed','cancelled') then raise exception 'Stale visit' using errcode='40001';end if;
  if status='rescheduled' and p_input->>'scheduled_at' is null then raise exception 'New date required' using errcode='22023';end if;
  update public.site_visits set status=command_state.status,scheduled_at=coalesce((p_input->>'scheduled_at')::timestamptz,v.scheduled_at),notes=coalesce(p_input->>'notes',v.notes),outcome=coalesce(p_input->>'outcome',''),completed_at=case when command_state.status='completed' then now() end,version=version+1 where id=v.id;
  perform private.crm_event(org,v.lead_id,'site_visit','Site visit '||status,jsonb_build_object('visit_id',v.id));perform private.crm_audit(org,'site_visit.'||status,'site_visits',v.id);
 end if;
 return target;
end$function$;
