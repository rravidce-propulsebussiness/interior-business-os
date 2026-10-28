import { websiteServices } from '../service';
import { isUnconfiguredWebsite } from '../entry-state';
import { WebsiteEntry } from '../website-entry';
import { OwnerShell } from '../../owner-shell';
import { ownerWorkspaceNavigation } from '../../owner-workspace-navigation';
import { canAccess } from '@business-os/auth';
import '../../owner-dashboard.css';

export default async function WebsiteLanding({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await websiteServices('website.view', true);
  const [site, organization, user, templates, domains] = await Promise.all([
    s.website.read(id),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
    s.client.from('website_templates')
      .select('id,name,description')
      .eq('status', 'published')
      .order('name')
      .limit(36),
    s.allowed('website.domain.view')
      ? s.client.from('website_domains')
        .select('hostname,status,tls_status')
        .eq('organization_id', s.context.organizationId)
        .eq('website_id', id)
        .neq('status', 'removed')
        .limit(10)
      : Promise.resolve(null),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const email = user.email ?? '';
  const publishedVersionId = typeof site.publishedVersionId === 'string'
    ? site.publishedVersionId : null;
  const hasContent = !isUnconfiguredWebsite(site.document, !!publishedVersionId);
  const activeDomain = !domains || domains.error ? null :
    domains.data?.find(d => d.status === 'active' && d.tls_status === 'ready');
  const homePath = publishedVersionId ? '/' :
    site.document.pages.find(page => page.path === '/' && page.nodes.length)?.path ??
    site.document.pages.find(page => page.nodes.length)?.path ??
    site.document.pages[0]?.path ?? '/';
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
    <WebsiteEntry id={id} name={site.name} version={site.version}
      hasContent={hasContent} published={site.status === 'published' && !!publishedVersionId}
      publishedVersionId={publishedVersionId}
      homePath={homePath}
      domainUrl={activeDomain ? `https://${activeDomain.hostname}` : null}
      templates={templates.error ? [] : (templates.data ?? [])}
      canManage={s.allowed('website.manage')}
      canEdit={s.allowed('website.page.edit')}
      canCode={s.allowed('website.custom_code.view')}
      canDesign={s.allowed('website.theme.manage')}
      canPublish={s.allowed('website.page.publish')}
    />
  </OwnerShell>;
}
