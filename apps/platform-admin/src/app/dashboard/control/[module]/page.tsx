import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OsIcon } from '../../dashboard-shell';

const directory = {
  marketplace: {
    title: 'Marketplace',
    intro: 'Platform industry packs, enabled modules and organization access.',
    keywords: ['marketplace', 'industry', 'website'],
    note: 'The current platform has a module registry, not a cross-tenant public lead marketplace. Marketplace listings and lead purchasing require a separate verified product workflow.',
    next: 'Review organizations and their module access.',
  },
  memberships: {
    title: 'Membership Plans',
    intro: 'Review available plans and grant per-company feature access.',
    keywords: [],
    note: 'Plan definitions are persisted in the platform catalog. Plan assignment and time-bounded module overrides are supported today; subscriptions and online payments must not be implied from plan labels.',
    next: 'Open a tenant to assign a plan or edit its entitlement overrides.',
  },
  billing: {
    title: 'Billing & Payments',
    intro: 'Subscription controls and tenant finance governance.',
    keywords: ['billing', 'invoice', 'finance'],
    note: 'Business-level invoices, payments and contractual documents are tenant-isolated. Platform subscription charging, payouts and payment gateway processing need a dedicated auditable platform finance service.',
    next: 'Configure the Billing entitlement for individual organizations.',
  },
  quotations: {
    title: 'Quotations',
    intro:
      'Enable the existing quotation engine and pricing configuration per business.',
    keywords: ['quotation', 'catalog', 'pricing'],
    note: "Company-specific price books, item questions, modifiers and immutable issued quotations belong to each tenant. Platform access alone does not authorize editing a tenant's customer quotations.",
    next: "Review a business's quotation entitlement.",
  },
  crm: {
    title: 'CRM & Leads',
    intro: 'Control access to leads, customers and follow-up workflows.',
    keywords: ['crm', 'customer', 'sales'],
    note: 'Canonical CRM leads and contacts are tenant-isolated. Platform-wide lead content is not exposed to Super Admin without a specific audited support workflow.',
    next: "Review a tenant's CRM entitlement.",
  },
  projects: {
    title: 'Project Management',
    intro: 'Configure access to execution, inspections and handover features.',
    keywords: ['project', 'inventory', 'procurement'],
    note: 'Tenant project records remain subject to branch, role and project assignment checks, including site engineer and manager permissions.',
    next: "Review a tenant's projects entitlement.",
  },
  settings: {
    title: 'Settings & Customization',
    intro:
      'Manage organization-level modules and optional website capabilities.',
    keywords: [],
    note: 'Each company has its own plan and entitlement configuration. Website base hostnames and limits are managed separately in platform website settings.',
    next: 'Select a tenant to manage module entitlements, or open website settings.',
  },
  reports: {
    title: 'Reports & Analytics',
    intro:
      'Platform operational reporting and secure tenant status aggregates.',
    keywords: ['reports', 'analytics'],
    note: 'The dashboard displays existing authorized directory aggregates. Cross-tenant revenue, CRM and project reporting has not been authorized or implemented.',
    next: 'Inspect platform automation worker health or browse organizations.',
  },
  integrations: {
    title: 'Integrations',
    intro:
      'Platform website routing, supported embeds and delivery configuration.',
    keywords: ['website', 'integration'],
    note: 'External domain TLS provisioning and external payment/marketplace providers require real hosting integrations and credentials, not a generic configuration toggle.',
    next: 'Configure supported embeds and website infrastructure.',
  },
  notifications: {
    title: 'Notifications',
    intro: 'Platform operational status and background job visibility.',
    keywords: ['automation', 'notification'],
    note: 'Audit-sensitive alerts must be based on events, not synthetic activity. The existing automation health report is the current supported platform monitoring entry point.',
    next: 'Open automation worker health.',
  },
} as const;

export default async function PlatformControlModule({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const slug = (await params).module as keyof typeof directory;
  const config = directory[slug];
  if (!config) notFound();
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
  const [tenants, modules, plans, mappings] = await Promise.all([
    repository.organizationDirectory({ page: 1, pageSize: 8 }),
    repository.modules(),
    repository.plans(),
    repository.planModules(),
  ]);
  const keywords: readonly string[] = config.keywords;
  const related = keywords.length
    ? modules.filter((mod) =>
        keywords.some(
          (key) =>
            mod.key.toLowerCase().includes(key) ||
            mod.name.toLowerCase().includes(key),
        ),
      )
    : modules;
  const assigned = new Map(plans.map((p) => [p.id, p.name]));

  return (
    <main id="main-content" tabIndex={-1}>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">
        ProPulse Business OS · Platform
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="os-secondary-heading">{config.title}</h1>
          <p className="os-secondary-subtitle">{config.intro}</p>
        </div>
        <Link href="/dashboard/organizations" className="os-action">
          Manage tenants <OsIcon name="arrow" size={16} />
        </Link>
      </div>

      <div className="os-content-grid mt-6">
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Registered business capabilities</h2>
            <Link href="/dashboard/organizations">Configure per tenant ↗</Link>
          </div>
          <div className="os-activity-list">
            {related.map((mod) => (
              <div className="os-activity-item" key={mod.id}>
                <span
                  className="os-module-icon os-icon-blue"
                  style={{ height: 38, width: 38 }}
                >
                  <OsIcon name="settings" size={19} />
                </span>
                <div>
                  <p>{mod.name}</p>
                  <small>
                    {mod.key} · {mod.status}
                  </small>
                </div>
              </div>
            ))}
            {!related.length && (
              <p className="os-empty">
                No matching module is registered. This platform feature requires
                additional backend configuration.
              </p>
            )}
          </div>
        </section>
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Plan Configuration</h2>
          </div>
          {plans.map((plan) => (
            <div className="os-guide-item" key={plan.id}>
              <span className="os-guide-step">
                <OsIcon name="crown" size={13} />
              </span>
              <div>
                <strong>{plan.name}</strong>{' '}
                <span className="os-pill">{plan.status}</span>
                <p>
                  {modules
                    .filter((m) =>
                      mappings.some(
                        (p) => p.plan_id === plan.id && p.module_id === m.id,
                      ),
                    )
                    .map((m) => m.name)
                    .join(', ') || 'No modules assigned'}
                </p>
              </div>
            </div>
          ))}
          {!plans.length && (
            <p className="os-empty">No membership plans registered.</p>
          )}
          <div className="os-warning mt-5">{config.note}</div>
          <p className="os-secondary-subtitle mt-4">{config.next}</p>
        </section>
      </div>

      <section className="os-resource-panel">
        <div className="os-panel-heading">
          <h2>Company-specific access</h2>
          <Link href="/dashboard/organizations">All organizations ↗</Link>
        </div>
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Current plan</th>
                <th>Status</th>
                <th>Configuration</th>
              </tr>
            </thead>
            <tbody>
              {tenants.organizations.map((org) => (
                <tr key={org.id}>
                  <td style={{ fontWeight: 700 }}>{org.name}</td>
                  <td>
                    {org.plan_id
                      ? (assigned.get(org.plan_id) ?? 'Assigned')
                      : 'No plan'}
                  </td>
                  <td>
                    <span className={`os-pill ${org.status}`}>
                      {org.status}
                    </span>
                  </td>
                  <td>
                    <Link href={`/dashboard/organizations/${org.id}`}>
                      Manage organization ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tenants.organizations.length && (
            <p className="os-empty">No tenant organizations yet.</p>
          )}
        </div>
      </section>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/dashboard/website" className="os-action secondary">
          Website capabilities
        </Link>
        <Link href="/dashboard/domains" className="os-action secondary">
          Domain center
        </Link>
        <Link href="/dashboard/automations" className="os-action secondary">
          Automation health
        </Link>
      </div>
    </main>
  );
}
