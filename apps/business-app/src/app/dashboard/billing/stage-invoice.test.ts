import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { savedStagePaymentPlan } from '@business-os/core/quotation-payment-plan';
import { invoiceStageChoices } from './stage-choices';
import type { GstStageInvoiceOption } from '@business-os/database/gst';

const file = (p:string) => readFileSync(new URL(p,import.meta.url),'utf8');
const screen = file('./premium-sales-invoice.tsx');
const page = file('./new/page.tsx');
const actions = file('./actions.ts');
const migrations = file('../../../../../../packages/database/supabase/migrations/20261017000500_stage_invoice_project_activation.sql');

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
    expect(screen).toContain('choice!.stages.map(row=><option');
    expect(screen).toContain('name="leadId"');
    expect(screen).toContain('name="stageNumber"');
    expect(screen).toContain('name="revisionId"');
    expect(screen).toContain('Save &amp; preview');
    expect(screen).toContain('className="psi-mobile-actions"');
    expect(screen).toContain('disabledSave');
    expect(page).toContain("params.kind === 'purchase_bill'");
    expect(page).toContain('<DocumentEditor');
    expect(page).toContain('<PremiumSalesInvoice');
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
