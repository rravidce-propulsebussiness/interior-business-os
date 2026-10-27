import { websiteServices } from '../service';
import { WebsiteEditor } from '../studio';
import { OwnerShell } from '../../owner-shell';
import { ownerWorkspaceNavigation } from '../../owner-workspace-navigation';
import { canAccess } from '@business-os/auth';
import '../../owner-dashboard.css';
import '../website-studio.css';

export default async function WebsiteStudio({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
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
  const { page } = await searchParams;
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
          {...(page ? { initialPageId: page } : {})}
          canEdit={s.allowed('website.page.edit')}
          canPublish={s.allowed('website.page.publish')}
          canViewSource={s.allowed('website.custom_code.view') && site.document.code.length > 0}
        />
      </div>
    </OwnerShell>
  );
}
