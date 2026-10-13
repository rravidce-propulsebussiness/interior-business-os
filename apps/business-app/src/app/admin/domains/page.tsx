import Link from 'next/link';
import { z } from 'zod';
import { pageServices } from '@business-os/auth/server';
import { WebsitePlatformControls } from '../website/controls';
import { DomainPanel } from '../../dashboard/website/domain-panel';
import { websiteSchemaPending } from '../../../website-schema';
import { validWorkspaceSlug } from '../../../workspace-paths';

const companySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  websites: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      status: z.string(),
      domains: z.array(
        z.object({
          id: z.uuid(),
          hostname: z.string(),
          kind: z.string(),
          status: z.string(),
          tls_status: z.string(),
          challenge: z.string(),
          version: z.number(),
        }),
      ),
    }),
  ),
});
export default async function DomainManagement({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await pageServices();
  await s.authorization.requirePlatformPermission(
    'platform.entitlements.manage',
  );
  await s.authorization.requirePlatformPermission('platform.catalog.view');
  await s.authorization.requirePlatformPermission(
    'platform.organizations.view',
  );
  await s.authorization.requirePlatformPermission(
    'platform.organizations.manage',
  );
  const query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1),
  );
  const [settings, registry] = await Promise.all([
    s.client.from('website_platform_settings').select('*').single(),
    s.client.rpc('website_platform_domain_registry', { p_page: page }),
  ]);
  const pendingSetup = websiteSchemaPending(registry.error);
  if (settings.error || (registry.error && !pendingSetup))
    throw new Error('Domain configuration unavailable');
  const companies = z
    .array(companySchema)
    .parse(pendingSetup ? [] : registry.data);
  const enabled = process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true';
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((x): x is string => typeof x === 'string')
      : [];
  return (
    <main id="main-content" className="space-y-7" tabIndex={-1}>
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
          Company addresses
        </p>
        <h1 className="os-secondary-heading">Domain Configuration</h1>
        <p className="os-secondary-subtitle">
          Each company uses its own workspace path. A verified custom domain can
          also open the same company dashboard.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Company workspace</h2>
          <p className="mt-3 break-all font-mono text-sm">
            sghomesinterior.in/rvconstruction/dashboard
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Uses the company slug, not its website subdomain slug. Members must
            sign in to that company.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Custom domain</h2>
          <p className="mt-3 break-all font-mono text-sm">
            www.rvconstruction.com/dashboard
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Use a full domain you own. DNS ownership, HTTPS, a published website
            and hosting routes must all be ready.
          </p>
        </div>
      </section>
      <p role="status" className="rounded border p-4 text-sm">
        {enabled
          ? 'Company URL routing is enabled in this application runtime.'
          : 'Company URL routing is not enabled in this runtime. Hosting configuration must be completed before company paths and custom-domain dashboards can go live.'}
      </p>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Platform domain settings</h2>
        <p className="text-sm text-muted-foreground">
          Set the public website hostname used for company subdomains and
          custom-domain CNAME records. This is separate from the main Business
          App hostname.
        </p>
        <WebsitePlatformControls
          mode="domains"
          baseDomain={settings.data.base_domain ?? ''}
          managedTls={settings.data.managed_subdomain_tls}
          plans={[]}
          sites={[]}
          allowedEmbeds={strings(settings.data.allowed_embeds)}
          disabledComponents={strings(settings.data.disabled_components)}
        />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          Company URLs &amp; connected domains
        </h2>
        {pendingSetup && (
          <p role="status" className="rounded border p-4 text-sm">
            Company domain controls are awaiting the website templates
            migration. Platform settings and the existing owner domain workflow
            remain available.
          </p>
        )}
        {companies.map((company) => (
          <article
            key={company.id}
            className="space-y-4 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="text-lg font-semibold">{company.name}</h3>
              <Link
                className="text-sm underline"
                href={`/admin/organizations/${company.id}`}
              >
                Company settings →
              </Link>
            </div>
            <p className="break-all text-sm">
              Workspace: <code>/{company.slug}/dashboard</code>
            </p>
            {enabled &&
              validWorkspaceSlug(company.slug) &&
              ['active', 'trial'].includes(company.status) && (
                <Link
                  className="inline-block rounded border px-3 py-2 text-sm"
                  href={`/${company.slug}/dashboard/website`}
                >
                  Open company Website Studio →
                </Link>
              )}
            <p className="text-xs text-muted-foreground">
              Opening a company workspace requires your own active membership.
              Platform admin access does not impersonate the owner.
            </p>
            {!company.websites.length && (
              <p className="text-sm text-muted-foreground">
                No company website yet. The owner can create one from a template
                in Website Studio.
              </p>
            )}
            {company.websites.map((site) => (
              <div key={site.id} className="rounded border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <p className="font-medium">
                    {site.name} · {site.status}
                  </p>
                  {enabled && validWorkspaceSlug(company.slug) && (
                    <Link
                      className="text-sm underline"
                      href={`/${company.slug}/dashboard/website/${site.id}/domains`}
                    >
                      Owner’s domain view →
                    </Link>
                  )}
                </div>
                <DomainPanel
                  site={site.id}
                  organizationId={company.id}
                  domains={site.domains}
                  base={settings.data.base_domain ?? ''}
                  canManage={
                    ['active', 'trial'].includes(company.status) &&
                    !['suspended', 'archived'].includes(site.status)
                  }
                />
                {!site.domains.length && (
                  <p className="mt-2 text-sm">No connected domains.</p>
                )}
                {site.domains.map((domain) => (
                  <div
                    key={domain.hostname}
                    className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    {enabled &&
                      site.status === 'published' &&
                      domain.status === 'active' &&
                      domain.tls_status === 'ready' &&
                      ['active', 'trial'].includes(company.status) && (
                        <a
                          className="underline"
                          href={`https://${domain.hostname}/dashboard`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open {domain.hostname}/dashboard ↗
                        </a>
                      )}
                  </div>
                ))}
              </div>
            ))}
          </article>
        ))}
        {!pendingSetup && !companies.length && (
          <p>No companies on this page.</p>
        )}
        <nav className="flex gap-4 text-sm" aria-label="Company pages">
          {page > 1 && (
            <Link href={`/admin/domains?page=${page - 1}`}>← Previous</Link>
          )}
          <span>Page {page}</span>
          {companies.length === 25 && page < 10000 && (
            <Link href={`/admin/domains?page=${page + 1}`}>Next →</Link>
          )}
        </nav>
      </section>
      <section className="rounded-xl border p-5 text-sm">
        <h2 className="font-semibold">Connect a company’s domain</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            Add the full hostname under the company website above, or let the
            owner add it from Website Studio → Domains.
          </li>
          <li>
            Add the generated TXT ownership record and CNAME at the company’s
            DNS provider.
          </li>
          <li>
            Route public pages to Websites and /dashboard, login, auth and
            application assets to the Business App at the host. Configure HTTPS
            for that hostname.
          </li>
          <li>
            Select Verify DNS and HTTPS. Publish the website before using its
            custom-domain dashboard.
          </li>
        </ol>
        <p className="mt-3 text-muted-foreground">
          A DNS record alone cannot configure your hosting router. The platform
          TLS checkbox records completed wildcard hosting setup; it does not
          provision a certificate.
        </p>
      </section>
      <Link className="inline-block text-sm underline" href="/admin/website">
        Website builder and template library →
      </Link>
    </main>
  );
}
