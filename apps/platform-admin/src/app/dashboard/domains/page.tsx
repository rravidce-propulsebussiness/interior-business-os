import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OsIcon } from '../dashboard-shell';

export default async function DomainManagement() {
  const services = await pageServices();
  try {
    await services.authorization.requirePlatformPermission('platform.entitlements.manage');
    await services.authorization.requirePlatformPermission('platform.catalog.view');
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  const [settings, websites] = await Promise.all([
    services.client.from('website_platform_settings').select('base_domain,managed_subdomain_tls').single(),
    services.client.rpc('website_platform_list', {}),
  ]);
  if (settings.error || websites.error) throw new Error('Domain controls unavailable');
  const sites = Array.isArray(websites.data)
    ? websites.data.flatMap((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          && typeof item.id === 'string' && typeof item.name === 'string'
          && typeof item.organization === 'string' && typeof item.status === 'string'
          ? [{ id: item.id, name: item.name, organization: item.organization, status: item.status }] : [],
      )
    : [];

  return (
    <main id="main-content" tabIndex={-1}>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">Website infrastructure</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="os-secondary-heading">Domain Management</h1>
          <p className="os-secondary-subtitle">Connect websites to domains purchased from any registrar, without transferring registration.</p>
        </div>
        <Link className="os-action" href="/dashboard/website">Platform website configuration →</Link>
      </div>

      <div className="os-stats-grid os-domain-summary mt-6">
        <dl className="os-stat" style={{ gridColumn: 'span 2' }}>
          <div className="os-stat-icon os-icon-blue"><OsIcon name="domain" size={24} /></div>
          <div><dt>Managed base hostname</dt><dd className="text-base!" style={{ overflowWrap: 'anywhere' }}>{settings.data.base_domain || 'Not configured'}</dd><p className="os-stat-note">CNAME destination for verified external domains</p></div>
        </dl>
        <dl className="os-stat">
          <div className="os-stat-icon os-icon-green"><OsIcon name="website" /></div>
          <div><dt>Known websites</dt><dd>{sites.length.toLocaleString('en-IN')}</dd><p className="os-stat-note">Platform website registry</p></div>
        </dl>
        <dl className="os-stat" style={{ gridColumn: 'span 2' }}>
          <div className="os-stat-icon os-icon-purple"><OsIcon name="check" size={24} /></div>
          <div><dt>Wildcard TLS configuration</dt><dd className="text-base!">{settings.data.managed_subdomain_tls ? 'Marked configured' : 'Not configured'}</dd><p className="os-stat-note">Live certificate provisioning requires hosting setup and verification</p></div>
        </dl>
      </div>

      <section className="os-resource-panel">
        <div className="os-panel-heading"><h2>Connect a customer's existing domain</h2><Link href="/dashboard/website">Configure domain settings ↗</Link></div>
        <p className="os-secondary-subtitle">The existing tenant Website → Domains workflow creates a unique domain claim and a one-time DNS ownership challenge. The Super Admin controls the platform base hostname, entitlements and website suspensions; modifying a tenant's domain currently requires the tenant's own authorized website session.</p>
        <div className="os-domain-steps">
          <div className="os-domain-step">
            <div className="os-stat-icon os-icon-blue"><OsIcon name="website" size={22} /></div>
            <strong>1. Add the website domain</strong>
            In the business workspace, open Website Studio → Domains and add <code>www.customer.com</code>. This creates a unique claim and TXT challenge. Enable the customer's custom-domain entitlement when required.
          </div>
          <div className="os-domain-step">
            <div className="os-stat-icon os-icon-purple"><OsIcon name="domain" size={22} /></div>
            <strong>2. Update external DNS</strong>
            At the existing registrar, create <code>_business-os.www.customer.com</code> as a TXT record with the generated verification value. Point the hostname's CNAME to <code>{settings.data.base_domain || 'your configured platform hostname'}</code>.
          </div>
          <div className="os-domain-step">
            <div className="os-stat-icon os-icon-green"><OsIcon name="check" size={22} /></div>
            <strong>3. Provision TLS and verify</strong>
            Configure routing and a valid certificate for the hostname on the hosting provider. Use the tenant's Verify DNS and HTTPS action to validate ownership and secure delivery before activation.
          </div>
        </div>
        <p className="os-warning mt-5">Domain connection and domain registration transfer are different operations. The current Business OS verifies DNS and an already provisioned TLS certificate; it does not purchase or transfer domain registrations or automatically issue certificates. Do not mark a domain live until both DNS and HTTPS verification succeed.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="os-action" href="/dashboard/website">Configure domain/TLS platform →</Link>
          <Link className="os-action secondary" href="/dashboard/organizations">Select customer tenant →</Link>
        </div>
      </section>

      <section className="os-resource-panel">
        <div className="os-panel-heading"><h2>Website registry</h2><Link href="/dashboard/website">Manage sites ↗</Link></div>
        <div className="os-table-wrap">
          <table className="os-table">
            <thead><tr><th>Website</th><th>Organization</th><th>Status</th><th>Platform action</th></tr></thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <td style={{ fontWeight: 700 }}>{site.name}</td>
                  <td>{site.organization}</td>
                  <td><span className={`os-pill ${site.status}`}>{site.status}</span></td>
                  <td><Link href="/dashboard/website">Manage website ↗</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sites.length === 0 && <p className="os-empty">No websites registered yet.</p>}
        </div>
      </section>
    </main>
  );
}
