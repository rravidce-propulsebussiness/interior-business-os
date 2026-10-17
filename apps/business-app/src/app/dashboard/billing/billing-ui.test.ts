import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const path=(x:string)=>new URL(x,import.meta.url);
const finance=readFileSync(path('../finance/page.tsx'),'utf8');
const css=readFileSync(path('../finance/finance-home.css'),'utf8');
const billing=readFileSync(path('./page.tsx'),'utf8');
const settings=readFileSync(path('../settings/page.tsx'),'utf8');
const actions=readFileSync(path('./actions.ts'),'utf8');

describe('Finance navigation and single-source billing',()=>{
 it('separates company Finance from platform subscription Billing',()=>{
  expect(billing).toContain('Billing & Plans');
  expect(billing).not.toContain('gst.list');
  expect(finance).toContain("'invoices' | 'expenses' | 'gst' | 'salaries'");
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
