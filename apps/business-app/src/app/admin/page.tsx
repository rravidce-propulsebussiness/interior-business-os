import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OsIcon } from './admin-shell';

const cards = [
  {
    label: 'Marketplace',
    detail: 'Platform services, industry packs and organization access.',
    icon: 'marketplace',
    hue: 'blue',
    link: '/admin/control/marketplace',
    action: 'View marketplace',
  },
  {
    label: 'Users & Tenants',
    detail: 'Search companies, manage status, permissions and subscriptions.',
    icon: 'users',
    hue: 'purple',
    link: '/admin/organizations',
    action: 'Manage tenants',
  },
  {
    label: 'Membership Plans',
    detail: 'Configure plan assignment and enabled business modules.',
    icon: 'crown',
    hue: 'amber',
    link: '/admin/plans',
    action: 'Manage plans',
  },
  {
    label: 'Billing & Payments',
    detail: 'Review finance capabilities and business-level configuration.',
    icon: 'billing',
    hue: 'green',
    link: '/admin/control/billing',
    action: 'View billing controls',
  },
  {
    label: 'Quotations',
    detail: 'Manage entitlements for configurable quotation workflows.',
    icon: 'quotation',
    hue: 'rose',
    link: '/admin/control/quotations',
    action: 'View quotation controls',
  },
  {
    label: 'CRM & Leads',
    detail: 'Customer pipelines and leads remain isolated per company.',
    icon: 'crm',
    hue: 'cyan',
    link: '/admin/control/crm',
    action: 'View CRM controls',
  },
  {
    label: 'Project Management',
    detail: 'Project workflows, inspections, execution and handover.',
    icon: 'projects',
    hue: 'purple',
    link: '/admin/control/projects',
    action: 'View project controls',
  },
  {
    label: 'Website Builder',
    detail: 'Website limits, publishing capabilities and site controls.',
    icon: 'website',
    hue: 'green',
    link: '/admin/website',
    action: 'Manage websites',
  },
  {
    label: 'Domain Management',
    detail: 'Connect external domains with DNS and HTTPS verification.',
    icon: 'domain',
    hue: 'blue',
    link: '/admin/domains',
    action: 'Manage domains',
  },
] as const;

const statuses = ['active', 'trial', 'suspended', 'archived'] as const;
const hues = ['active', 'trial', 'suspended', 'archived'] as const;
const number = (value: number) => value.toLocaleString('en-IN');

export default async function PlatformDashboard() {
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

  // Use only authorized platform directory aggregates. Do not calculate private
  // cross-tenant customer, lead, payment or project data from business tables.
  const [directory, modules, plans, planModules, ...statusResults] =
    await Promise.all([
      repository.organizationDirectory({ page: 1, pageSize: 6 }),
      repository.modules(),
      repository.plans(),
      repository.planModules(),
      ...statuses.map((status) =>
        repository.organizationDirectory({ page: 1, pageSize: 1, status }),
      ),
    ]);
  const rows = statuses.map((status, index) => ({
    status,
    count: statusResults[index]?.total ?? 0,
    hue: hues[index],
  }));
  const active = rows[0]?.count ?? 0;
  const assignedPlans = new Map(plans.map((plan) => [plan.id, plan.name]));
  const stats = [
    {
      label: 'Total Tenants',
      value: number(directory.total),
      detail: 'Across all statuses',
      icon: 'marketplace',
      hue: 'blue',
    },
    {
      label: 'Active Tenants',
      value: number(active),
      detail: 'Active organizations',
      icon: 'users',
      hue: 'purple',
    },
    {
      label: 'Membership Plans',
      value: number(plans.length),
      detail: 'Available platform plans',
      icon: 'crown',
      hue: 'amber',
    },
    {
      label: 'Business Modules',
      value: number(modules.length),
      detail: 'Configured module catalog',
      icon: 'projects',
      hue: 'green',
    },
    {
      label: 'Total Revenue',
      value: '—',
      detail: 'Platform billing report not connected',
      icon: 'billing',
      hue: 'cyan',
    },
  ] as const;

  return (
    <main id="main-content" tabIndex={-1} className="os-dashboard">
      <div className="os-dashboard-header">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="os-subhead">
            Control your marketplace, tenants, plans, websites and platform
            settings.
          </p>
        </div>
        <Link href="/admin/organizations" className="os-toolbar-link">
          All tenant organizations ↗
        </Link>
      </div>

      <section className="os-stats-grid" aria-label="Platform statistics">
        {stats.map((stat) => (
          <dl className="os-stat" key={stat.label}>
            <div className={`os-stat-icon os-icon-${stat.hue}`}>
              <OsIcon name={stat.icon} size={23} />
            </div>
            <div>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
              <p className="os-stat-note">{stat.detail}</p>
            </div>
          </dl>
        ))}
      </section>

      <div className="os-content-grid">
        <section className="os-panel" aria-label="Platform overview">
          <div className="os-panel-heading">
            <h2>Platform Overview</h2>
            <Link href="/admin/organizations">View all tenants ↗</Link>
          </div>
          <p className="os-secondary-subtitle" style={{ marginTop: 0 }}>
            Live organization status distribution. Historical revenue and lead
            charts require a separately authorized reporting service.
          </p>
          <div className="os-breakdown">
            {rows.map(({ status, count, hue }) => (
              <div key={status} className="os-breakdown-row">
                <span
                  className="os-breakdown-label"
                  style={{ textTransform: 'capitalize' }}
                >
                  {status}
                </span>
                <div
                  className="os-bar-track"
                  role="meter"
                  aria-label={`${status} organizations`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(directory.total, 1)}
                  aria-valuenow={count}
                >
                  <div
                    className={`os-bar-fill ${hue}`}
                    style={{
                      width: `${directory.total ? (count / directory.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{number(count)}</strong>
              </div>
            ))}
          </div>
          <div className="os-breakdown-summary">
            <div className="os-mini-summary">
              <span>Tenant organizations</span>
              <strong>{number(directory.total)}</strong>
            </div>
            <div className="os-mini-summary">
              <span>Plan / module mappings</span>
              <strong>{number(planModules.length)}</strong>
            </div>
          </div>
        </section>
        <section className="os-panel" aria-label="Module availability">
          <div className="os-panel-heading">
            <h2>Platform Modules</h2>
            <Link href="/admin/plans">Manage plans ↗</Link>
          </div>
          <div className="os-activity-list">
            {modules.slice(0, 6).map((module) => (
              <div className="os-activity-item" key={module.id}>
                <span
                  className="os-module-icon os-icon-blue"
                  style={{ width: 36, height: 36, borderRadius: 10 }}
                >
                  <OsIcon name="check" size={17} />
                </span>
                <div>
                  <p>{module.name}</p>
                  <small>
                    {module.status} · {module.key}
                  </small>
                </div>
              </div>
            ))}
            {modules.length === 0 && (
              <p className="os-empty">No modules configured.</p>
            )}
          </div>
        </section>
      </div>

      <div className="os-content-grid">
        <section aria-label="Platform tools" className="os-module-grid">
          {cards.map((card) => (
            <Link key={card.label} href={card.link} className="os-module">
              <span className={`os-module-icon os-icon-${card.hue}`}>
                <OsIcon name={card.icon} size={23} />
              </span>
              <span style={{ minWidth: 0 }}>
                <h3>{card.label}</h3>
                <p>{card.detail}</p>
                <span className="os-module-action">{card.action} →</span>
              </span>
            </Link>
          ))}
        </section>
        <section className="os-panel" aria-label="Quick actions">
          <div className="os-panel-heading">
            <h2>Quick Actions</h2>
          </div>
          <div className="os-activity-list">
            {[
              {
                title: 'Review company applications',
                note: 'Approve new tenant workspaces',
                href: '/admin/applications',
                icon: 'users',
              },
              {
                title: 'Find and configure a tenant',
                note: 'Plan, status and module overrides',
                href: '/admin/organizations',
                icon: 'users',
              },
              {
                title: 'Set website capabilities',
                note: 'Domain entitlements and page limits',
                href: '/admin/website',
                icon: 'website',
              },
              {
                title: 'Connect a custom domain',
                note: 'DNS and HTTPS setup',
                href: '/admin/domains',
                icon: 'domain',
              },
              {
                title: 'Inspect automation health',
                note: 'Worker heartbeats and job status',
                href: '/admin/automations',
                icon: 'reports',
              },
              {
                title: 'Manage brochure capabilities',
                note: 'Brochure entitlements and publishing',
                href: '/admin/brochures',
                icon: 'quotation',
              },
            ].map((item) => (
              <div className="os-activity-item" key={item.href}>
                <span
                  className="os-module-icon os-icon-purple"
                  style={{ height: 37, width: 37, borderRadius: 10 }}
                >
                  <OsIcon
                    name={
                      item.icon as
                        'users' | 'website' | 'domain' | 'reports' | 'quotation'
                    }
                    size={18}
                  />
                </span>
                <div>
                  <p>
                    <Link href={item.href}>{item.title} ↗</Link>
                  </p>
                  <small>{item.note}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="os-empty-metric" style={{ marginTop: 20 }}>
            <strong>Revenue, lead & project trends</strong>
            Available after privacy-safe, platform-level aggregate reporting is
            configured.
          </div>
        </section>
      </div>

      <div className="os-lower-grid">
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Tenant Directory</h2>
            <Link href="/admin/organizations">View all ↗</Link>
          </div>
          <div className="os-table-wrap">
            <table className="os-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {directory.organizations.map((org) => (
                  <tr key={org.id}>
                    <td style={{ fontWeight: 700 }}>{org.name}</td>
                    <td>
                      {org.plan_id
                        ? (assignedPlans.get(org.plan_id) ?? 'Assigned')
                        : 'Not assigned'}
                    </td>
                    <td>
                      <span className={`os-pill ${org.status}`}>
                        {org.status}
                      </span>
                    </td>
                    <td>{org.country_code}</td>
                    <td>
                      <Link href={`/admin/organizations/${org.id}`}>
                        Open ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!directory.organizations.length && (
              <p className="os-empty">
                No tenant organizations yet. Onboarding can begin after an
                organization is created through the existing authorized
                provisioning workflow.
              </p>
            )}
          </div>
        </section>
        <section className="os-panel">
          <div className="os-panel-heading">
            <h2>Domain Connection</h2>
            <Link href="/admin/domains">Details ↗</Link>
          </div>
          <div className="os-guide">
            <div className="os-guide-item">
              <span className="os-guide-step">1</span>
              <div>
                <strong>Add an external domain</strong>
                <p>
                  Use an existing registrar; moving registration is not
                  required.
                </p>
              </div>
            </div>
            <div className="os-guide-item">
              <span className="os-guide-step">2</span>
              <div>
                <strong>Verify domain ownership</strong>
                <p>Publish the required TXT and CNAME records.</p>
              </div>
            </div>
            <div className="os-guide-item">
              <span className="os-guide-step">3</span>
              <div>
                <strong>Provision and verify HTTPS</strong>
                <p>
                  Certificates and routing must be configured by the hosting
                  adapter.
                </p>
              </div>
            </div>
          </div>
          <Link
            className="os-action secondary"
            style={{ marginTop: 14 }}
            href="/admin/domains"
          >
            Open domain center →
          </Link>
        </section>
      </div>
    </main>
  );
}
