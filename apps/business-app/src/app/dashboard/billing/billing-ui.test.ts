import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const path=(x:string)=>new URL(x,import.meta.url);
const finance=readFileSync(path('../finance/page.tsx'),'utf8');
const css=readFileSync(path('../finance/finance-home.css'),'utf8');
const billing=readFileSync(path('./page.tsx'),'utf8');
const settings=readFileSync(path('../settings/page.tsx'),'utf8');
const actions=readFileSync(path('./actions.ts'),'utf8');
const salesInvoice=readFileSync(path('./premium-sales-invoice.tsx'),'utf8');
const invoicePage=readFileSync(path('./new/page.tsx'),'utf8');
const projectAction=readFileSync(path('./invoice-project-actions.ts'),'utf8');


describe('Finance navigation and single-source billing',()=>{
 it('separates company Finance from platform subscription Billing',()=>{
  expect(billing).toContain('Billing & Plans');
  expect(billing).not.toContain('gst.list');
  expect(finance).toContain("'invoices' | 'payments' | 'expenses' | 'gst' | 'salaries'");
   expect(finance).toContain('<CustomerPaymentsPanel');
  expect(finance).toContain('Payment Pending');
  expect(finance).not.toContain('Outstanding');
 });
 it('preserves authorized source records without fabricated payments',()=>{
  expect(finance).toContain('gst.list(orgId');
  expect(finance).toContain("orders(orgId, 'buyer')");
  expect(finance).toContain('createLabourDisbursementsRepository');
  expect(finance).toContain('receipt allocations');
  expect(finance).toContain('SalaryPanel');
 });
 it('keeps invoice templates in Settings and outside bills on canonical record',()=>{
  expect(settings).toContain('InvoiceTemplateSelector');
  expect(actions).toContain('saveSupplierBillAttachment');
  expect(finance).toContain('/dashboard/billing/new?kind=purchase_bill');
 });
 it('uses SG Homes responsive finance shell',()=>{
  expect(finance).toContain('dashboardBrand');
  expect(finance).toContain('OwnerMobileNav');
  expect(css).toContain('fe5105');
  expect(css).toContain('@media(max-width:760px)');
 });

 it('uses one set of Finance tabs without repeating them in the sidebar or Quick Actions',()=>{
  expect(finance).toContain("<GstInline");
  expect(finance).not.toContain("Open GST workpapers");
  expect(finance).not.toContain("Quick Actions");
  expect(finance).not.toContain("children: [\n      ...tabs.map");
 });
 it('sends create links through full-document navigation on Hostinger',()=>{
  expect(finance).toContain('<a className="fw-primary" href={headlineAction.href}>');
  expect(finance).toContain('<a href="/dashboard/billing/new?kind=purchase_bill">');
  expect(finance).toContain("/dashboard/billing/new?kind=sales_invoice");
 });
});

describe('in-place Won lead project creation from invoice',()=>{
 it('replaces the customer-page link with a project name popup',()=>{
   expect(salesInvoice).toContain('role="dialog" aria-modal="true"');
   expect(salesInvoice).toContain('Create Project');
   expect(salesInvoice).toContain('name="customerId" value={linkedProject.customerId}');
   expect(salesInvoice).not.toContain('Create project from this lead');
   expect(salesInvoice).toContain('setProjectDialog(false)');
 });
 it('does not navigate away or submit the invoice when creating a project',()=>{
   expect(salesInvoice).toContain('onClick={()=>void createProject()}');
   expect(salesInvoice).toContain('type="button"');
   expect(salesInvoice).toContain("if(event.key==='Enter')");
   expect(salesInvoice).toContain('event.preventDefault()');
   expect(invoicePage).toContain("canCreateProject={hasGrant('lead.convert') && hasGrant('project.view')}");
 });
 it('reuses authorized CRM conversion rather than creating duplicate projects',()=>{
   expect(projectAction).toContain("crmServices('lead.convert')");
   expect(projectAction).toContain('openOrCreateWonLeadProject');
   expect(projectAction).toContain("converted_customer_id");
   expect(projectAction).toContain(".eq('organization_id',services.org)");
   expect(projectAction).not.toContain(".insert(");
 });
});
