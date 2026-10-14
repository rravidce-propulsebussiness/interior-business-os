import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canAccess } from '@business-os/auth';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { OwnerIcon, OwnerShell } from '../../../owner-shell';
import { projectWorkspaceNavigation } from '../../project-workspace-navigation';

/**
 * Do not turn a project-site permission denial or unavailable RPC into a
 * misleading "Page not found". This page only exposes information for a
 * project that the signed-in user can already view within their tenant.
 * Never fall back to a privileged/site service-role read.
 */
export async function SiteAccessState({ projectId }: { projectId: string }) {
  const context = await activeOrganization();
  if (!context) notFound();
  const has = (permission: string, moduleKey?: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  if (!has('project.view', 'projects')) notFound();

  const s = await pageServices();
  const [{ data: project, error }, organization, user, plans] =
    await Promise.all([
      s.client
        .from('projects')
        .select('id,name,status')
        .eq('organization_id', context.organizationId)
        .eq('id', projectId)
        .maybeSingle(),
      s.repository.organization(context.organizationId),
      s.authorization.requireAuthenticatedUser(),
      s.repository.plans().catch(() => []),
    ]);
  if (error || !project || !organization) notFound();

  const email = user.email ?? '';
  const label =
    email.split('@')[0]?.split(/[._-]/).filter(Boolean).slice(0, 2).join(' ') ||
    'Company member';
  const plan =
    plans.find((entry) => entry.id === organization.plan_id)?.name ??
    'Business plan';
  const inactive = project.status !== 'active';
  const canManage = has('project.manage', 'projects');
  return (
    <div className="site-command-theme">
      <OwnerShell
        companyName={organization.name}
        accountLabel={label}
        accountEmail={email}
        planLabel={plan}
        navigation={projectWorkspaceNavigation(has)}
        currentHref="/dashboard/projects"
        notificationsEnabled={has('notification.view')}
        search=""
      >
        <main id="main-content" tabIndex={-1} className="site-command-page">
          <div className="site-command-container">
            <nav className="sc-breadcrumb" aria-label="Breadcrumb">
              <Link href="/dashboard/projects">Projects</Link>
              <span aria-hidden="true">›</span>
              <Link href={'/dashboard/projects/' + projectId}>{project.name}</Link>
              <span aria-hidden="true">›</span>
              <strong>Site delivery</strong>
            </nav>
            <section className="sc-access-card">
              <span className="sc-access-icon"><OwnerIcon name="projects" size={30}/></span>
              <h1>{inactive ? 'Activate this project to open Site Delivery' : 'Site Delivery access is not available yet'}</h1>
              <p>
                {inactive
                  ? 'The project is currently inactive. Site Delivery can only be opened for active projects.'
                  : 'This project exists, but your account does not currently have an assigned site role, the necessary project access, or an available Site Delivery service.'}
              </p>
              <div className="sc-access-steps">
                <strong>How to continue</strong>
                <p>
                  {inactive
                    ? 'An authorized project manager can activate the project from its settings.'
                    : 'Ask the company owner or project manager to confirm your site assignment and role. If you are already authorized, check the Site Delivery service configuration.'}
                </p>
              </div>
              <div className="sc-access-actions">
                <Link className="sc-btn sc-btn-primary" href={'/dashboard/projects/' + projectId}>
                  <OwnerIcon name="arrow" size={16}/> Back to project
                </Link>
                {canManage && <Link className="sc-btn sc-btn-outline" href={'/dashboard/projects/' + projectId + '#settings'}>
                  <OwnerIcon name="settings" size={16}/> Project settings
                </Link>}
              </div>
            </section>
          </div>
        </main>
      </OwnerShell>
    </div>
  );
}
