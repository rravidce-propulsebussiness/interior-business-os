import { OwnerShell } from '../owner-shell';
import { canAccess } from '@business-os/auth';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { websiteServices } from './service';
import { websiteSchemaPending } from '../../../website-schema';
import { previewWebsite } from './actions';
import { WebsiteHome, type WebsiteHomeSite } from './website-home';
import '../owner-dashboard.css';
import '../command-centre.css';
import './website-home.css';

export const dynamic = 'force-dynamic';

export default async function Websites() {
  const s = await websiteServices('website.view', true);
  const [sites, templates, organization, user] = await Promise.all([
    s.website.list(),
    s.client
      .from('website_templates')
      .select('id,name,description')
      .eq('status', 'published')
      .order('name')
      .limit(100),
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const pendingSetup = websiteSchemaPending(templates.error);
  if (templates.error && !pendingSetup)
    throw new Error('Website templates unavailable');

  // Read only the featured website's draft/metrics. Other websites remain
  // accessible in the compact list instead of repeating the whole dashboard.
  const featured = sites[0];
  let previewHtml: string | null = null;
  let pages: number | null = null;
  let enquiries: number | null = null;
  let pageViews: number | null = null;
  let domain: { hostname: string; ready: boolean } | null = null;

  if (featured) {
    const [detail, metrics, domains] = await Promise.all([
      s.website.read(featured.id).catch(() => null),
      s.client.rpc('website_metrics_read', {
        p_organization_id: s.context.organizationId,
        p_website_id: featured.id,
      }),
      s.allowed('website.domain.view')
        ? s.client
            .from('website_domains')
            .select('hostname,status,tls_status')
            .eq('organization_id', s.context.organizationId)
            .eq('website_id', featured.id)
            .neq('status', 'removed')
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve(null),
    ]);
    if (detail) {
      pages = detail.document.pages.length;
      if (detail.document.pages.some((page) => page.nodes.length > 0)) {
        previewHtml = await previewWebsite(
          featured.id,
          detail.document.pages[0]?.path ?? '/',
        ).catch(() => null);
      }
    }
    if (!metrics.error && Array.isArray(metrics.data)) {
      const counts = metrics.data.filter(
        (entry): entry is { kind: string; hits: number } =>
          !!entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          typeof entry.kind === 'string' &&
          typeof entry.hits === 'number',
      );
      enquiries = counts
        .filter((row) => row.kind === 'lead_submission')
        .reduce((total, row) => total + row.hits, 0);
      pageViews = counts
        .filter((row) => row.kind === 'page_view')
        .reduce((total, row) => total + row.hits, 0);
    }
    if (domains && !domains.error && domains.data?.length) {
      const active = domains.data.find(
        (entry) => entry.status === 'active' && entry.tls_status === 'ready',
      );
      const chosen = active ?? domains.data[0];
      if (chosen)
        domain = {
          hostname: chosen.hostname,
          ready: chosen.status === 'active' && chosen.tls_status === 'ready',
        };
    }
  }

  const rows: WebsiteHomeSite[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    slug: site.slug,
    status: site.status,
    updatedAt: site.updated_at,
    published:
      Boolean(site.published_version_id) && site.status === 'published',
  }));
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
      <WebsiteHome
        sites={rows}
        previewHtml={previewHtml}
        pages={pages}
        enquiries={enquiries}
        pageViews={pageViews}
        domain={domain}
        templates={templates.data ?? []}
        pendingSetup={pendingSetup}
        canManage={s.allowed('website.manage')}
        canCode={s.allowed('website.custom_code.edit')}
        canDesign={s.allowed('website.theme.manage')}
        canEdit={s.allowed('website.page.edit')}
        canForms={s.allowed('website.form.manage')}
        canSeo={s.allowed('website.seo.manage')}
        canDomains={s.allowed('website.domain.view')}
      />
    </OwnerShell>
  );
}
