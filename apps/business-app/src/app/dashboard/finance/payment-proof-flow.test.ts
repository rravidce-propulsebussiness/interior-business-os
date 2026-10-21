import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const src=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=src('../../../../../../packages/database/supabase/migrations/20261021000600_customer_payment_proof_approval.sql');
const client=src('../../client/client-dashboard.tsx');
const clientForm=src('../../client/client-payment-proof-form.tsx');
const clientUpload=src('../../client/payment-proofs/route.ts');
const finance=src('./customer-payments-panel.tsx');
const review=src('./payment-proof-review.tsx');
const staff=src('./payment-proof-actions.ts');
const store=src('../../payment-proof-storage.ts');
describe('Customer screenshot to verified Finance payment and receipt',()=>{
 it('client uploads private evidence only for an invited exact project',()=>{
  expect(sql).toContain('private.client_portal_accessible(p_project)');
  expect(sql).toContain("req.status<>'issued'");
  expect(sql).toContain('p_object_key IS DISTINCT FROM');
  expect(sql).toContain('one_pending_client_proof_per_request');
  expect(clientUpload).toContain("db.rpc('client_payment_proof_prepare'");
  expect(clientUpload).toContain("db.rpc('client_payment_proof_submit'");
  expect(clientUpload).toContain('await deletePaymentProof(key)');
  expect(store).toContain('r2MediaEnabled()');
  expect(store).toContain("public:false");
  expect(clientForm).toContain("I've Paid");
 });
 it('does not mark money as received for an unverified screenshot',()=>{
  expect(client).toContain('Bank verification pending');
  expect(sql).not.toContain('AFTER INSERT ON private.client_payment_proofs');
  expect(sql).toContain("status text NOT NULL DEFAULT 'pending'");
  expect(sql).toContain("IF NOT p_confirm_bank_credit THEN");
 });
 it('only Owner or Accountant with Finance permission may review',()=>{
  expect(sql).toContain("private.finance_require(p_org,'payment.record')");
  expect(sql).toContain("lower(role.name) IN ('owner','accountant')");
  expect(sql).toContain('p_allow_partial AND NOT is_owner');
  expect(finance).toContain('PaymentProofReview');
  expect(review).toContain('I verified this exact transaction reference');
  expect(staff).toContain("financeServices('payment.record')");
 });
 it('approval atomically reuses canonical Finance ledger and receipt',()=>{
  expect(sql).toContain('FOR UPDATE');
  expect(sql).toContain("status='recorded'");
  expect(sql).toContain('upper(btrim(external_reference))=pr.bank_reference');
  expect(sql).toContain("payment:=public.payment_record(p_org,pr.contract_id");
  expect(sql).toContain("'idempotency_key',pr.id");
  expect(sql).toContain('receipt_id=receipt WHERE id=p_proof');
  expect(client).toContain('Official receipt');
  expect(client).toContain('Balance outstanding');
 });
 it('supports rejection without creating a payment and protects media',()=>{
  expect(sql).toContain("IF p_action='reject' THEN");
  expect(sql).toContain("status='rejected'");
  expect(sql).toContain('private.client_portal_accessible(p_project)');
  expect(sql).toContain('private.finance_access(p_org');
  expect(client).toContain('Evidence rejected — resubmit');
 });
});
