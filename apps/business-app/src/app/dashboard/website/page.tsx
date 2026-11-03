import { OwnerShell } from '../owner-shell';
import { canAccess } from '@business-os/auth';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { websiteServices } from './service';
import { WebsiteFoundation } from './website-foundation';
import '../owner-dashboard.css';

export const dynamic = 'force-dynamic';

export default async function Websites() {
  const s = await websiteServices('website.view', true);
  // The replacement workspace lists existing websites without loading legacy
  // template inventories, editors or large page documents.
  const [sites, organization, user] = await Promise.all([
    s.website.list(),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
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
      sites={sites.map(site => ({
        id: site.id,
        name: site.name,
        slug: site.slug,
        status: site.status,
        published: Boolean(site.published_version_id) && site.status === 'published',
      }))}
      canManage={s.allowed('website.manage')}
      canViewDomains={s.allowed('website.domain.view')}
    />
  </OwnerShell>;
}
