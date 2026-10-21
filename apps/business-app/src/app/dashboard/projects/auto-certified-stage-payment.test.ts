import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const root=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=root('../../../../../../packages/database/supabase/migrations/20261021000500_certified_stage_payment_requests.sql');
const project=root('./project-v2-view.tsx');
const linker=root('./project-stage-payment-linker.tsx');
const client=root('../../client/client-dashboard.tsx');
const loader=root('../../client/projects/[id]/page.tsx');
const finance=root('../finance/customer-payments-panel.tsx');
const requestPdf=root('../../stage-payment-request-pdf.ts');
const clientPdf=root('../../client/payment-requests/[id]/pdf/route.ts');
const financePdf=root('../finance/requests/[id]/pdf/route.ts');
describe('Auto stage payment requests from certified signed quotation',()=>{
 it('triggers on independent QC certification, not a task status',()=>{
  expect(migration).toContain('AFTER INSERT ON private.construction_stage_clearances');
  expect(migration).toContain('private.construction_stage_current(');
  expect(migration).toContain('private.project_agreement_authorized');
  expect(migration).not.toContain('AFTER UPDATE ON public.project_tasks');
  expect(migration).not.toContain('UPDATE public.payments');
  expect(migration).not.toContain('INSERT INTO public.payments');
 });
 it('requires exact active quotation schedule and matching stage codes',()=>{
  expect(migration).toContain('contract.revision_id');
  expect(migration).toContain("'[STAGE_PAYMENT_PLAN]'");
  expect(migration).toContain("'[STAGE_PAYMENT_LINKS]'");
  expect(migration).toContain('item.label<>btrim(parts[1])');
  expect(migration).toContain('private.finance_decimal(item.value)<>parts[2]::numeric');
  expect(migration).toContain('jsonb_array_elements_text(bind_row)');
  expect(migration).toContain('instance_code=code');
 });
 it('does not duplicate issued or voided requests or existing invoices',()=>{
  expect(migration).toContain('ON CONFLICT DO NOTHING RETURNING id INTO request_id');
  expect(migration).toContain('WHERE r.organization_id=p_org AND r.schedule_item_id=item.id)');
  expect(migration).toContain("'public.invoice_items");
  expect(migration).toContain('private.gst_stage_invoice_links');
  expect(migration).not.toContain('INSERT INTO public.invoices');
  expect(migration).not.toContain('INSERT INTO private.gst_business_documents');
 });
 it('legacy contract mappings are attached inline with manager access',()=>{
  expect(linker).toContain("linkConstructionStageRecord(");
  expect(linker).toContain("'payment',selected.id,selected.contract_id");
  expect(project).toContain('<ProjectStagePaymentLinker');
  expect(migration).toContain('AFTER INSERT ON private.construction_stage_record_links');
  expect(migration).toContain('record_kind=\'payment\'');
 });
 it('shows same request in Finance and restricted client project with PDF',()=>{
  expect(finance).toContain("s.finance.search('payment_requests'");
  expect(client).toContain('Certified milestone payment request');
  expect(loader).toContain("rpc('client_portal_stage_payment_requests'");
  expect(migration).toContain('private.client_portal_accessible(p_project_id)');
  expect(migration).toContain('p.id=p_project_id AND req.id=p_request_id');
  expect(requestPdf).toContain('Not a GST tax invoice and not a payment receipt');
  expect(clientPdf).toContain("client_portal_stage_request_read");
  expect(financePdf).toContain("requirePermission(");
 });
});
