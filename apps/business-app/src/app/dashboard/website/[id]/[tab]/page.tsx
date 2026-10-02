import { WebsiteTeam } from '../../team-panel';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
  domains: 'website.domain.view',
  media: 'website.media.manage',
  versions: 'website.view',
  team: 'website.scope.manage',
  metrics: 'website.view',
};
export default async function WebsiteTab({
  params,
}: {
  params: Promise<{ id: string; tab: string }>;
}) {
  const { id, tab } = await params;
  const permission = permissions[tab];
  if (!permission) notFound();
  const s = await websiteServices(permission, true);
  const site = await s.website.read(id);
  let content;
  if (tab === 'metrics') {
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
    <main id="main-content" className="mx-auto max-w-5xl space-y-7 px-5 py-8">
      <Link className="text-sm underline" href={`/dashboard/website/${id}`}>
        ← Back to studio
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">{site.name}</p>
        <h1 className="mt-1 text-3xl font-semibold capitalize">{tab}</h1>
      </header>
      {content}
    </main>
  );
}
