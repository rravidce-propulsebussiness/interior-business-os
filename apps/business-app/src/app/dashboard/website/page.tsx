import { OwnerShell } from '../owner-shell';
import { canAccess } from '@business-os/auth';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { websiteServices } from './service';
import { WebsiteFoundation, type WebsiteProjectRow, type WebsiteDomainRow } from './website-foundation';
import '../owner-dashboard.css';

export const dynamic = 'force-dynamic';

type RpcResult = { data: unknown; error: { message?: string } | null };
type RpcClient = { rpc: (name: string, params: Record<string, unknown>) => Promise<RpcResult> };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function normalizeProject(value: unknown): WebsiteProjectRow | null {
  const record = object(value);
  if (!str(record.websiteId)) return null;
  return {
    websiteId: str(record.websiteId),
    sourceKind: record.sourceKind === 'repository' ? 'repository' : 'template',
    templateKey: str(record.templateKey),
    repositoryUrl: str(record.repositoryUrl),
    branchName: str(record.branchName) || 'main',
    framework: str(record.framework) || 'other',
    deploymentUrl: str(record.deploymentUrl),
    backendRepositoryUrl: str(record.backendRepositoryUrl),
    backendDeploymentUrl: str(record.backendDeploymentUrl),
    version: typeof record.version === 'number' ? record.version : 1,
  };
}
export default async function Websites() {
  const s = await websiteServices('website.view', true);
  const client = s.client as unknown as RpcClient;
  const domainsAllowed = s.allowed('website.domain.view');
  const [sites, projectsResponse, configResponse, domainsResponse, organization, user] =
    await Promise.all([
      s.website.list(),
      client.rpc('website_project_list', { p_organization_id: s.context.organizationId }),
      s.client.rpc('website_configuration', { p_organization_id: s.context.organizationId }),
      domainsAllowed ? s.client.from('website_domains')
        .select('website_id,hostname,kind,status,tls_status')
        .eq('organization_id', s.context.organizationId)
        .neq('status', 'removed')
        .order('created_at', { ascending: true })
        .limit(250) : Promise.resolve({ data: [], error: null }),
      s.repository.organization(s.context.organizationId),
      s.authorization.requireAuthenticatedUser(),
    ]);
  if (!organization) throw new Error('Company workspace unavailable');
  if (projectsResponse.error)
    throw new Error('Website project migration unavailable. Apply the v2 migration before using Website Studio.');
  if (configResponse.error) throw new Error('Website limits are unavailable');
  if (domainsResponse.error) throw new Error('Website domains unavailable');
  const config = object(configResponse.data);
  const limits = object(config.limits);
  const platform = object(config.platform);
  const quota = typeof limits.sites === 'number'
    ? Math.max(1, Math.trunc(limits.sites)) : 1;
  const rawProjects = Array.isArray(projectsResponse.data)
    ? projectsResponse.data.map(normalizeProject).filter((p): p is WebsiteProjectRow => p !== null)
    : [];
  const domains = (domainsResponse.data ?? []).map((row): WebsiteDomainRow => ({
    websiteId: row.website_id,
    hostname: row.hostname,
    kind: row.kind === 'custom' ? 'custom' : 'subdomain',
    status: row.status,
    tlsStatus: row.tls_status,
  }));
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
    searchPlaceholder="Search leads, projects, quotations..."
  >
    <WebsiteFoundation
      companyName={organization.name}
      baseDomain={str(platform.baseDomain)}
      quota={quota}
      canManage={s.allowed('website.manage')}
      canViewDomains={domainsAllowed}
      canPublish={s.allowed('website.page.publish')}
      sites={sites.map(site => ({
        id: site.id, name: site.name, slug: site.slug,
        status: site.status,
        published: Boolean(site.published_version_id) && site.status === 'published',
        updatedAt: site.updated_at,
      }))}
      projects={rawProjects}
      domains={domains}
    />
  </OwnerShell>;
}
