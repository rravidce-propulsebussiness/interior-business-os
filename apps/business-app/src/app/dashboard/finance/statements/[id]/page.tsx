import Link from 'next/link';
import { z } from 'zod';
import { notFound } from 'next/navigation';
import { financeServices } from '../../service';
import { Metrics, RecordList, titles } from '../../presentation';

export default async function CustomerStatement({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params,
    q = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = await financeServices('financial_report.view', true);
  const sections = [
    ['contracts', 'contract.view'],
    ['invoices', 'invoice.view'],
    ['payments', 'payment.view'],
    ['payment_allocations', 'payment.view'],
    ['receipts', 'receipt.view'],
    ['change_orders', 'change_order.view'],
  ].filter(([, permission]) => s.allowed(permission!));
  const tab =
    sections.find(([entity]) => entity === q.tab)?.[0] ?? sections[0]?.[0];
  const page = Math.max(1, Number(q.page) || 1);
  const summary = await s.finance.summary(undefined, id);
  const result = tab
    ? await s.finance.search(tab, { customer_id: id }, page)
    : { rows: [], total: 0 };
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">Customer account statement</h1>
      <p className="my-3">
        Current commercial position, grouped by currency. Invoices and
        allocations determine outstanding balances; receipts preserve the
        original payment acknowledgment.
      </p>
      <Metrics data={summary} />
      <nav
        aria-label="Statement sections"
        className="my-5 flex flex-wrap gap-4"
      >
        {sections.map(([entity]) => (
          <Link className="underline" key={entity} href={`?tab=${entity}`}>
            {titles[entity!]}
          </Link>
        ))}
      </nav>
      {tab && (
        <>
          <h2 className="text-2xl">{titles[tab]}</h2>
          <RecordList entity={tab} rows={result.rows} />
          <nav className="flex gap-4">
            {page > 1 && (
              <Link href={`?tab=${tab}&page=${page - 1}`}>Previous</Link>
            )}
            {page * 25 < result.total && (
              <Link href={`?tab=${tab}&page=${page + 1}`}>Next</Link>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
