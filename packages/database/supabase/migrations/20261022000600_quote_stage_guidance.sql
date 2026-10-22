-- Quote-specific material/report planning is frozen at agreement handoff.
-- Work and required QC arrays stay on canonical construction_project_stages.
-- No second project workflow or payment schedule is introduced.
create table if not exists private.project_stage_guidance (
 organization_id uuid not null,
 project_id uuid not null,
 stage_id uuid not null,
 revision_id uuid not null references public.quotation_revisions(id),
 materials jsonb not null default '[]'::jsonb
  check(jsonb_typeof(materials)='array' and jsonb_array_length(materials)<=50),
 reports jsonb not null default '[]'::jsonb
  check(jsonb_typeof(reports)='array' and jsonb_array_length(reports)<=50),
 created_at timestamptz not null default now(),
 primary key(organization_id,project_id,stage_id),
 foreign key(organization_id,project_id,stage_id)
  references private.construction_project_stages(organization_id,project_id,id) on delete cascade
);

create or replace function public.project_quote_stage_guidance_import(
 p_org uuid,p_contract uuid
) returns jsonb language plpgsql security definer set search_path='' as $f$
declare c public.contracts;rev public.quotation_revisions;
 v_raw text;v_json jsonb;v_stages jsonb;v_item record;v_stage uuid;v_count integer:=0;
begin
 select * into c from public.contracts where id=p_contract and organization_id=p_org;
 if c.id is null or c.status in ('cancelled','closed') then
  raise exception 'Accepted project agreement required' using errcode='42501';end if;
 if not (private.construction_can_manage(p_org,c.project_id)
   or (c.created_by=auth.uid() and private.finance_access(p_org,'contract.create'))) then
  raise exception 'Only agreement creator or project manager may import stage guidance' using errcode='42501';end if;
 select * into rev from public.quotation_revisions where id=c.revision_id and organization_id=p_org
   and status in('issued','superseded');
 if rev.id is null or
   not exists(select 1 from private.construction_project_stages
     where project_id=c.project_id and organization_id=p_org) then
  raise exception 'Approved quotation stage snapshot required' using errcode='42501';end if;
 v_raw=split_part(split_part(coalesce(rev.terms,''),'[STAGE_CUSTOM_REQUIREMENTS]',2),
   '[/STAGE_CUSTOM_REQUIREMENTS]',1);
 if v_raw='' then return jsonb_build_object('imported',0);end if;
 if length(v_raw)>7500 then raise exception 'Invalid customization size' using errcode='22023';end if;
 v_json=v_raw::jsonb;
 if jsonb_typeof(v_json) is distinct from 'object' or
  v_json->>'version' is distinct from '1' or
  jsonb_typeof(v_json->'stages') is distinct from 'object' or
  (v_json-array['version','stages'])<>'{}'::jsonb then
  raise exception 'Invalid frozen quotation requirements' using errcode='22023';end if;
 v_stages=v_json->'stages';
 if (select count(*) from jsonb_object_keys(v_stages))>35 then
  raise exception 'Too many stage overrides' using errcode='22023';end if;
 for v_item in select key,value from jsonb_each(v_stages) loop
  if jsonb_typeof(v_item.value) is distinct from 'object' or
   (v_item.value-array['work','materials','checks','reports'])<>'{}'::jsonb or
   jsonb_typeof(v_item.value->'materials') is distinct from 'array' or
   jsonb_array_length(v_item.value->'materials')>50 or
   jsonb_typeof(v_item.value->'reports') is distinct from 'array' or
   jsonb_array_length(v_item.value->'reports')>50 or
   exists(select 1 from jsonb_array_elements(v_item.value->'materials') x
     where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>180) or
   exists(select 1 from jsonb_array_elements(v_item.value->'reports') x
     where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>180)
  then raise exception 'Invalid project-specific material or report' using errcode='22023';end if;
  select id into v_stage from private.construction_project_stages
   where organization_id=p_org and project_id=c.project_id
    and instance_code=v_item.key;
  if v_stage is null then raise exception 'Quotation references unrecognized stage' using errcode='23514';end if;
  insert into private.project_stage_guidance(
    organization_id,project_id,stage_id,revision_id,materials,reports)
   values(p_org,c.project_id,v_stage,rev.id,v_item.value->'materials',v_item.value->'reports')
   on conflict(organization_id,project_id,stage_id) do nothing;
  v_count=v_count+1;
 end loop;
 return jsonb_build_object('imported',v_count);
end
$f$;

create or replace function public.project_stage_guidance_read(p_org uuid,p_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if not private.site_access(p_org,p_project) or
   not private.site_allowed(p_org,p_project,array['manager','site_engineer','procurement','quality_inspector'])
 then raise exception 'Stage guidance unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'stage_id',g.stage_id,'materials',g.materials,'reports',g.reports) order by g.stage_id)
   from private.project_stage_guidance g
   where g.organization_id=p_org and g.project_id=p_project),'[]'::jsonb);
end
$f$;

revoke all on function public.project_quote_stage_guidance_import(uuid,uuid) from public,anon;
revoke all on function public.project_stage_guidance_read(uuid,uuid) from public,anon;
grant execute on function public.project_quote_stage_guidance_import(uuid,uuid) to authenticated;
grant execute on function public.project_stage_guidance_read(uuid,uuid) to authenticated;

-- Maintain the full explicit owner-only test-reset table allowlist.
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
  'private.construction_stage_execution'::regclass,
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
  'private.project_stage_activity_progress'::regclass,
  'private.project_stage_guidance'::regclass,
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

