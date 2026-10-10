import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OsIcon } from '../../dashboard-shell';

export const dynamic = 'force-dynamic';
export default async function PlatformBilling() {
  const { authorization, repository } = await pageServices();
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    await authorization.requirePlatformPermission('platform.catalog.view');
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }
  const [companies, modules, plans] = await Promise.all([
    repository.organizationDirectory({ page: 1, pageSize: 20 }),
    repository.modules(),
    repository.plans(),
  ]);
  const billing = modules.find((m) => m.key === 'billing');
  const planNames = new Map(plans.map((p) => [p.id, p.name]));
  return (
    <main id="main-content" tabIndex={-1}>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-teal-600">
        ProPulse Business OS · Platform Finance
      </p>
      <div className="mt-3 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="os-secondary-heading">
            Billing &amp; GST preparation
          </h1>
          <p className="os-secondary-subtitle">
            Business owners and sellers manage their own invoices, incoming
            purchase bills, payment records and GST details. Super Admin
            configures their access here.
          </p>
        </div>
        <Link className="os-action" href="/admin/organizations">
          Manage companies <OsIcon name="arrow" size={16} />
        </Link>
      </div>
      <section className="os-stats-grid mt-5">
        <dl className="os-stat">
          <div>
            <dt>Registered companies</dt>
            <dd>{companies.total}</dd>
          </div>
        </dl>
        <dl className="os-stat">
          <div>
            <dt>Billing module</dt>
            <dd>{billing?.status === 'active' ? 'Active' : 'Not active'}</dd>
          </div>
        </dl>
        <dl className="os-stat">
          <div>
            <dt>Subscription plans</dt>
            <dd>{plans.length}</dd>
          </div>
        </dl>
      </section>
      <div className="os-content-grid mt-6">
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>What each company can do</h2>
          </div>
          <div className="os-activity-list">
            {[
              [
                'Sales invoices',
                'Create, issue and print GST-preparation invoices with business GSTIN, HSN/SAC and split tax amounts.',
              ],
              [
                'Purchase bills',
                'Record supplier-issued bills with the supplier’s original reference and amounts.',
              ],
              [
                'Payments',
                'Record offline money received or paid and track outstanding balances.',
              ],
              [
                'GST details',
                'Maintain a private organization billing profile and business tax configuration.',
              ],
            ].map(([title, description]) => (
              <div key={title} className="os-activity-item">
                <span className="os-module-icon os-icon-blue">
                  <OsIcon name="billing" size={18} />
                </span>
                <div>
                  <p>{title}</p>
                  <small>{description}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Financial compliance boundaries</h2>
          </div>
          <p className="os-secondary-subtitle">
            GST values are prepared from manually selected HSN/SAC and tax
            rates. Tax treatment must be reviewed by the issuer. Government
            e-invoice registration (IRN/QR), GSTR filing, payment gateways, ITC
            reconciliation and legal verification are not implemented.
          </p>
          <div className="os-warning mt-5">
            Tenant invoices, bills, customers and payments remain private to
            their organizations. Platform Super Admin does not impersonate
            business owners or access their documents in this console.
          </div>
          <Link href="/admin/plans" className="os-action secondary mt-5">
            Configure billing entitlements ↗
          </Link>
          <Link
            href="/admin/organizations"
            className="os-action secondary mt-3"
          >
            Manage per-company settings ↗
          </Link>
        </section>
      </div>
      <section className="os-resource-panel mt-5">
        <div className="os-panel-heading">
          <h2>Company billing access</h2>
          <Link href="/admin/organizations">All companies ↗</Link>
        </div>
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Company controls</th>
              </tr>
            </thead>
            <tbody>
              {companies.organizations.map((org) => (
                <tr key={org.id}>
                  <td className="font-semibold">{org.name}</td>
                  <td>
                    {org.plan_id
                      ? (planNames.get(org.plan_id) ?? 'Assigned')
                      : 'Not assigned'}
                  </td>
                  <td>
                    <span className="os-pill">{org.status}</span>
                  </td>
                  <td>
                    <Link href={'/admin/organizations/' + org.id}>
                      Manage access ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.organizations.length === 0 && (
            <p className="os-empty">No registered companies yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
