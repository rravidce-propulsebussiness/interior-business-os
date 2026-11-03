import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageServices } from '@business-os/auth/server';
import { DomainError } from '@business-os/shared';
import { OsIcon } from '../dashboard-shell';
import { WebsitePlatformControls } from '../website/controls';
import './domain-management.css';

export default async function DomainManagement() {
  const services = await pageServices();
  try {
    await services.authorization.requirePlatformPermission(
      'platform.entitlements.manage',
    );
    await services.authorization.requirePlatformPermission(
      'platform.catalog.view',
    );
    await services.authorization.requirePlatformPermission(
      'platform.organizations.view',
    );
    await services.authorization.requirePlatformPermission(
      'platform.organizations.manage',
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  const [settings, plans, limits] = await Promise.all([
    services.client.from('website_platform_settings').select('*').single(),
    services.repository.plans(),
    services.client.from('website_plan_limits').select('plan_id,configuration'),
  ]);
  if (settings.error || limits.error)
    throw new Error('Domain controls unavailable');

  return (
    <main className="os-domain-page" id="main-content" tabIndex={-1}>
      <div className="os-domain-heading">
        <div className="os-domain-heading-copy">
          <span className="os-domain-heading-icon">
            <OsIcon name="domain" size={28} />
          </span>
          <div>
            <p className="os-domain-eyebrow">PLATFORM INFRASTRUCTURE</p>
            <h1>Domain Management</h1>
            <p className="os-domain-description">
              Configure platform domains, HTTPS readiness and plan-level website
              capabilities. Company Owners and assigned Website Developers
              manage their own websites in the Business App.
            </p>
          </div>
        </div>
        <Link className="os-action os-domain-top-action" href="/dashboard/plans">
          <OsIcon name="crown" size={18} />
          Membership plans
          <OsIcon name="arrow" size={17} />
        </Link>
      </div>

      <section className="os-domain-highlights" aria-label="Domain configuration summary">
        <div className="os-domain-highlight">
          <span className="os-domain-highlight-icon">
            <OsIcon name="domain" size={25} />
          </span>
          <div>
            <p>Managed base hostname</p>
            <strong className="os-domain-hostname">
              {settings.data.base_domain || 'Not configured'}
            </strong>
            <small>Destination for managed subdomains and custom-domain DNS</small>
          </div>
        </div>
        <div className="os-domain-highlight">
          <span className="os-domain-highlight-icon os-domain-highlight-icon-green">
            <OsIcon name="check" size={25} />
          </span>
          <div>
            <p>Wildcard HTTPS configuration</p>
            <strong>
              {settings.data.managed_subdomain_tls
                ? 'Marked configured'
                : 'Not configured'}
            </strong>
            <small>Live certificate and routing checks are still required</small>
          </div>
        </div>
        <div className="os-domain-highlight">
          <span className="os-domain-highlight-icon">
            <OsIcon name="crown" size={25} />
          </span>
          <div>
            <p>Custom domain capability</p>
            <strong>Controlled by plan</strong>
            <small>Configure eligibility and limits per membership plan</small>
          </div>
        </div>
      </section>

      <section className="os-domain-panel os-domain-config" aria-labelledby="os-domain-config-title">
        <div className="os-domain-section-heading">
          <span className="os-domain-section-icon">
            <OsIcon name="settings" size={20} />
          </span>
          <div>
            <h2 id="os-domain-config-title">Platform domain and plan configuration</h2>
            <p>Shared infrastructure settings only — company website content stays private.</p>
          </div>
        </div>
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

      <section className="os-domain-panel os-domain-guide" aria-labelledby="os-domain-guide-title">
        <div className="os-domain-section-heading">
          <span className="os-domain-section-icon">
            <OsIcon name="domain" size={20} />
          </span>
          <div>
            <h2 id="os-domain-guide-title">How companies connect their domains</h2>
            <p>Companies use the Business App to manage their own website domain.</p>
          </div>
        </div>
        <ol className="os-domain-steps">
          <li className="os-domain-step">
            <span className="os-domain-step-number">1</span>
            <span className="os-domain-step-icon">
              <OsIcon name="website" size={25} />
            </span>
            <div>
              <h3>Add a custom domain</h3>
              <p>
                The authorized company user registers a hostname under
                Website Studio → Domains.
              </p>
            </div>
          </li>
          <li className="os-domain-step">
            <span className="os-domain-step-number">2</span>
            <span className="os-domain-step-icon">
              <OsIcon name="domain" size={25} />
            </span>
            <div>
              <h3>Configure external DNS</h3>
              <p>
                Add the ownership TXT record and point the hostname to
                the platform's configured destination.
              </p>
            </div>
          </li>
          <li className="os-domain-step">
            <span className="os-domain-step-number">3</span>
            <span className="os-domain-step-icon os-domain-step-icon-green">
              <OsIcon name="check" size={25} />
            </span>
            <div>
              <h3>Verify HTTPS and publish</h3>
              <p>
                Hosting or the optional Cloudflare adapter provisions TLS;
                DNS and HTTPS must pass before activation.
              </p>
            </div>
          </li>
        </ol>
        <p className="os-domain-caution">
          <OsIcon name="check" size={18} />
          Connecting a domain does not buy or transfer its registration.
          A configured TLS flag alone does not prove that HTTPS is live.
        </p>
      </section>
    </main>
  );
}
