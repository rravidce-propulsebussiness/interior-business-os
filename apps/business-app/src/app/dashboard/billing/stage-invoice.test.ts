import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { readFileSync } from 'node:fs';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';
import { invoiceStageChoices } from './stage-choices';
import { invoiceCustomerChoices } from './customer-choices';
import type { GstStageInvoiceOption } from '@business-os/database/gst';

const file = (p:string) => readFileSync(new URL(p,import.meta.url),'utf8');
const screen = file('./premium-sales-invoice.tsx');
const page = file('./new/page.tsx');
const actions = file('./actions.ts');
const migrations = file('../../../../../../packages/database/supabase/migrations/20261017000500_stage_invoice_project_activation.sql');
const customerMigration = file('../../../../../../packages/database/supabase/migrations/20261017000700_gst_existing_customer_link.sql');
const billingCustomersMigration = file('../../../../../../packages/database/supabase/migrations/20261017000800_invoice_client_options_and_save.sql');
const wonLeadMigration = file('../../../../../../packages/database/supabase/migrations/20261017000900_won_lead_invoice_picker_no_reason.sql');
const leadStage = file('../crm/leads/lead-inline-controls.tsx');
const conversionPage = file('../crm/leads/[id]/convert/page.tsx');
const inlineProject = file('../crm/leads/lead-project-action.tsx');
const projectAction = file('../crm/leads/lead-project-actions.ts');

const sample: GstStageInvoiceOption = {
  leadId:'00000000-0000-4000-8000-000000000001',leadNumber:'L-001',
  leadName:'Construction client',projectId:'00000000-0000-4000-8000-000000000002',
  convertedProjectId:null,projectName:'Villa project',projectType:'construction',
  serviceType:'construction',customerId:'00000000-0000-4000-8000-000000000003',
  clientName:'Construction client',clientGstin:null,billingAddress:null,
  revisionId:'00000000-0000-4000-8000-000000000004',
  quotationId:'00000000-0000-4000-8000-000000000005',
  quoteNumber:'Q-01',terms:'[STAGE_PAYMENT_PLAN]\nAdvance|33.33\nFoundation|33.33\nHandover|33.34\n[/STAGE_PAYMENT_PLAN]',
  totals:{final_amount:'100001.01'},
};

describe('lead-linked GST milestone invoicing',()=>{
  it('loads only SAVED stages and allocates all currency paise to the last stage',()=>{
    expect(savedStagePaymentPlan(sample.terms)).toHaveLength(3);
    const choice=invoiceStageChoices([sample],'36')[0]!;
    expect(choice.stages.map(s=>s.name)).toEqual(['Advance','Foundation','Handover']);
    expect(choice.stages.reduce((sum,s)=>sum+Math.round(s.amount*100),0)).toBe(10000101);
    expect(choice.stages[0]?.number).toBe(1);
    expect(invoiceStageChoices([{...sample,terms:'Unsaved'}],'36')).toEqual([]);
  });
  it('shows one dropdown instead of 6 stages and keeps billing client and totals responsive',()=>{
    expect(screen).toContain('aria-label="Payment stage"');
    expect(screen).toContain('group.stages.map(row=><option');
    expect(screen).toContain('name="leadId"');
    expect(screen).toContain('name="stageNumber"');
    expect(screen).toContain('name="revisionId"');
    expect(screen.match(/>Save<\/button>/g)).toHaveLength(3);
    expect(screen).not.toContain('Save draft</button>');
    expect(screen).not.toContain('Save &amp; preview</button>');
    expect(screen).toContain('Issue sales invoice');
    expect(screen).toContain('className="psi-mobile-actions"');
    expect(screen).toContain('disabledSave');
    expect(page).toContain("params.kind === 'purchase_bill'");
    expect(page).toContain('<DocumentEditor');
    expect(page).toContain('<PremiumSalesInvoice');
  });
  it('shows all active existing clients separately from eligible project stages',()=>{
    const choices = invoiceStageChoices([sample], '36');
    const clients = invoiceCustomerChoices([
      {id:'c1',display_name:'Existing Customer',legal_name:null,
        phone:'9999999999',email:null,tax_identifier:null,
        billing_address:{line1:'Main Street',city:'Hyderabad',region:'Telangana',postal_code:'500001'}},
      {id:'c2',display_name:'Existing Customer',legal_name:null,
        phone:null,email:null,tax_identifier:null,billing_address:null},
    ], choices, '36');
    expect(clients).toHaveLength(3);
    expect(clients.filter(c=>c.name==='Existing Customer')).toHaveLength(2);
    expect(clients.find(c=>c.id==='c1')?.address).toContain('Hyderabad');
    expect(clients.find(c=>c.id===sample.customerId)?.fromApprovedQuotation).toBe(true);
    expect(screen).toContain('aria-label="Select existing client"');
    expect(screen).toContain('customers.map(row=><option');
    expect(screen).toContain('customerId');
    expect(screen).toContain("eligibleStages.length>0");
    expect(page).toContain("gst.invoiceCustomers(context.organizationId)");
    expect(page).not.toContain("canViewCustomers = canAccess");
    expect(billingCustomersMigration).toContain("private.finance_require_read(p_org,'invoice.create')");
    expect(billingCustomersMigration).toContain("c.is_sales_prospect=false");
    expect(billingCustomersMigration).toContain("REVOKE ALL ON FUNCTION public.gst_invoice_customer_options");
    expect(billingCustomersMigration).toContain("c.organization_id=p_org");
  });
  it('saves tenant-scoped invoice/customer association without creating another client or project',()=>{
    expect(customerMigration).toContain('private.gst_customer_invoice_links');
    expect(customerMigration).toContain("private.commercial_access(p_org,'customer.view','customers')");
    expect(customerMigration).toContain("c.organization_id=p_org");
    expect(customerMigration).toContain("c.is_sales_prospect=false");
    expect(customerMigration).toContain("public.gst_document_with_template_save(p_org,p_input,NULL)");
    expect(customerMigration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(customerMigration).toContain("REVOKE ALL ON private.gst_customer_invoice_links");
    expect(customerMigration).not.toContain('INSERT INTO public.customers');
    expect(customerMigration).not.toContain('INSERT INTO public.projects');
    expect(actions).toContain('.saveCustomerDocument(');
    expect(actions).toContain("idSchema.parse(customerId)");
  });
  it('offers project creation immediately after marking Won and never duplicates quote prospects',()=>{
    expect(leadStage).toContain("<LeadProjectAction");
    expect(leadStage).toContain("canConvert={canConvert}");
    expect(inlineProject).toContain("Open Project ↗");
    expect(inlineProject).toContain("+ Create Project");
    expect(inlineProject).toContain("convertedProjectId");
    expect(inlineProject).toContain("quotationProjectId");
    expect(projectAction).toContain("crmServices('lead.convert')");
    expect(projectAction).toContain("lead_quotation_list");
    expect(projectAction).toContain("customer_id: null, project_id: null");
    expect(projectAction).toContain("acknowledge_duplicate: false");
    expect(conversionPage).toContain("redirect('/dashboard/crm/leads/'");
    expect(conversionPage).not.toContain("<MasterForm");
    expect(billingCustomersMigration).toContain("crm_activate_won_project_after_convert");
    expect(billingCustomersMigration).toContain("OLD.converted_at IS NULL");
    expect(billingCustomersMigration).toContain("p.customer_id=NEW.converted_customer_id");
    expect(billingCustomersMigration).not.toContain("INSERT INTO public.customers");
    expect(billingCustomersMigration).not.toContain("INSERT INTO public.projects");
  });

  it('makes Won leads invoice-selectable with or without an accepted quote',()=>{
    const wonClient = invoiceCustomerChoices([{
      id:'00000000-0000-4000-8000-000000000010',
      display_name:'Ramya',legal_name:null,phone:'8978911262',email:null,
      tax_identifier:null,billing_address:{city:'Hyderabad'},
      won_lead_id:'00000000-0000-4000-8000-000000000010',
      won_lead_number:'L-2026-000002',
    }],[],'36');
    expect(wonClient).toHaveLength(1);
    expect(wonClient[0]?.wonLeadId).toBe('00000000-0000-4000-8000-000000000010');
    expect(wonClient[0]?.fromApprovedQuotation).toBe(false);
    expect(screen).toContain('Won lead');
    expect(screen).toContain('name="wonLeadId"');
    expect(screen).toContain('row.leadId === selectedClient?.wonLeadId');
    expect(screen).toContain('Create Project');
    expect(screen).toContain('createWonLeadInvoiceProject');
    expect(screen).not.toContain('Create project from this lead');
    expect(screen).not.toContain("'/dashboard/crm/leads/'+selectedClient.wonLeadId");
    expect(screen).toContain("type=\"button\" className=\"psi-project-create\"");
    expect(screen).toContain("setProjectDialog(true)");
    expect(page).toContain('existingWonLeadId={existingWonLeadId}');
    expect(actions).toContain('.saveWonLeadDocument(');
    expect(wonLeadMigration).toContain("l.lifecycle='won'");
    expect(wonLeadMigration).toContain("l.converted_customer_id IS NULL");
    expect(wonLeadMigration).toContain('private.finance_require(p_org,\'invoice.create\')');
    expect(wonLeadMigration).toContain('private.gst_won_lead_invoice_links');
    expect(wonLeadMigration).toContain('FORCE ROW LEVEL SECURITY');
    expect(wonLeadMigration).not.toContain('INSERT INTO public.customers');
    expect(wonLeadMigration).not.toContain('INSERT INTO public.projects');
  });
  it('changes Won immediately without mandatory reason while retaining lost validation',()=>{
    expect(leadStage).toContain("selected.outcome === 'won'");
    expect(leadStage).not.toContain('Why was this lead won?');
    expect(leadStage).not.toContain("target.outcome === 'won' && !note.trim()");
    expect(leadStage).toContain('<LeadProjectAction');
    expect(wonLeadMigration).not.toContain('Won reason required');
    expect(wonLeadMigration).toContain('Lost reason required');
    expect(wonLeadMigration).toContain("private.crm_require(org,'lead.win')");
  });
  it('routes linked sales draft through the validated tenant RPC',()=>{
    expect(actions).toContain('idSchema.parse(leadId)');
    expect(actions).toContain('idSchema.parse(revisionId)');
    expect(actions).toContain('.min(1).max(40)');
    expect(actions).toContain('.saveStageDocument(');
    expect(actions).toContain("revalidatePath('/dashboard/projects')");
    expect(migrations).toContain('private.finance_require(p_org');
    expect(migrations).toContain('l.lifecycle');
    expect(migrations).toContain("a.action='approved'");
    expect(migrations).toContain('private.gst_invoice_quoted_stage');
  });
  it('activates existing quote project in same transaction as final issuance',()=>{
    expect(migrations).toContain('public.crm_convert(p_org');
    expect(migrations).toContain('UPDATE public.projects SET is_sales_prospect=false');
    expect(migrations).toContain('project_id=selected_project');
    expect(migrations).toContain('private.gst_stage_invoice_after_issue(p_org,p_id)');
    expect(migrations).toContain('previous_base+link.stage_base_amount');
    expect(migrations).not.toContain('DROP TABLE');
    expect(migrations).not.toContain('TRUNCATE');
  });
});
