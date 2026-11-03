import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OsIcon } from '../dashboard-shell';
import { WebsitePlatformControls } from '../website/controls';

export default async function DomainManagement() {
  const services = await pageServices();
  try {
    await services.authorization.requirePlatformPermission(
      'platform.entitlements.manage',
    );
    await services.authorization.requirePlatformPermission(
      'platform.catalog.view',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  const [settings, plans, limits] = await Promise.all([
    services.client.from('website_platform_settings').select('*').single(),
    services.repository.plans(),
    services.client
      .from('website_plan_limits')
      .select('plan_id,configuration'),
  ]);
  if (settings.error || limits.error)
    throw new Error('Domain controls unavailable');

  return (
    <main id="main-content" tabIndex={-1}>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-600">
        Platform infrastructure
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="os-secondary-heading">Domain Management</h1>
          <p className="os-secondary-subtitle">
            Configure shared domain infrastructure and plan capabilities.
            Company website content is managed by authorized company members
            and assigned Website Developers in the Business App.
          </p>
        </div>
        <Link className="os-action secondary" href="/dashboard/plans">
          Manage membership plans →
        </Link>
      </div>

      <div className="os-stats-grid os-domain-summary mt-6">
        <dl className="os-stat" style={{ gridColumn: 'span 2' }}>
          <div className="os-stat-icon os-icon-blue">
            <OsIcon name="domain" size={24} />
          </div>
          <div>
            <dt>Managed base hostname</dt>
            <dd className="text-base!" style={{ overflowWrap: 'anywhere' }}>
              {settings.data.base_domain || 'Not configured'}
            </dd>
            <p className="os-stat-note">
              CNAME destination for verified external domains
            </p>
          </div>
        </dl>
        <dl className="os-stat" style={{ gridColumn: 'span 2' }}>
          <div className="os-stat-icon os-icon-purple">
            <OsIcon name="check" size={24} />
          </div>
          <div>
            <dt>Wildcard TLS configuration</dt>
            <dd className="text-base!">
              {settings.data.managed_subdomain_tls
                ? 'Marked configured'
                : 'Not configured'}
            </dd>
            <p className="os-stat-note">
              Hosting must separately provision and verify live certificates
            </p>
          </div>
        </dl>
      </div>

      <section className="os-resource-panel mt-6">
        <h2 className="mb-4 text-xl font-semibold">
          Platform domain and plan configuration
        </h2>
        <p className="os-secondary-subtitle mb-5">
          These controls apply to infrastructure, allowed website features and
          subscription limits. They do not edit any company website.
        </p>
        <WebsitePlatformControls
          baseDomain={settings.data.base_domain ?? ''}
          managedTls={settings.data.managed_subdomain_tls}
          plans={plans.map((plan) => {
            const raw = limits.data.find(
              (item) => item.plan_id === plan.id,
            )?.configuration;
            const configuration: Record<string, number | boolean> = {};
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
              for (const [key, value] of Object.entries(raw)) {
                if (typeof value === 'number' || typeof value === 'boolean')
                  configuration[key] = value;
              }
            }
            return { ...plan, configuration };
          })}
          allowedEmbeds={
            Array.isArray(settings.data.allowed_embeds)
              ? settings.data.allowed_embeds.filter(
                  (host): host is string => typeof host === 'string',
                )
              : []
          }
          disabledComponents={
            Array.isArray(settings.data.disabled_components)
              ? settings.data.disabled_components.filter(
                  (component): component is string =>
                    typeof component === 'string',
                )
              : []
          }
        />
      </section>

      <section className="os-resource-panel mt-6">
        <div className="os-panel-heading">
          <h2>How companies connect their domains</h2>
        </div>
        <p className="os-secondary-subtitle">
          Company Owners and assigned Website Developers with the required
          permissions manage their own website and domain claims. Super Admin
          does not modify tenant website content.
        </p>
        <div className="os-domain-steps">
          <div className="os-domain-step">
            <div className="os-stat-icon os-icon-blue">
              <OsIcon name="website" size={22} />
            </div>
            <strong>1. Add the custom domain</strong>
            In the Business App, open Website Studio → Domains and register
            the customer's hostname.
          </div>
          <div className="os-domain-step">
            <div className="os-stat-icon os-icon-purple">
              <OsIcon name="domain" size={22} />
            </div>
            <strong>2. Configure external DNS</strong>
            Add the supplied ownership TXT record and point the hostname's
            CNAME to the platform destination.
          </div>
          <div className="os-domain-step">
            <div className="os-stat-icon os-icon-green">
              <OsIcon name="check" size={22} />
            </div>
            <strong>3. Verify HTTPS and publish</strong>
            Hosting or the optional Cloudflare adapter provisions TLS;
            the Business App verifies DNS and HTTPS before activation.
          </div>
        </div>
        <p className="os-warning mt-5">
          Domain connection is not domain registration or transfer.
          A configured TLS checkbox does not prove live HTTPS is working.
          Customer websites must pass DNS and certificate verification.
        </p>
      </section>
    </main>
  );
}
