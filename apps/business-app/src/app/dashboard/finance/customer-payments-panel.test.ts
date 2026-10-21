import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const panel=read('./customer-payments-panel.tsx');
const finance=read('./page.tsx');
const form=read('./form.tsx');
const legacyNew=read('./[entity]/new/page.tsx');
const legacyList=read('./[entity]/page.tsx');
const legacyDetail=read('./[entity]/[id]/page.tsx');
const project=read('../projects/project-v2-view.tsx');

describe('Single Finance customer payments workspace',()=>{
 it('shows one Finance Payments tab and uses the canonical ledger',()=>{
  expect(finance).toContain("id: 'payments', label: 'Payments'");
  expect(finance).toContain('<CustomerPaymentsPanel');
  expect(panel).toContain("s.finance.search('payments'");
  expect(panel).toContain("s.finance.search('payment_methods'");
  expect(panel).toContain('payment_number');
 });
 it('records actual receipts via existing financeCommand not new project records',()=>{
  expect(panel).toContain("action:'record_payment'");
  expect(panel).toContain('idempotency_key:randomUUID()');
  expect(panel).toContain('Save received payment');
  expect(panel).toContain("successHref={url}");
  expect(form).toContain('successHref ??');
  expect(panel).not.toContain('saveProjectSite');
  expect(panel).not.toContain('INSERT INTO');
 });
 it('supports first-time payment method creation without a separate flow',()=>{
  expect(panel).toContain("action:'payment_method'");
  expect(panel).toContain('No active receipt method is configured');
  expect(panel).toContain('Set up payment method');
  expect(panel).toContain('canManageMethods');
 });
 it('avoids duplicate routes while preserving restricted staff access',()=>{
  expect(legacyNew).toContain("entity === 'payments' && s.allowed('payment.view') && s.allowed('invoice.view')");
  expect(legacyList).toContain("entity === 'payments' && s.allowed('invoice.view')");
  expect(legacyDetail).toContain("entity === 'payments' && s.allowed('invoice.view')");
  expect(legacyNew).toContain("redirect('/dashboard/finance?tab=payments'");
  expect(legacyList).toContain("redirect('/dashboard/finance?tab=payments'");
  expect(project).toContain("'/dashboard/finance?tab=payments&contract_id='");
  expect(project).not.toContain("'/dashboard/finance/payments/new?contract_id='");
 });
 it('never conflates payment plans, proformas or payment promises with receipts',()=>{
  expect(panel).toContain("row.status==='recorded'");
  expect(panel).toContain('Quotation milestones and proforma invoices are not receipts');
  expect(panel).toContain('Advance proformas are requests, not tax invoices');
 });
});
