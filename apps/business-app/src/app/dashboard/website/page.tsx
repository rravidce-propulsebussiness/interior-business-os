import { OwnerShell } from '../owner-shell';
import { canAccess } from '@business-os/auth';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { websiteServices } from './service';
import { websiteSchemaPending } from '../../../website-schema';
import { WebsiteGallery } from './website-gallery';
import '../owner-dashboard.css';
import './website-home.css';

export const dynamic = 'force-dynamic';

export default async function Websites() {
  const s = await websiteServices('website.view', true);
  // Opening Website never compiles the site or fetches its large document.
  const [sites, templates, organization, user] = await Promise.all([
    s.website.list(),
    s.client.from('website_templates')
      .select('id,name,description')
      .eq('status', 'published')
      .order('name')
      .limit(100),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const pending = websiteSchemaPending(templates.error);
  if (templates.error && !pending)
    throw new Error('Website templates unavailable');

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
    <WebsiteGallery
      sites={sites.map(site => ({
        id: site.id,
        name: site.name,
        slug: site.slug,
        version: site.version,
        status: site.status,
        published: Boolean(site.published_version_id) && site.status === 'published',
      }))}
      templates={(templates.data ?? []).map(template => ({
        id: template.id, name: template.name, description: template.description ?? '',
      }))}
      canManage={s.allowed('website.manage')}
      canCode={s.allowed('website.custom_code.view')}
    />
  </OwnerShell>;
}
