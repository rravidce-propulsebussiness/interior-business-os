-- Private implementation tables are accessed through checked RPCs, not direct
-- PostgREST table reads or writes. Keep direct application roles denied even if
-- table grants are added accidentally in the future. SECURITY DEFINER RPCs and
-- the trusted service role retain their existing access paths.
DO $migration$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'lead_number_sequences',
    'quotation_number_sequences',
    'finance_sequences',
    'construction_stage_execution',
    'project_stage_activity_progress',
    'automation_scheduler_cursor',
    'automation_email_payloads',
    'automation_event_catalog',
    'quotation_signing_keys',
    'brochure_form_limits',
    'project_work_item_events',
    'project_curing_plans',
    'website_asset_data',
    'role_templates',
    'provisioning_defaults',
    'quotation_public_limits',
    'project_preflight',
    'brochure_metrics',
    'project_advance_proformas',
    'report_sources',
    'project_stage_optional_items',
    'website_form_limits',
    'project_stage_guidance',
    'role_template_permissions',
    'website_build_keys',
    'automation_entities',
    'quotation_receipts',
    'automation_worker_health',
    'automation_scan_state',
    'website_metrics',
    'brochure_pdfs',
    'quotation_share_secrets'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON private.%I AS RESTRICTIVE FOR ALL TO anon, authenticated, business_os_worker USING (false) WITH CHECK (false)',
      'deny_direct_access_' || table_name,
      table_name
    );
  END LOOP;
END;
$migration$;
