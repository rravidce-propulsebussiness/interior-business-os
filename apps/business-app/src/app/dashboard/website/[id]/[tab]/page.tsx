import { WebsiteTeam } from '../../team-panel';
import { WebsiteEditor } from '../../studio';
import { WebsiteDesignStudio } from '../../design-studio';
import '../../website-studio.css';
import '../../design-studio.css';
import { OwnerShell } from '../../../owner-shell';
import { ownerWorkspaceNavigation } from '../../../owner-workspace-navigation';
import { canAccess } from '@business-os/auth';
import '../../../owner-dashboard.css';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { websiteServices } from '../../service';
import { WebsiteSettings, PublicationControls } from '../../settings-panel';
import { DomainPanel } from '../../domain-panel';
import { MediaPanel } from '../../media-panel';
const permissions: Record<string, string> = {
  design: 'website.theme.manage',
  navigation: 'website.navigation.manage',
  content: 'website.page.edit',
  forms: 'website.form.manage',
  seo: 'website.seo.manage',
  developer: 'website.custom_code.view',
  layout: 'website.view',
  domains: 'website.domain.view',
  media: 'website.media.manage',
  versions: 'website.view',
  team: 'website.scope.manage',
  metrics: 'website.view',
};
export default async function WebsiteTab({
  params, searchParams,
}: {
  params: Promise<{ id: string; tab: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id, tab } = await params;
  const permission = permissions[tab];
  if (!permission) notFound();
  const s = await websiteServices(permission, true);
  // Existing deep links continue to open the one canonical Template Editor.
  if (tab === 'developer') redirect(`/dashboard/website/${id}`);
  // These independent scoped reads run concurrently to reduce navigation
  // latency, particularly on small shared hosting instances.
  const [site, organization, user] = await Promise.all([
    s.website.read(id),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
  ]);
  if (!organization) notFound();
  const email = user.email ?? '';
  let content;
  if (tab === 'layout') {
    const query = await searchParams;
    content = <div className="site-studio-page"><WebsiteEditor
      key={site.version}
      id={id}
      name={site.name}
      initial={site.document}
      version={site.version}
      status={site.status}
      {...(query.page ? { initialPageId: query.page } : {})}
      canEdit={s.allowed('website.page.edit')}
      canPublish={s.allowed('website.page.publish')}
    /></div>;
  } else if (tab === 'design') {
    content = <WebsiteDesignStudio
      id={id}
      name={site.name}
      initialTheme={site.document.theme}
      pages={site.document.pages.map(page => ({
        id: page.id,
        title: page.title,
        path: page.path,
      }))}
      initialVersion={site.version}
      canEdit={s.allowed('website.theme.manage')}
    />;
  } else if (tab === 'metrics') {
    const result = await s.client.rpc('website_metrics_read', {
      p_organization_id: s.context.organizationId,
      p_website_id: id,
    });
    if (result.error) throw new Error('Metrics unavailable');
    const rows = Array.isArray(result.data)
      ? result.data.filter(
          (x): x is { day: string; kind: string; hits: number } =>
            !!x &&
            typeof x === 'object' &&
            !Array.isArray(x) &&
            typeof x.day === 'string' &&
            typeof x.kind === 'string' &&
            typeof x.hits === 'number',
        )
      : [];
    content = (
      <section>
        <p className="mb-5 text-sm">
          Daily aggregate counts for the last 30 days. Page views include repeat
          requests and bots; these are not unique visitor counts. No cookies or
          visitor profiles are collected.
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.day + row.kind}>
                <td className="py-2">{row.day}</td>
                <td>{row.kind.replaceAll('_', ' ')}</td>
                <td>{row.hits}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p>No activity recorded yet.</p>}
      </section>
    );
  } else if (tab === 'domains') {
    const r = await s.client.rpc('website_configuration', {
      p_organization_id: s.context.organizationId,
    });
    const config = r.data as { platform?: { baseDomain?: string } } | null;
    const rows = await s.client
      .from('website_domains')
      .select('id,hostname,kind,status,challenge,tls_status,version')
      .eq('organization_id', s.context.organizationId)
      .eq('website_id', id)
      .order('created_at', { ascending: false })
      .limit(25);
    if (rows.error) throw new Error('Domains unavailable');
    content = (
      <DomainPanel
        site={id}
        domains={rows.data}
        base={config?.platform?.baseDomain ?? ''}
        canManage={s.allowed('website.domain.manage')}
      />
    );
  } else if (tab === 'media') {
    const rows = await s.client
      .from('website_assets')
      .select('id,name,mime,bytes,width,height,alt,version')
      .eq('organization_id', s.context.organizationId)
      .eq('website_id', id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(25);
    if (rows.error) throw new Error('Media unavailable');
    content = (
      <MediaPanel
        id={id}
        version={site.version}
        document={site.document}
        assets={rows.data}
      />
    );
  } else if (tab === 'versions') {
    const rows = await s.client
      .from('website_versions')
      .select('id,sequence,summary,created_at')
      .eq('organization_id', s.context.organizationId)
      .eq('website_id', id)
      .order('sequence', { ascending: false })
      .limit(25);
    if (rows.error) throw new Error('Versions unavailable');
    content = s.allowed('website.page.publish') ? (
      <PublicationControls
        id={id}
        version={site.version}
        versions={rows.data}
      />
    ) : (
      <ul>
        {rows.data.map((v) => (
          <li key={v.id}>
            Version {v.sequence}: {v.summary}
          </li>
        ))}
      </ul>
    );
  } else if (tab === 'team') {
    const team = await s.client.rpc('website_team_choices', {
      p_organization_id: s.context.organizationId,
      p_website_id: id,
    });
    if (team.error) throw new Error('Members unavailable');
    const members = Array.isArray(team.data)
      ? team.data.filter(
          (x): x is { id: string; name: string; assigned: boolean } =>
            !!x &&
            typeof x === 'object' &&
            !Array.isArray(x) &&
            typeof x.id === 'string' &&
            typeof x.name === 'string' &&
            typeof x.assigned === 'boolean',
        )
      : [];
    content = <WebsiteTeam site={id} members={members} />;
  } else
    content = (
      <WebsiteSettings
        id={id}
        initial={site.document}
        version={site.version}
        tab={tab}
        canEdit={s.allowed(
          tab === 'developer' ? 'website.custom_code.edit' : permission,
        )}
      />
    );
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
      {tab === 'layout' || tab === 'design' ? content : (
        <main id="main-content" className="website-settings-workspace">
          <div className="website-settings-back"><Link href={`/dashboard/website/${id}`}>← Website Studio</Link></div>
          <header className="website-settings-title">
            <p>{site.name} · Website settings</p>
            <h1>{tab.replaceAll('_', ' ')}</h1>
          </header>
          <section className="website-settings-content">{content}</section>
        </main>
      )}
    </OwnerShell>
  );
}
