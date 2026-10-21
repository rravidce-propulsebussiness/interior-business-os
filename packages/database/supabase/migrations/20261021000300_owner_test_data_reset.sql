-- Reset TEST business records for ONE company. Does not reset login,
-- subscription, team, website, settings, package prices, external media or audit logs.
-- FK snapshot is an explicit allowlist: unexpected new children ABORT reset.
BEGIN;
CREATE OR REPLACE FUNCTION private.owner_test_reset_allowed(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $f$
 SELECT p_org IS NOT NULL AND auth.uid() IS NOT NULL
   AND private.has_permission(p_org,'organization.manage')
   AND EXISTS(SELECT 1 FROM public.organization_memberships m
     JOIN public.membership_roles mr ON mr.membership_id=m.id
      AND mr.organization_id=m.organization_id AND mr.branch_id IS NULL
     JOIN public.roles r ON r.id=mr.role_id AND r.organization_id=mr.organization_id
     WHERE m.organization_id=p_org AND m.user_id=auth.uid()
       AND m.status='active' AND m.branch_id IS NULL AND r.is_owner=true);
$f$;

-- Explicitly scoped exception to immutable execution triggers.
-- Outside an Owner-confirmed reset, original guard behavior is unchanged.
CREATE OR REPLACE FUNCTION private.execution_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a jsonb=to_jsonb(old);b jsonb=to_jsonb(new);r jsonb=case when tg_op='DELETE' then a else b end;parent_status text;parent_entity text;parent_column text;begin
 -- Exception only within a transaction confirmed by the Owner-only reset RPC.
 -- This GUC is checked alongside the authenticated Owner and exact tenant.
 if tg_op in ('DELETE','UPDATE') and
    pg_catalog.current_setting('business_os.test_reset_org',true)=r->>'organization_id'
    and private.owner_test_reset_allowed((r->>'organization_id')::uuid) then
   if tg_op='DELETE' then return old;end if;
   return new;
 end if;
 if tg_op='UPDATE' and (a->'id' is distinct from b->'id' or a->'organization_id' is distinct from b->'organization_id') then raise exception 'Stable execution identity required' using errcode='23514';end if;
 if tg_table_name in ('material_unit_conversions','goods_receipts','goods_receipt_items') then
 if tg_op<>'INSERT' then raise exception 'Append-only execution history' using errcode='23514';end if;return new;end if;
 if tg_table_name='material_cost_revisions' then
 if tg_op='DELETE' or tg_op='UPDATE' and (a-array['valid_until','version','updated_at'] is distinct from b-array['valid_until','version','updated_at'] or a->>'valid_until' is not null or b->>'valid_until' is null) then raise exception 'Cost revisions preserve history' using errcode='23514';end if;return new;end if;
 if tg_table_name in ('execution_estimate_scope_items','execution_estimate_lines','execution_estimate_line_costs') then parent_entity='execution_estimate_revisions';parent_column='revision_id';
 elsif tg_table_name in ('purchase_requisition_items','purchase_requisition_sources') then parent_entity='purchase_requisitions';parent_column='requisition_id';
 elsif tg_table_name in ('rfq_items','rfq_vendors') then parent_entity='rfqs';parent_column='rfq_id';
 elsif tg_table_name='vendor_quote_items' then parent_entity='vendor_quotes';parent_column='quote_id';
 elsif tg_table_name in ('purchase_order_items','purchase_order_costs','purchase_order_item_costs') then parent_entity='purchase_orders';parent_column='po_id';end if;
 if parent_entity is not null then
 if tg_op='UPDATE' and a->parent_column is distinct from b->parent_column then raise exception 'Stable execution parent required' using errcode='23514';end if;
 execute format('select status from public.%I where organization_id=$1 and id=$2 for update',parent_entity) into parent_status using (r->>'organization_id')::uuid,(r->>parent_column)::uuid;
 if parent_status is distinct from 'draft' then
 if tg_table_name='rfq_vendors' and tg_op='UPDATE' and a-array['response_status','updated_at'] is not distinct from b-array['response_status','updated_at'] and parent_status='issued' then return new;end if;
 raise exception 'Frozen execution lines' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;
 end if;
 if tg_op='DELETE' then raise exception 'Execution records cannot be deleted' using errcode='23514';end if;
 if tg_op='UPDATE' then
 if tg_table_name='execution_estimates' and a-array['next_revision','current_approved_revision_id','version','updated_at'] is distinct from b-array['next_revision','current_approved_revision_id','version','updated_at'] then raise exception 'Frozen estimate identity' using errcode='23514';end if;
 if tg_table_name='execution_estimate_revisions' and a->>'status'<>'draft' then
 if a-array['status','version','reviewed_by','approved_by','approved_at','decision_reason','updated_at'] is distinct from b-array['status','version','reviewed_by','approved_by','approved_at','decision_reason','updated_at'] or
 not(a->>'status'='under_review' and b->>'status' in ('draft','approved','cancelled') or a->>'status'='approved' and b->>'status'='superseded') then raise exception 'Frozen estimate revision' using errcode='23514';end if;
 elsif tg_table_name in ('purchase_requisitions','rfqs','vendor_quotes','purchase_orders') and a->>'status'<>'draft' then
 if a-array['status','version','approved_at','approved_by','decision_reason','cancel_reason','closed_at','updated_at'] is distinct from b-array['status','version','approved_at','approved_by','decision_reason','cancel_reason','closed_at','updated_at'] or a->>'status' in ('cancelled','closed','declined') then raise exception 'Frozen procurement document' using errcode='23514';end if;
 end if;end if;
 return new;
end$function$
;

CREATE OR REPLACE FUNCTION private.test_reset_targets()
RETURNS regclass[] LANGUAGE sql STABLE SET search_path=''
AS $f$ SELECT ARRAY[
  'private.automation_email_payloads'::regclass,
  'private.client_design_decisions'::regclass,
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
  'private.project_client_requests'::regclass,
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
]::regclass[] $f$;

CREATE OR REPLACE FUNCTION private.test_reset_counts(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE target regclass; n bigint; counts jsonb:='{}'::jsonb; missing_child text;
BEGIN
 SELECT fk.conrelid::regclass::text INTO missing_child
 FROM pg_catalog.pg_constraint fk
 JOIN pg_catalog.pg_class cls ON cls.oid=fk.conrelid
 JOIN pg_catalog.pg_namespace ns ON ns.oid=cls.relnamespace
 WHERE fk.contype='f' AND fk.confrelid=ANY(private.test_reset_targets())
   AND NOT fk.conrelid=ANY(private.test_reset_targets())
   AND ns.nspname IN('public','private') LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'Reset blocked by new dependent table %',missing_child
    USING ERRCODE='23503'; END IF;
 FOREACH target IN ARRAY private.test_reset_targets() LOOP
   IF target='private.automation_email_payloads'::regclass THEN
     SELECT count(*) INTO n FROM private.automation_email_payloads c
       JOIN public.email_deliveries p ON p.id=c.delivery_id WHERE p.organization_id=p_org;
   ELSIF target='private.gst_invoice_document_layouts'::regclass THEN
     SELECT count(*) INTO n FROM private.gst_invoice_document_layouts c
       JOIN private.gst_business_documents p ON p.id=c.document_id WHERE p.organization_id=p_org;
   ELSIF target='private.quotation_public_limits'::regclass THEN
     SELECT count(*) INTO n FROM private.quotation_public_limits c
       JOIN public.quotation_share_links p ON p.id=c.share_id WHERE p.organization_id=p_org;
   ELSIF target='private.quotation_share_secrets'::regclass THEN
     SELECT count(*) INTO n FROM private.quotation_share_secrets c
       JOIN public.quotation_share_links p ON p.id=c.share_id WHERE p.organization_id=p_org;
   ELSE
     EXECUTE format('SELECT count(*) FROM %s WHERE organization_id=$1',target)
       INTO n USING p_org;
   END IF;
   counts:=counts||jsonb_build_object(target::text,n);
 END LOOP;
 RETURN counts;
END;$f$;

CREATE OR REPLACE FUNCTION public.owner_test_data_reset_preview(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE counts jsonb; n bigint; company text;
BEGIN
 IF NOT private.owner_test_reset_allowed(p_org) THEN
   RAISE EXCEPTION 'Owner-only test data reset' USING ERRCODE='42501'; END IF;
 SELECT name INTO company FROM public.organizations WHERE id=p_org;
 IF company IS NULL THEN RAISE EXCEPTION 'Unknown company' USING ERRCODE='42501'; END IF;
 counts:=private.test_reset_counts(p_org);
 SELECT COALESCE(sum(value::bigint),0) INTO n FROM jsonb_each_text(counts);
 RETURN jsonb_build_object('company',company,'total',n,'counts',counts,
   'signature',md5(p_org::text||':'||counts::text),
   'required_phrase','RESET '||company);
END;$f$;

CREATE OR REPLACE FUNCTION public.owner_test_data_reset_execute(
 p_org uuid,p_phrase text,p_signature text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $f$
DECLARE
 v_preview jsonb; v_company text; target regclass; removed bigint;
 step_deleted bigint; remaining bigint; pass integer;
BEGIN
 IF NOT private.owner_test_reset_allowed(p_org) THEN
  RAISE EXCEPTION 'Owner-only test data reset' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_phrase,''))>220 OR length(coalesce(p_signature,''))<>32 THEN
  RAISE EXCEPTION 'Invalid confirmation' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtext('business_os_test_reset'),pg_catalog.hashtext(p_org::text));
 SELECT name INTO v_company FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF v_company IS NULL OR p_phrase IS DISTINCT FROM 'RESET '||v_company THEN
   RAISE EXCEPTION 'Type RESET followed by the exact company name'
     USING ERRCODE='22023'; END IF;
 v_preview:=public.owner_test_data_reset_preview(p_org);
 IF p_signature IS DISTINCT FROM v_preview->>'signature' THEN
   RAISE EXCEPTION 'Data changed. Refresh your reset preview before retrying'
     USING ERRCODE='40001'; END IF;
 -- All bypasses additionally verify this owner's membership and tenant.
 -- set_config(...,true) is local to this transaction (never global).
 PERFORM pg_catalog.set_config('business_os.test_reset_org',p_org::text,true);
 -- Break the three known circular relationships *inside this reset transaction*.
 -- Quotations -> current revision uses a deferrable FK; these two non-
 -- deferrable references are nullable and may be cleared before deletion.
 SET CONSTRAINTS ALL DEFERRED;
 UPDATE public.execution_estimates SET current_approved_revision_id=NULL
   WHERE organization_id=p_org AND current_approved_revision_id IS NOT NULL;
 UPDATE public.material_variants SET active_conversion_id=NULL
   WHERE organization_id=p_org AND active_conversion_id IS NOT NULL;
 -- Tenantless descendants: delete ONLY rows linked to this organization's parents.
 DELETE FROM private.automation_email_payloads c USING public.email_deliveries p
   WHERE c.delivery_id=p.id AND p.organization_id=p_org;
 DELETE FROM private.gst_invoice_document_layouts c USING private.gst_business_documents p
   WHERE c.document_id=p.id AND p.organization_id=p_org;
 DELETE FROM private.quotation_public_limits c USING public.quotation_share_links p
   WHERE c.share_id=p.id AND p.organization_id=p_org;
 DELETE FROM private.quotation_share_secrets c USING public.quotation_share_links p
   WHERE c.share_id=p.id AND p.organization_id=p_org;
 -- FK-aware retry. Unexpected cycles/triggers FAIL the entire transaction;
 -- never leave a partially emptied business workspace.
 FOR pass IN 1..150 LOOP
   step_deleted:=0;
   FOREACH target IN ARRAY private.test_reset_targets() LOOP
     IF target=ANY(ARRAY[
      'private.automation_email_payloads'::regclass,
      'private.gst_invoice_document_layouts'::regclass,
      'private.quotation_public_limits'::regclass,
      'private.quotation_share_secrets'::regclass]) THEN CONTINUE; END IF;
     BEGIN
       EXECUTE format('DELETE FROM %s WHERE organization_id=$1',target) USING p_org;
       GET DIAGNOSTICS removed=ROW_COUNT;
       step_deleted:=step_deleted+removed;
     EXCEPTION WHEN foreign_key_violation THEN
       NULL;
     END;
   END LOOP;
   SELECT COALESCE(sum(value::bigint),0) INTO remaining
     FROM jsonb_each_text(private.test_reset_counts(p_org));
   EXIT WHEN remaining=0;
   IF step_deleted=0 THEN
      RAISE EXCEPTION 'Deletion blocked by dependent data; entire reset rolled back'
       USING ERRCODE='23503'; END IF;
 END LOOP;
 IF remaining<>0 THEN
   RAISE EXCEPTION 'Reset incomplete; entire reset rolled back'
     USING ERRCODE='23503'; END IF;
 INSERT INTO public.audit_logs(actor_user_id,organization_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),p_org,'organization.test_data_reset','organization',p_org::text,
  jsonb_build_object('deleted_rows',(v_preview->>'total')::bigint));
 PERFORM pg_catalog.set_config('business_os.test_reset_org','',true);
 RETURN jsonb_build_object('success',true,'deleted_rows',(v_preview->>'total')::bigint);
END;$f$;

REVOKE ALL ON FUNCTION private.owner_test_reset_allowed(uuid),
 private.test_reset_targets(),private.test_reset_counts(uuid),
 public.owner_test_data_reset_preview(uuid),
 public.owner_test_data_reset_execute(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.owner_test_data_reset_preview(uuid),
 public.owner_test_data_reset_execute(uuid,text,text) TO authenticated;
COMMIT;
