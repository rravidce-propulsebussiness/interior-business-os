import { OwnerShell } from '../../../owner-shell';
import { ownerWorkspaceNavigation } from '../../../owner-workspace-navigation';
import { canAccess } from '@business-os/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { websiteServices } from '../../service';
import { DomainPanel } from '../../domain-panel';
import { cloudflareSaasConfigured, cloudflareSaasCnameTarget } from '../../cloudflare-domains';
import '../../../owner-dashboard.css';
import '../../website-domains-v2.css';

/**
 * Website Studio v2 deliberately has no in-dashboard editor.
 * Legacy page-design/code/media/source routes redirect to the new workspace;
 * existing published snapshots are retained in the public Websites app.
 */
export default async function WebsiteSettingsRoute({
  params,
}: {
  params: Promise<{id: string; tab: string}>;
}) {
  const { id, tab } = await params;
  if (tab !== 'domains') redirect('/dashboard/website');
  const s = await websiteServices('website.domain.view', true);
  const rpc = s.client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: unknown}> };
  const [site, organization, user, rows, projectRows] = await Promise.all([
    s.website.read(id),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
    s.client.from('website_domains')
      .select('id,hostname,kind,status,challenge,tls_status,version')
      .eq('organization_id', s.context.organizationId)
      .eq('website_id', id)
      .order('created_at', {ascending:false})
      .limit(25),
    rpc.rpc('website_project_list', {p_organization_id:s.context.organizationId}),
  ]);
  if (!organization || rows.error) throw new Error('Website domain settings unavailable');
  const externalProject = Array.isArray(projectRows.data) && projectRows.data.some(row =>
    !!row && typeof row === 'object' &&
    (row as {websiteId?:string}).websiteId === id &&
    typeof (row as {repositoryUrl?:unknown}).repositoryUrl === 'string' &&
    Boolean((row as {repositoryUrl:string}).repositoryUrl));
  const email = user.email ?? '';
  const limits = site.limits as {custom_domain?: boolean} | undefined;
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
    <main id="main-content" className="website-settings-workspace">
      <div className="website-settings-back"><Link href="/dashboard/website">← Website Studio</Link></div>
      <header className="website-settings-title">
        <p>{site.name} · Website settings</p>
        <h1>Custom domains &amp; managed subdomain</h1>
        <p>Connecting more than one hostname does not create another website. Each domain requires its own ownership and HTTPS verification.</p>
      </header>
      {externalProject && <div className="website-domain-warning" role="status">
        <strong>Independent Git-hosted website:</strong> Your frontend and backend run at your
        own hosting provider. This Business OS domain screen does not yet route
        external application traffic. Configure production DNS/SSL with your
        external hosting provider; connecting a domain here alone will not
        deploy or serve the Git project.
      </div>}
      <section className="website-settings-content">
        <DomainPanel
          site={id}
          domains={rows.data ?? []}
          cnameTarget={cloudflareSaasCnameTarget()}
          customDomainEnabled={limits?.custom_domain === true}
          saasReady={cloudflareSaasConfigured()}
          canManage={s.allowed('website.domain.manage')}
        />
      </section>
    </main>
  </OwnerShell>;
}
