import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstRepository, type GstLine } from '@business-os/database/gst';
import { idSchema } from '@business-os/shared';
import { ActionForm } from '@business-os/ui/action-form';
import { finalizeGstDocument } from '../actions';
import { PrintDocumentButton } from './print-button';

export const dynamic = 'force-dynamic';
const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    Number(amount),
  );
function text(obj: Record<string, unknown>, key: string) {
  return typeof obj[key] === 'string' ? (obj[key] as string) : '';
}
export default async function GstDocumentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { authorization, client } = await pageServices();
  const context = await activeOrganization();
  if (!context) notFound();
  await authorization.requirePermission(context.organizationId, 'invoice.view');
  const gst = createGstRepository(client);
  const doc = await gst.document(context.organizationId, id);
  const profile = await gst.profile(context.organizationId);
  const canIssue =
    doc.isOwner &&
    context.grants.some(
      (g) =>
        g.permission === 'invoice.issue' && g.scope.kind === 'organization',
    );
  const canEdit =
    doc.isOwner &&
    context.grants.some(
      (g) =>
        g.permission === 'invoice.manage' && g.scope.kind === 'organization',
    );
  const snapshot = doc.snapshot;
  const issuer =
    snapshot && typeof snapshot.issuer === 'object' && snapshot.issuer !== null
      ? (snapshot.issuer as Record<string, unknown>)
      : null;
  const party =
    snapshot && typeof snapshot.party === 'object' && snapshot.party !== null
      ? (snapshot.party as Record<string, unknown>)
      : null;
  const yourSide =
    doc.kind === 'sales_invoice'
      ? 'Supplier / issuer'
      : 'Our company / receiving business';
  return (
    <main
      id="main-content"
      className="mx-auto max-w-5xl space-y-5 px-4 py-8 text-slate-900 sm:px-7 print:max-w-none print:p-0"
    >
      <nav className="text-sm text-slate-500 print:hidden">
        <Link href="/dashboard/billing">← GST billing</Link>
      </nav>
      <div className="flex flex-wrap justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">
            {doc.kind === 'sales_invoice'
              ? 'Sales invoice'
              : 'Supplier purchase bill'}{' '}
            · {doc.number ?? 'Draft'}
          </h1>
          <p className="text-sm capitalize text-slate-500">{doc.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.status !== 'draft' && <PrintDocumentButton />}
          {doc.status === 'draft' && canEdit && (
            <Link
              href={'/dashboard/billing/new?edit=' + id}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold"
            >
              Edit draft
            </Link>
          )}
        </div>
      </div>
      {doc.status === 'draft' && canIssue && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 print:hidden">
          <h2 className="font-semibold">Review before finalizing</h2>
          <p className="mt-2 text-sm leading-6">
            Confirm your business GSTIN, state and party details, tax rates,
            HSN/SAC and reverse-charge treatment. Finalizing locks the document
            and assigns its invoice number for outgoing sales.
          </p>
          <ActionForm
            action={finalizeGstDocument}
            label={
              doc.kind === 'sales_invoice'
                ? 'Issue sales invoice'
                : 'Record received bill'
            }
          >
            <input type="hidden" name="id" value={doc.id} />
            <input type="hidden" name="version" value={doc.version} />
          </ActionForm>
        </section>
      )}
      <article className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-300 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
              {doc.status === 'draft'
                ? 'DRAFT — Not a tax document'
                : doc.kind === 'purchase_bill'
                  ? 'RECEIVED SUPPLIER BILL'
                  : 'SALES TAX DOCUMENT'}
            </p>
            <h2 className="mt-2 text-3xl font-semibold">
              {doc.documentType === 'tax_invoice'
                ? 'Tax Invoice'
                : doc.documentType === 'bill_of_supply'
                  ? 'Bill of Supply'
                  : 'Commercial Invoice'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Number: {doc.number ?? 'Assigned when issued'}
            </p>
          </div>
          <div className="text-sm">
            <p>
              <strong>Document date:</strong> {doc.date}
            </p>
            {doc.dueDate && (
              <p className="mt-1">
                <strong>Due date:</strong> {doc.dueDate}
              </p>
            )}
            <p className="mt-1">
              <strong>Place of supply:</strong> {doc.placeOfSupply}
            </p>
            <p className="mt-1">
              <strong>Reverse charge:</strong>{' '}
              {doc.reverseCharge ? 'Yes' : 'No'}
            </p>
          </div>
        </header>
        <section className="mt-7 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {yourSide}
            </p>
            <h3 className="mt-2 text-lg font-semibold">
              {issuer
                ? text(issuer, 'name')
                : (profile?.legalName ?? 'Not configured')}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
              {issuer ? text(issuer, 'address') : (profile?.address ?? '')}
            </p>
            <p className="mt-2 text-sm">
              GSTIN:{' '}
              {issuer
                ? text(issuer, 'gstin') || 'Not registered'
                : (profile?.gstin ?? 'Not registered')}
            </p>
            <p className="text-sm">
              State code:{' '}
              {issuer ? text(issuer, 'stateCode') : (profile?.stateCode ?? '')}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {doc.kind === 'sales_invoice'
                ? 'Bill to / customer'
                : 'Received from / supplier'}
            </p>
            <h3 className="mt-2 text-lg font-semibold">
              {party ? text(party, 'name') : doc.partyName}
            </h3>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
              {party ? text(party, 'address') : doc.partyAddress}
            </p>
            <p className="mt-2 text-sm">
              GSTIN:{' '}
              {party
                ? text(party, 'gstin') || 'Unregistered'
                : (doc.partyGstin ?? 'Unregistered')}
            </p>
            <p className="text-sm">
              State code: {party ? text(party, 'stateCode') : doc.partyState}
            </p>
          </div>
        </section>
        {doc.deliveryAddress && (
          <p className="mt-5 text-sm">
            <strong>Delivery address:</strong> {doc.deliveryAddress}
          </p>
        )}
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[550px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-300 bg-slate-100">
              <tr>
                <th className="px-2 py-3">Goods / Services</th>
                <th className="px-2 py-3">HSN/SAC</th>
                <th className="px-2 py-3">Qty</th>
                <th className="px-2 py-3">Rate</th>
                <th className="px-2 py-3">GST %</th>
                <th className="px-2 py-3">Taxable</th>
                <th className="px-2 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(doc.lines as GstLine[]).map((l, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="px-2 py-3">
                    {l.description}
                    <span className="block text-slate-500">{l.unit}</span>
                  </td>
                  <td className="px-2 py-3">{l.hsnSac}</td>
                  <td className="px-2 py-3">{l.quantity}</td>
                  <td className="px-2 py-3">{money(l.unitPrice)}</td>
                  <td className="px-2 py-3">{l.gstRate}%</td>
                  <td className="px-2 py-3">{money(Number(l.taxable ?? 0))}</td>
                  <td className="px-2 py-3">{money(Number(l.total ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="ml-auto mt-7 max-w-sm space-y-2 text-sm">
          {(
            [
              ['Gross subtotal', doc.subtotal],
              ['Discount', doc.discount],
              ['Taxable value', doc.taxable],
              ['CGST', doc.cgst],
              ['SGST', doc.sgst],
              ['IGST', doc.igst],
            ] as [string, number][]
          ).map(([label, value]) => (
            <div className="flex justify-between gap-4" key={label}>
              <span className="text-slate-600">{label}</span>
              <span>{money(value)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t-2 border-slate-900 pt-3 text-lg font-bold">
            <span>Total</span>
            <span>{money(doc.total)}</span>
          </div>
        </section>
        {doc.notes && (
          <div className="mt-8 border-t border-slate-200 pt-5 text-sm">
            <strong>Notes</strong>
            <p className="mt-2 whitespace-pre-line">{doc.notes}</p>
          </div>
        )}
        <footer className="mt-12 flex flex-wrap justify-between gap-6 border-t border-slate-200 pt-7 text-xs text-slate-500">
          <p>Business OS · GST-ready register · Values in INR</p>
          <div className="text-right">
            <p>
              <strong>Authorized signatory:</strong>{' '}
              {issuer
                ? text(issuer, 'authorizedSignatory')
                : (profile?.authorizedSignatory ?? '')}
            </p>
            <p className="mt-1">
              Signature or valid digital signature must be added as required.
            </p>
          </div>
        </footer>
      </article>
      <p className="text-xs leading-5 text-slate-500 print:hidden">
        This is not a government e-invoice or IRN. Reverse-charge treatment,
        UTGST, tax rate classification and any filing obligations require
        separate verification. Supplier bills must be matched to their original
        documents.
      </p>
    </main>
  );
}
