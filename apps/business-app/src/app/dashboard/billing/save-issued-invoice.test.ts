import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const get=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const action=get('./actions.ts');
const editor=get('./premium-sales-invoice.tsx');
const detail=get('./[id]/page.tsx');
const client=get('../../client/client-dashboard.tsx');
const clientLoader=get('../../client/projects/[id]/page.tsx');
const migration=get('../../../../../../packages/database/supabase/migrations/20261021000400_issued_sales_invoices_client_requests.sql');
const pdf=get('../../invoice-pdf.ts');

describe('one invoice save, project client request, real PDF',()=>{
 it('one Save Invoice produces an official issued record, never a draft',()=>{
  expect(editor).not.toContain('Save draft</button>');
  expect(editor).toContain('Save Invoice</button>');
  expect(editor).toContain('Issuing a bill requests payment; it does not record money received.');
  expect(action).toContain("client.rpc('gst_sales_invoice_save_and_issue'");
  expect(migration).toContain('PERFORM public.gst_document_finalize(p_org,saved,saved_version)');
  expect(migration).toContain('If issuance fails, all save/link changes rollback');
 });
 it('client only sees issued invoices linked to the invited active project',()=>{
  expect(migration).toContain('private.client_portal_accessible(p_project)');
  expect(migration).toContain("d.kind='sales_invoice' AND d.status='issued'");
  expect(migration).toContain('l.project_id=p.id');
  expect(clientLoader).toContain("rpc('client_portal_invoices'");
  expect(client).toContain('Invoices &amp; payment requests');
  expect(client).toContain('Payment requested');
 });
 it('keeps invoice versus payment distinct',()=>{
  expect(pdf).toContain('does not certify receipt of money');
  expect(detail).toContain('Issued · Payment requested (not proof of payment)');
  expect(migration).not.toContain('INSERT INTO public.payments');
 });
 it('shares a real generated PDF file through the native share sheet',()=>{
  const share=get('./[id]/share-invoice-pdf.tsx');
  expect(share).toContain("new File([blob]");
  expect(share).toContain('navigator.share');
  expect(detail).toContain('Download PDF');
  expect(detail).toContain('<ShareInvoicePdf');
  expect(pdf).toContain('renderPdf(html');
 });
});
