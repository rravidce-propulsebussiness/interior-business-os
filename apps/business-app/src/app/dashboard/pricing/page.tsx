import Link from 'next/link';
import { catalogPage } from '../catalog/access';
import { ConfigForm } from '../catalog/forms';
import { RateStatus } from './rate-status';
export default async function PricingPage() {
  const { catalog, org, canManagePrice, canCost } = await catalogPage(true);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-6xl px-6 py-10"
    >
      <Link href="/dashboard/catalog">Catalog</Link>
      <h1 className="my-6 text-3xl font-semibold">Pricing</h1>
      <section className="mb-8 rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
          Construction estimates
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-slate-950">
          Material &amp; brand pricing by sq ft
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Configure choices for steel, bricks, cement mix ratios, painting and
          other materials. Set your company&apos;s rate per sq ft of built-up area;
          authorized quotation users can select the materials and generate a
          rate-verified construction line.
        </p>
        <Link
          href="/dashboard/pricing/construction"
          className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white"
        >
          Configure construction rates →
        </Link>
      </section>
      <section>
        <h2 className="text-2xl">Price books</h2>
        <p className="my-3">
          Selected book → branch default → organization default → item default
          rate. Only one active default per branch and currency is permitted.
        </p>
        {!catalog.books.length && (
          <p>
            No price books configured. Item default rates can still be used.
          </p>
        )}
        {catalog.books.map((b) => (
          <details key={b.id} className="my-4 rounded border p-4">
            <summary>
              {b.name} · {b.currency} · {b.status}
              {b.is_default ? ' · Default' : ''}
            </summary>
            {canManagePrice && (
              <ConfigForm
                entity="price_books"
                catalog={catalog}
                org={org}
                record={b}
                title="Save price book"
              />
            )}
          </details>
        ))}
        {canManagePrice && (
          <details>
            <summary>Add price book</summary>
            <ConfigForm
              entity="price_books"
              catalog={catalog}
              org={org}
              title="Create price book"
            />
          </details>
        )}
      </section>
      <section className="my-8">
        <h2 className="text-2xl">Rate history</h2>
        <p className="my-3">
          Revising an open rate closes its window and creates a new revision.
          Existing calculation snapshots remain unchanged. Times are ISO
          timestamps; end dates are exclusive.
        </p>
        {!catalog.rates.length && <p>No rates yet.</p>}
        {catalog.rates.map((r) => (
          <details key={r.id} className="my-3 rounded border p-4">
            <summary>
              {catalog.items.find((i) => i.id === r.item_id)?.name} ·{' '}
              {r.base_rate} {r.currency} · {r.valid_from} →{' '}
              {r.valid_until ?? 'open'} · {r.status}
            </summary>
            <p>
              Book:{' '}
              {catalog.books.find((b) => b.id === r.price_book_id)?.name ??
                'Item default'}{' '}
              · Minimum: {r.minimum_rate ?? 'none'}
            </p>
            {canCost && (
              <p>
                Internal estimated cost rate:{' '}
                {catalog.costs.find((c) => c.rate_id === r.id)
                  ?.estimated_cost_rate ?? 'Not configured'}
              </p>
            )}
            {canManagePrice && (
              <RateStatus
                org={org}
                id={r.id}
                version={r.version}
                status={r.status}
              />
            )}
            {canManagePrice && !r.valid_until && (
              <ConfigForm
                entity="price_book_items"
                catalog={catalog}
                org={org}
                record={{
                  ...r,
                  id: undefined,
                  version: 1,
                  valid_from: '',
                  valid_until: null,
                }}
                replace={{ id: r.id, version: r.version }}
                title="Create replacement rate"
              />
            )}
          </details>
        ))}
        {canManagePrice && (
          <details>
            <summary>Add rate</summary>
            <ConfigForm
              entity="price_book_items"
              catalog={catalog}
              org={org}
              title="Create rate"
            />
          </details>
        )}
      </section>
    </main>
  );
}
