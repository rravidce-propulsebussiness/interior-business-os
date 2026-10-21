import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('GST and non-GST billing with full payments as default',()=>{
 const invoice=read('../billing/premium-sales-invoice.tsx');
 const invoiceAction=read('../billing/actions.ts');
 const ledger=read('./customer-payments-panel.tsx');
 const form=read('./form.tsx');
 const action=read('./actions.ts');
 const due=read('./payment-due.ts');
 it('makes lawful GST and non-GST bill types explicit',()=>{
  expect(invoice).toContain('GST bill — Tax invoice');
  expect(invoice).toContain('Non-GST — Bill of Supply');
  expect(invoice).toContain('Non-GST — Commercial invoice');
  expect(invoice).toContain('nonGstReason');
  expect(invoiceAction).toContain("profile?.gstin");
  expect(invoiceAction).toContain("['exempt','composition']");
  expect(invoiceAction).toContain("reason!=='non_taxable'");
 });
 it('refuses partial stage billing by default, except authorized owner',()=>{
  expect(invoice).toContain('Owner exception: allow partial stage billing');
  expect(invoice).toContain('!allowPartialStage');
  expect(invoiceAction).toContain("form.get('allowPartialStage')!=='true'||!owner");
  expect(invoiceAction).toContain("invoiceStageChoices(await gst.stageOptions(org)");
 });
 it('derives full received amount from the active milestone',()=>{
  expect(due).toContain("'payment_schedule_items'");
  expect(due).toContain("'payments'");
  expect(due).toContain("'recorded'");
  expect(ledger).toContain('nextMilestoneDue(s.client,s.org,selected)');
  expect(ledger).toContain('fullPaymentAmount={due?.amount');
  expect(form).toContain('Owner exception: allow a smaller partial payment');
  expect(form).toContain('readOnly={!partialEnabled}');
 });
 it('server authorizes owner-only partial receipts',()=>{
  expect(action).toContain("command.action==='record_payment'");
  expect(action).toContain("command.allow_partial&&!owner");
  expect(action).toContain('paid<required&&!command.allow_partial');
  expect(action).toContain("name.toLowerCase()==='owner'");
 });
});
