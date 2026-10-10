import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { createMarketplaceRepository } from '@business-os/database/marketplace';
import { DomainError } from '@business-os/shared';
import { decideMarketplaceSeller, createMarketplaceIndustry, assignSellerIndustry } from '../../../dashboard/marketplace/actions';

export const dynamic = 'force-dynamic';

export default async function PlatformMarketplace({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; updated?: string }>;
}) {
  const params = await searchParams;
  const { authorization, repository, client } = await pageServices();
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission('platform.catalog.view');
    await authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const marketplace = createMarketplaceRepository(client);
  const [sellers, industries] = await Promise.all([
    marketplace.sellerReview('all'),
    repository.industries(),
  ]);
  const pending = sellers.filter((s) => s.status === 'pending');
  const approved = sellers.filter((s) => s.status === 'approved');
  return (
    <main id="main-content" tabIndex={-1}>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">
        ProPulse Business OS · Marketplace administration
      </p>
      <div className="os-dashboard-header mt-3">
        <div>
          <h1>Marketplace</h1>
          <p className="os-subhead">
            Manage seller onboarding and B2B material supply across every
            enabled industry.
          </p>
        </div>
        <Link className="os-action" href="/admin/organizations">
          Manage companies ↗
        </Link>
      </div>
      {params.error && (
        <p className="os-warning mb-4" role="alert">
          Marketplace action failed ({params.error}). Check seller organization
          status and permissions.
        </p>
      )}
      {params.updated && (
        <p role="status" className="os-warning mb-4">
          Marketplace update saved successfully.
        </p>
      )}
      <section className="os-stats-grid">
        {[
          { label: 'Seller applications', value: pending.length },
          { label: 'Approved sellers', value: approved.length },
          { label: 'Registered sellers', value: sellers.length },
          { label: 'Active industries', value: industries.length },
        ].map((stat) => (
          <dl key={stat.label} className="os-stat">
            <div>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          </dl>
        ))}
      </section>
      <div className="os-content-grid">
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Seller verification</h2>
          </div>
          <p className="os-secondary-subtitle">
            Sellers use their existing company login to apply. Approval is
            required before listings become visible to buyers.
          </p>
          <div className="os-table-wrap mt-4">
            <table className="os-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((seller) => (
                  <tr key={seller.id}>
                    <td>{seller.name}</td>
                    <td>{seller.company}</td>
                    <td>
                      <span className="os-pill">{seller.status}</span>
                    </td>
                    <td>
                      <form
                        action={decideMarketplaceSeller}
                        className="flex flex-wrap gap-2"
                      >
                        <input
                          type="hidden"
                          name="sellerId"
                          value={seller.id}
                        />
                        {seller.status !== 'approved' && (
                          <button
                            name="action"
                            value="approve"
                            type="submit"
                            className="os-action secondary"
                          >
                            Approve
                          </button>
                        )}
                        {seller.status === 'pending' && (
                          <button
                            name="action"
                            value="reject"
                            type="submit"
                            className="os-action secondary"
                          >
                            Reject
                          </button>
                        )}
                        {seller.status === 'approved' && (
                          <button
                            name="action"
                            value="suspend"
                            type="submit"
                            className="os-action secondary"
                          >
                            Suspend
                          </button>
                        )}
                      </form>
                      <form action={assignSellerIndustry} className="flex flex-wrap gap-2 mt-3">
                        <input type="hidden" name="organizationId" value={seller.organizationId}/>
                        <select name="industryId" required aria-label={'Assign industry to ' + seller.name} className="rounded-lg border p-2">
                          {industries.map((industry) => (
                            <option key={industry.id} value={industry.id}>{industry.name}</option>
                          ))}
                        </select>
                        <button type="submit" className="os-action secondary">Assign industry</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sellers.length === 0 && (
            <p className="os-empty">No sellers have applied yet.</p>
          )}
        </section>
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Industry-aware marketplace</h2>
          </div>
          <p className="os-secondary-subtitle">
            Industries come from the platform registry, not a fixed construction
            or interior-only list. Approved suppliers can sell in industries
            linked to their company.
          </p>
          <div className="os-activity-list mt-4">
            {industries.map((industry) => (
              <div className="os-activity-item" key={industry.id}>
                <span className="os-module-icon os-icon-blue">●</span>
                <div>
                  <p>{industry.name}</p>
                  <small>{industry.key}</small>
                </div>
              </div>
            ))}
          </div>
          {industries.length === 0 && (
            <p className="os-empty">No active industry registered.</p>
          )}
          <form action={createMarketplaceIndustry} className="grid gap-3 mt-5">
            <h3 className="font-bold">Add a new industry</h3>
            <label className="grid gap-1 text-sm">Industry key
              <input required name="key" minLength={2} maxLength={64} pattern="[a-z][a-z0-9_]*"
                placeholder="manufacturing" className="rounded-lg border p-3 text-slate-900 bg-white"/>
            </label>
            <label className="grid gap-1 text-sm">Industry name
              <input required name="name" minLength={2} maxLength={100}
                placeholder="Manufacturing" className="rounded-lg border p-3 text-slate-900 bg-white"/>
            </label>
            <button type="submit" className="os-action">Add industry</button>
          </form>
          <div className="os-warning mt-5">
            Purchase requests are not online payments. Tax, shipping, verified
            stock, seller payouts, dispute handling and gateway processing
            require separate integrations and production acceptance.
          </div>
          <Link
            href="/admin/organizations"
            className="os-action secondary mt-4"
          >
            Review company industries
          </Link>
        </section>
      </div>
      <section className="os-resource-panel">
        <h2>B2B workflow</h2>
        <p>
          1. Company owner applies as supplier → 2. Platform verifies seller →
          3. Seller publishes industry-specific items and rates → 4. Authorized
          business buyer requests a quantity → 5. Seller accepts or rejects the
          request.
        </p>
      </section>
    </main>
  );
}
