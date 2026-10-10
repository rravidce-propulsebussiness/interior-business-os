import Link from 'next/link';
import { notFound } from 'next/navigation';
import { financeServices } from '../../finance/service';
import { createTradeBillingRepository } from '@business-os/database/trade-billing';
import { DomainError, idSchema } from '@business-os/shared';
import { PrintInvoiceButton } from '../print-button';
import {
  issueTradeDocument,
  voidTradeDocument,
  recordTradePayment,
} from '../actions';

export const dynamic = 'force-dynamic';
const money = (v: number) =>
  '₹' +
  Number(v).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export default async function TradeDocumentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    issued?: string;
    paid?: string;
    voided?: string;
  }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const s = await financeServices('invoice.view', true);
  const q = await searchParams;
  let doc;
  try {
    doc = await createTradeBillingRepository(s.client, s.org).document(id);
  } catch (error) {
    if (
      error instanceof DomainError &&
      ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)
    )
      notFound();
    throw error;
  }
  const isSales = doc.kind === 'sales_invoice';
  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 print:bg-white print:p-0"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href="/dashboard/billing"
            className="text-sm font-semibold text-blue-700"
          >
            ← Billing register
          </Link>
          <div className="flex gap-2">
            <PrintInvoiceButton />
            {doc.status === 'draft' && s.allowed('invoice.create') && (
              <Link
                className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
                href={'/dashboard/billing/new?edit=' + doc.id}
              >
                Edit draft
              </Link>
            )}
          </div>
        </div>
        {q.error && (
          <p
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 print:hidden"
            role="alert"
          >
            Action failed: {q.error}
          </p>
        )}
        {(q.saved || q.issued || q.paid || q.voided) && (
          <p
            role="status"
            className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden"
          >
            Billing record updated successfully.
          </p>
        )}
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-none print:p-3 print:shadow-none sm:p-9">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
                ProPulse Business OS · Accounting
              </p>
              <h1 className="mt-2 text-3xl font-bold">
                {isSales ? 'TAX INVOICE' : 'PURCHASE BILL RECORD'}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Invoice reference:{' '}
                {isSales ? (doc.number ?? 'DRAFT — NOT ISSUED') : doc.reference}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Status: <strong className="uppercase">{doc.status}</strong>
              </p>
            </div>
            <dl className="text-sm">
              <dt className="text-slate-500">Invoice date</dt>
              <dd className="font-semibold">{doc.issueDate}</dd>
              <dt className="mt-3 text-slate-500">Due date</dt>
              <dd>{doc.dueDate ?? 'Not specified'}</dd>
              <dt className="mt-3 text-slate-500">
                Place of supply (state code)
              </dt>
              <dd>{doc.placeOfSupply}</dd>
            </dl>
          </header>
          <div className="grid gap-6 py-6 sm:grid-cols-2">
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                Supplier / From
              </h2>
              <p className="font-semibold">{doc.issuer.name}</p>
              <p className="mt-1 whitespace-pre-line text-sm">
                {doc.issuer.address}
              </p>
              <p className="mt-2 text-sm">State: {doc.issuer.state}</p>
              <p className="text-sm">
                GSTIN: {doc.issuer.gstin || 'Unregistered / not supplied'}
              </p>
            </section>
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                Buyer / Bill To
              </h2>
              <p className="font-semibold">{doc.receiver.name}</p>
              <p className="mt-1 whitespace-pre-line text-sm">
                {doc.receiver.address}
              </p>
              <p className="mt-2 text-sm">State: {doc.receiver.state}</p>
              <p className="text-sm">
                GSTIN: {doc.receiver.gstin || 'Unregistered / not supplied'}
              </p>
            </section>
          </div>
          {doc.deliveryAddress && (
            <p className="border-b pb-4 text-sm">
              <strong>Delivery address:</strong> {doc.deliveryAddress}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 print:bg-white">
                  <th className="p-3">Description / HSN</th>
                  <th className="p-3 text-right">Qty</th>
                  <th className="p-3 text-right">Rate</th>
                  <th className="p-3 text-right">GST</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((item, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3">
                      <strong>{item.description}</strong>
                      <p className="text-xs text-slate-500">
                        HSN/SAC: {item.hsn} · {item.unit}
                      </p>
                    </td>
                    <td className="p-3 text-right">{item.quantity}</td>
                    <td className="p-3 text-right">{money(item.rate)}</td>
                    <td className="p-3 text-right">{item.gstRate}%</td>
                    <td className="p-3 text-right">{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 ml-auto max-w-sm space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Taxable value</span>
              <strong>{money(doc.subtotal)}</strong>
            </div>
            {doc.cgst > 0 && (
              <div className="flex justify-between">
                <span>CGST</span>
                <strong>{money(doc.cgst)}</strong>
              </div>
            )}
            {doc.sgst > 0 && (
              <div className="flex justify-between">
                <span>SGST</span>
                <strong>{money(doc.sgst)}</strong>
              </div>
            )}
            {doc.igst > 0 && (
              <div className="flex justify-between">
                <span>IGST</span>
                <strong>{money(doc.igst)}</strong>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-lg font-bold">
              <span>Grand total</span>
              <span>{money(doc.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Paid / recorded</span>
              <span>{money(doc.paid)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Outstanding</span>
              <span>{money(doc.balance)}</span>
            </div>
          </div>
          {doc.reverseCharge && (
            <p className="mt-4 text-sm font-semibold text-amber-700">
              Reverse charge flagged — tax treatment must be checked
              independently.
            </p>
          )}
          {doc.notes && (
            <section className="mt-7 border-t pt-4">
              <h2 className="font-semibold">Notes</h2>
              <p className="mt-2 whitespace-pre-line text-sm">{doc.notes}</p>
            </section>
          )}
          {doc.status === 'issued' && (
            <div className="mt-16 flex justify-end">
              <div className="w-60 border-t pt-2 text-center text-sm">
                Authorized signature — {doc.issuer.name}
              </div>
            </div>
          )}
          {!isSales && (
            <p className="mt-7 text-xs text-slate-500">
              Purchase-bill register copy. The supplier's original tax invoice
              should be retained as the legal source document; this record is
              not issued on their behalf.
            </p>
          )}
        </article>
        <section className="mt-5 grid gap-4 md:grid-cols-2 print:hidden">
          {doc.status === 'draft' && s.allowed('invoice.issue') && (
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">
                {isSales ? 'Issue invoice' : 'Record supplier bill'}
              </h2>
              <p className="my-3 text-sm text-slate-600">
                {isSales
                  ? 'Issuing allocates a unique invoice number and freezes all details.'
                  : 'Recording freezes this bill and its supplier reference.'}
              </p>
              <form action={issueTradeDocument}>
                <input name="id" type="hidden" value={doc.id} />
                <button
                  type="submit"
                  className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Confirm &amp; finalize
                </button>
              </form>
            </div>
          )}
          {doc.status === 'issued' &&
            doc.balance > 0 &&
            s.allowed('payment.record') && (
              <div className="rounded-2xl border bg-white p-5">
                <h2 className="font-semibold">
                  {isSales ? 'Record payment received' : 'Record payment made'}
                </h2>
                <form
                  action={recordTradePayment}
                  className="mt-4 grid gap-3 text-sm"
                >
                  <input type="hidden" name="id" value={doc.id} />
                  <label className="grid gap-1">
                    Amount (₹)
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={doc.balance}
                      required
                      name="amount"
                      className="rounded-lg border p-2"
                    />
                  </label>
                  <label className="grid gap-1">
                    Payment date
                    <input
                      required
                      type="date"
                      name="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="rounded-lg border p-2"
                    />
                  </label>
                  <label className="grid gap-1">
                    Method
                    <select name="mode" className="rounded-lg border p-2">
                      <option value="bank">Bank transfer</option>
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    Transaction reference
                    <input
                      name="reference"
                      maxLength={120}
                      className="rounded-lg border p-2"
                    />
                  </label>
                  <button
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    type="submit"
                  >
                    Record payment
                  </button>
                </form>
              </div>
            )}
          {doc.payments.length > 0 && (
            <div className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Payment history</h2>
              {doc.payments.map((p) => (
                <p key={p.id} className="mt-2 border-b pb-2 text-sm">
                  {p.date} · {p.mode} · {money(p.amount)}{' '}
                  {p.reference && ' · ' + p.reference}
                </p>
              ))}
            </div>
          )}
          {doc.status !== 'void' &&
            doc.paid === 0 &&
            s.allowed('invoice.manage') && (
              <details className="rounded-2xl border bg-white p-5">
                <summary className="cursor-pointer font-semibold text-rose-700">
                  Void / cancel document
                </summary>
                <p className="mt-3 text-sm">
                  Voiding is audited and requires a reason. Issued invoice
                  numbers are not reused.
                </p>
                <form action={voidTradeDocument} className="mt-3 grid gap-3">
                  <input type="hidden" name="id" value={doc.id} />
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={300}
                    className="rounded-lg border p-2"
                    placeholder="Cancellation reason"
                  />
                  <button className="rounded-xl border border-rose-300 p-2 text-sm font-semibold text-rose-700">
                    Void document
                  </button>
                </form>
              </details>
            )}
        </section>
        <p className="mt-6 text-xs text-slate-500 print:hidden">
          GST-preparation only. Validate applicable tax treatment and government
          e-invoicing obligations. The printed document is not an IRN/QR-coded
          government e-invoice.
        </p>
      </div>
    </main>
  );
}
