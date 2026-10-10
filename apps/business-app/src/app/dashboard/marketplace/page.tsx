import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { placeMarketplaceOrder } from './actions';

export const dynamic = 'force-dynamic';

export default async function Marketplace({
  searchParams,
}: {
  searchParams: Promise<{ industry?: string; q?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { authorization, repository, client } = await pageServices();
  const context = await activeOrganization();
  const industries = await repository.industries();
  if (!context) {
    return (
      <main className="dashboard-shell" id="main-content">
        <h1>Material marketplace</h1>
        <p>Select a company workspace to browse business supplier rates.</p>
        <Link className="premium-link-secondary" href="/dashboard">
          Select company →
        </Link>
      </main>
    );
  }
  await authorization.requirePermission(
    context.organizationId,
    'purchase.view',
  );
  const industryId = industries.some((item) => item.id === params.industry)
    ? params.industry
    : undefined;
  const query = params.q?.trim().slice(0, 80) || '';
  const marketplace = createMarketplaceRepository(client);
  const products = await marketplace.catalog(
    context.organizationId,
    industryId,
    query,
  );
  const canOrder = context.grants.some(
    (grant) =>
      grant.permission === 'purchase.manage' &&
      grant.scope.kind === 'organization',
  );
  const currency = (await repository.organization(context.organizationId))
    .default_currency;

  return (
    <main id="main-content" className="dashboard-shell tenant-dashboard-v2">
      <header className="tenant-v2-topbar">
        <Link className="tenant-v2-brand" href="/dashboard">
          <span className="tenant-v2-monogram">P</span>
          <span>
            <strong>ProPulse B2B Marketplace</strong>
            <small>Supplier rates across industries</small>
          </span>
        </Link>
        <Link className="premium-link-secondary" href="/dashboard">
          ← Business dashboard
        </Link>
      </header>
      <section className="tenant-v2-hero">
        <div>
          <p className="eyebrow">Business-to-business sourcing</p>
          <h1>Find materials for your business.</h1>
          <p className="tenant-v2-lead">
            Browse verified sellers and published rates across all active
            industries. Prices, units and minimum quantities come directly from
            suppliers.
          </p>
          <div className="tenant-v2-hero-actions">
            <Link
              className="premium-link-secondary"
              href="/dashboard/marketplace/orders"
            >
              My purchase requests →
            </Link>
            <Link
              className="premium-link-secondary"
              href="/dashboard/marketplace/seller"
            >
              Seller account →
            </Link>
          </div>
        </div>
        <div className="tenant-v2-art" aria-hidden="true">
          <span>B2B</span>
        </div>
      </section>
      <section className="tenant-v2-panel" aria-label="Search products">
        <form
          className="flex flex-wrap gap-3 items-end"
          method="GET"
          action="/dashboard/marketplace"
        >
          <label className="grid gap-2 flex-1 min-w-40">
            Industry
            <select
              name="industry"
              defaultValue={industryId ?? ''}
              className="w-full rounded-lg border p-3 text-slate-900 bg-white"
            >
              <option value="">All industries</option>
              {industries.map((industry) => (
                <option key={industry.id} value={industry.id}>
                  {industry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 flex-1 min-w-48">
            Search material
            <input
              name="q"
              maxLength={80}
              defaultValue={query}
              placeholder="Plywood, steel, tiles, supplies..."
              className="w-full rounded-lg border p-3 text-slate-900 bg-white"
            />
          </label>
          <button className="premium-link" type="submit">
            Find products
          </button>
        </form>
      </section>
      {params.error && (
        <p role="alert" className="tenant-v2-alert">
          Request not completed ({params.error}). Check your quantity, currency,
          seller status and permissions.
        </p>
      )}
      <div className="flex justify-between items-center flex-wrap gap-3 my-5">
        <h2 className="text-xl font-bold">
          Available supplier listings ({products.length})
        </h2>
        <small className="muted">
          Your company currency: {currency}. Orders use supplier rates without
          FX conversion.
        </small>
      </div>
      {products.length === 0 && (
        <div className="tenant-v2-panel">
          <h3 className="text-lg font-bold">No matching products yet</h3>
          <p className="muted">
            Approved sellers can publish listings for any industry enabled on
            their company account.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {products.map((product) => {
          const eligible =
            canOrder &&
            product.sellerOrganizationId !== context.organizationId &&
            product.currency === currency;
          return (
            <article key={product.id} className="tenant-v2-panel">
              <p className="eyebrow">
                {product.industry} · {product.category}
              </p>
              <h3 className="text-lg font-bold">{product.name}</h3>
              <p className="muted mt-1">
                Supplier: {product.seller} · SKU: {product.sku}
              </p>
              <p className="text-2xl font-extrabold mt-5">
                {product.currency}{' '}
                {Number(product.price).toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
                <span className="text-sm font-normal muted">
                  {' '}
                  / {product.unit}
                </span>
              </p>
              <p className="muted my-3">
                Minimum order: {product.minQuantity} {product.unit}
              </p>
              {eligible ? (
                <form
                  action={placeMarketplaceOrder}
                  className="flex flex-wrap gap-2 items-end mt-4"
                >
                  <input type="hidden" name="productId" value={product.id} />
                  <input
                    type="hidden"
                    name="requestKey"
                    value={crypto.randomUUID()}
                  />
                  <label className="grid flex-1 min-w-20 gap-1">
                    Quantity
                    <input
                      name="quantity"
                      type="number"
                      step="0.001"
                      min={product.minQuantity}
                      max={1000000}
                      defaultValue={product.minQuantity}
                      required
                      className="w-full rounded-lg border p-3 text-slate-900 bg-white"
                    />
                  </label>
                  <button type="submit" className="premium-link">
                    Request purchase
                  </button>
                </form>
              ) : (
                <p className="muted mt-4 text-sm">
                  {!canOrder
                    ? 'Purchase authorization required'
                    : product.sellerOrganizationId === context.organizationId
                      ? 'Your own listing'
                      : 'Currency differs from your company; request a same-currency listing'}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="muted my-6 text-sm">
        Submitting creates a purchase request at the displayed rate, subject to
        seller acceptance. No online payment, tax, delivery charge, stock
        reservation, or confirmed sale is processed yet.
      </p>
    </main>
  );
}
