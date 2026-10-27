import { websiteServices } from '../service';
import { WebsiteEditor } from '../studio';
import { InteriorStarter } from '../starter-panel';
import { OwnerShell } from '../../owner-shell';
import { ownerWorkspaceNavigation } from '../../owner-workspace-navigation';
import { canAccess } from '@business-os/auth';
import '../../owner-dashboard.css';
import '../website-studio.css';

export default async function WebsiteStudio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await websiteServices('website.view', true);
  const [site, organization, user] = await Promise.all([
    s.website.read(id),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const email = user.email ?? '';
  return (
    <OwnerShell
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
      <div className="site-studio-page">
        <WebsiteEditor
          key={site.version}
          id={id}
          initial={site.document}
          version={site.version}
          name={site.name}
          status={site.status}
          canEdit={s.allowed('website.page.edit')}
          canPublish={s.allowed('website.page.publish')}
        />
        {s.allowed('website.manage') &&
          site.document.pages.every((p) => !p.nodes.length) && (
            <InteriorStarter id={id} version={site.version} />
          )}
      </div>
    </OwnerShell>
  );
}
