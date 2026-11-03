import { OwnerShell } from '../owner-shell';
import { canAccess } from '@business-os/auth';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { websiteServices } from './service';
import { WebsitePremium } from './website-premium';
import '../owner-dashboard.css';

export const dynamic = 'force-dynamic';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default async function Websites() {
  const s = await websiteServices('website.view', true);
  const canViewDomains = s.allowed('website.domain.view');
  const [sites, organization, user, configuration, domainsResponse] = await Promise.all([
    s.website.list(),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
    s.client.rpc('website_configuration', {
      p_organization_id: s.context.organizationId,
    }),
    canViewDomains
      ? s.client.from('website_domains')
          .select('website_id,hostname,kind,status,tls_status')
          .eq('organization_id', s.context.organizationId)
          .neq('status', 'removed')
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (!organization) throw new Error('Company workspace unavailable');
  // Keep the owner page available on older databases; the canonical create
  // action still enforces the plan/organization quota transactionally.
  const limits = object(object(configuration.data).limits);
  const configuredQuota = limits.sites;
  const quota = typeof configuredQuota === 'number' && Number.isFinite(configuredQuota)
    ? Math.max(1, Math.trunc(configuredQuota))
    : 1;
  const email = user.email ?? '';
  return <OwnerShell
    companyName={organization.name}
    accountLabel={email.split('@')[0] || 'Company member'}
    accountEmail={email}
    planLabel="Business workspace"
    navigation={ownerWorkspaceNavigation(s.context)}
    currentHref="/dashboard/website"
    search=""
    notificationsEnabled={canAccess(s.context, {
      organizationId: s.context.organizationId,
      permission: 'notification.view',
    })}
    dashboardBrand
    searchPlaceholder="Search websites, templates, leads..."
  >
    <WebsitePremium
      companyName={organization.name}
      quota={quota}
      canManage={s.allowed('website.manage')}
      canCode={s.allowed('website.custom_code.view')}
      sites={sites.map(site => ({
        id: site.id,
        name: site.name,
        slug: site.slug,
        status: site.status,
        published: Boolean(site.published_version_id) && site.status === 'published',
        version: site.version,
      }))}
      domains={(domainsResponse.error ? [] : (domainsResponse.data ?? [])).map(domain => ({
        website_id: domain.website_id,
        hostname: domain.hostname,
        kind: domain.kind,
        status: domain.status,
        tls_status: domain.tls_status,
      }))}
    />
  </OwnerShell>;
}
