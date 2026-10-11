import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createGstTemplatesRepository } from '@business-os/database/gst-templates';

export const dynamic = 'force-dynamic';

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    value,
  );

function currentMonthIndia() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '01';
  const year = get('year'),
    month = get('month');
  return {
    from: year + '-' + month + '-01',
    to: year + '-' + month + '-' + get('day'),
  };
}

export default async function GstReports({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await activeOrganization();
  if (!ctx) {
    return (
      <main className="mx-auto max-w-5xl p-7 text-slate-900">
        Select a company workspace before accessing GST reports.
        <Link href="/dashboard" className="ml-3 text-blue-700 underline">
          Dashboard
        </Link>
      </main>
    );
  }
  const { authorization, client } = await pageServices();
  await authorization.requirePermission(ctx.organizationId, 'invoice.view');
  const { from: start, to: finish } = currentMonthIndia();
  const params = await searchParams;
  const from = params.from ?? start;
  const to = params.to ?? finish;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const invalid =
    !date.test(from) ||
    !date.test(to) ||
    Number.isNaN(Date.parse(from)) ||
    Number.isNaN(Date.parse(to)) ||
    new Date(from).toISOString().slice(0, 10) !== from ||
    new Date(to).toISOString().slice(0, 10) !== to ||
    from > to ||
    Number(new Date(to)) - Number(new Date(from)) > 366 * 86400000;
  const repo = createGstTemplatesRepository(client);
  let sales: Awaited<ReturnType<typeof repo.filingRows>> = [];
  let purchases: Awaited<ReturnType<typeof repo.filingRows>> = [];
  let issue = '';
  if (!invalid) {
    try {
      [sales, purchases] = await Promise.all([
        repo.filingRows(ctx.organizationId, from, to, 'sales_invoice'),
        repo.filingRows(ctx.organizationId, from, to, 'purchase_bill'),
      ]);
    } catch {
      issue =
        'Unable to load this period. For busy periods, select a shorter date range.';
    }
  }
  const qs = (
    kind: 'sales_invoice' | 'purchase_bill',
    format: 'summary' | 'items',
  ) =>
    '/dashboard/billing/gst-reports/export?' +
    new URLSearchParams({ from, to, kind, format }).toString();
  const total = (
    rows: typeof sales,
    key: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'total',
  ) => rows.reduce((sum, row) => sum + Number(row[key]), 0);
  const ready = !invalid && !issue;
  return (
    <main
      id="main-content"
      className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-950 sm:px-7"
    >
      <nav className="text-xs font-medium text-slate-500">
        <Link href="/dashboard/billing" className="hover:text-blue-700">
          ← Back to billing
        </Link>
      </nav>
      <header className="rounded-3xl bg-slate-950 px-6 py-8 text-white sm:px-9">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-300">
          India GST · Filing preparation
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">GST filing workpapers</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Export finalized sales and recorded supplier bills into consistent
          Excel-compatible CSVs. Your accountant can use these to prepare
          GSTR-1/3B summaries and compare purchases with GSTR-2B. This is not
          GSTN filing or automatic input tax-credit eligibility verification.
        </p>
      </header>
      <form
        action="/dashboard/billing/gst-reports"
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label className="grid flex-1 gap-2 text-xs font-bold text-slate-700">
          From date
          <input
            name="from"
            required
            type="date"
            defaultValue={from}
            className="min-w-[150px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950"
          />
        </label>
        <label className="grid flex-1 gap-2 text-xs font-bold text-slate-700">
          Through date
          <input
            name="to"
            required
            type="date"
            defaultValue={to}
            className="min-w-[150px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white"
        >
          Apply period
        </button>
      </form>
      {(invalid || issue) && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {invalid
            ? 'Enter real dates in order, with a range of 366 days or less.'
            : issue}
        </p>
      )}
      {ready && (
        <>
          <section
            aria-label="GST report totals"
            className="grid gap-3 sm:grid-cols-3"
          >
            {[
              {
                label: 'Issued sales invoices',
                value: String(sales.length),
                detail: 'Sales register, final invoices only',
              },
              {
                label: 'Output GST on sales',
                value: money(
                  total(sales, 'cgst') +
                    total(sales, 'sgst') +
                    total(sales, 'igst'),
                ),
                detail: 'Before adjustments or return reconciliation',
              },
              {
                label: 'Recorded purchase bills',
                value: String(purchases.length),
                detail: 'Supplier bills for reconciliation',
              },
            ].map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="text-xs font-semibold text-slate-600">
                  {item.label}
                </p>
                <p className="mt-3 text-2xl font-extrabold text-slate-950">
                  {item.value}
                </p>
                <p className="mt-2 text-xs text-slate-500">{item.detail}</p>
              </article>
            ))}
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-extrabold">Sales filing register</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Includes issuer/recipient GSTIN, invoice number, date, document
                type, place of supply, taxable value and IGST/CGST/SGST.
                Item-level export adds HSN/SAC, quantity and tax rate.
              </p>
              <p className="mt-4 text-sm font-semibold">
                Taxable sales: {money(total(sales, 'taxable'))}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={qs('sales_invoice', 'summary')}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white"
                >
                  Download sales CSV
                </a>
                <a
                  href={qs('sales_invoice', 'items')}
                  className="rounded-xl border border-blue-200 px-4 py-3 text-xs font-bold text-blue-700"
                >
                  Download HSN/SAC lines
                </a>
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-extrabold">
                Purchase reconciliation register
              </h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Original supplier invoice numbers and GSTIN, invoice dates,
                taxable purchases and GST break-up. Compare against downloaded
                GSTR-2B before considering any input tax credit.
              </p>
              <p className="mt-4 text-sm font-semibold">
                Recorded purchases: {money(total(purchases, 'total'))}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={qs('purchase_bill', 'summary')}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white"
                >
                  Download purchases CSV
                </a>
                <a
                  href={qs('purchase_bill', 'items')}
                  className="rounded-xl border border-blue-200 px-4 py-3 text-xs font-bold text-blue-700"
                >
                  Download purchase items
                </a>
              </div>
            </article>
          </section>
        </>
      )}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <h2 className="font-extrabold">GST review checklist</h2>
        <p className="mt-2">
          Confirm GSTIN and HSN/SAC accuracy, place of supply, reverse charge,
          applicable rates, credit/debit notes, advance receipts, exempt
          supplies, e-invoicing obligations and tax period. Drafts and
          unrecorded supplier invoices are excluded. These exports are working
          papers, not official GSTR JSON, and do not file returns or validate
          GSTR-2B matches.
        </p>
      </section>
    </main>
  );
}
