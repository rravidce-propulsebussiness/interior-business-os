import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  pageServices,
  activeOrganization,
  workspaceScope,
} from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { DomainError } from '@business-os/shared';
import { createCrmRepository } from '@business-os/database/crm';
import { createQuotationRepository } from '@business-os/database/quotations';
import { createGstRepository } from '@business-os/database/gst';
import { commercialSearchResultSchema } from '@business-os/core/commercial';
import { resultSchema } from './crm/service';
import {
  OwnerIcon,
  OwnerShell,
  type OwnerIconName,
  type OwnerNavItem,
} from './owner-shell';
import './owner-dashboard.css';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string };
type Lead = Record<string, unknown>;
type Project = {
  id: string;
  name?: string;
  status: string;
};
type SiteProject = { id: string; stage: string; role: string };

const number = new Intl.NumberFormat('en-IN');
const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function asText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function displayDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emailDisplayName(email: string): string {
  const identifier = email.split('@')[0]?.split(/[._-]/).filter(Boolean).slice(0, 2) ?? [];
  return identifier.map((word) => titleCase(word)).join(' ') || 'there';
}

async function optional<T>(value: Promise<T>): Promise<T | null> {
  try {
    return await value;
  } catch {
    // A disabled or temporarily unavailable feature should not crash the
    // entire company dashboard. No data is represented as unavailable.
    return null;
  }
}

function DashboardStat({
  label,
  value,
  note,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  note: string;
  icon: OwnerIconName;
  tone: string;
  href?: string;
}) {
  const content = (
    <>
      <span className={'owner-stat-icon owner-tone-' + tone}><OwnerIcon name={icon} size={25} /></span>
      <span className="owner-stat-text">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="owner-stat">{content}</Link>
  ) : (
    <div className="owner-stat">{content}</div>
  );
}

function QuickLink({
  href,
  icon,
  children,
  primary = false,
}: {
  href: string;
  icon: OwnerIconName;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link href={href} className={'owner-quick-button' + (primary ? ' owner-quick-primary' : '')}>
      <OwnerIcon name={icon} size={19} />
      <span>{children}</span>
    </Link>
  );
}

function AccessTile({
  href,
  label,
  icon,
  tone,
}: {
  href: string;
  label: string;
  icon: OwnerIconName;
  tone: string;
}) {
  return (
    <Link className={'owner-access-tile owner-tile-' + tone} href={href}>
      <OwnerIcon name={icon} size={27} />
      <span>{label}</span>
    </Link>
  );
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { authorization, repository, client } = await pageServices();
  const user = await authorization.requireAuthenticatedUser();
  const scope = await workspaceScope();

  // Platform Admin is a separate workspace. A company owner never gains
  // platform access merely because they are the only person in a business.
  let isPlatformAdmin = false;
  try {
    await authorization.requirePlatformPermission('platform.access');
    await authorization.requirePlatformPermission('platform.organizations.view');
    await authorization.requirePlatformPermission('platform.catalog.view');
    isPlatformAdmin = true;
  } catch (error) {
    if (!(error instanceof DomainError && error.code === 'FORBIDDEN')) throw error;
  }
  if (isPlatformAdmin && !scope) redirect('/admin');

  let context: Awaited<ReturnType<typeof activeOrganization>> = null;
  try {
    context = await activeOrganization();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') notFound();
    throw error;
  }

  if (!context) {
    if (scope) notFound();
    return (
      <main id="main-content" className="owner-no-company">
        <h1>No active company workspace</h1>
        <p>Your account needs an active company membership to access business tools.</p>
        <Link href="/dashboard/company/invitations">Review your invitations →</Link>
      </main>
    );
  }

  const organization = await repository.organization(context.organizationId);
  if (!organization) notFound();
  if (!scope && process.env.BUSINESS_OS_TENANT_ROUTES_ENABLED === 'true' && organization.slug) {
    redirect('/' + organization.slug + '/dashboard');
  }

  const orgId = context.organizationId;
  const has = (permission: string, moduleKey?: string) =>
    canAccess(context, { organizationId: orgId, permission, ...(moduleKey ? { moduleKey } : {}) });
  const canLeads = has('lead.view', 'crm');
  const canQuotes = has('quotation.view', 'quotation');
  const canProjects = has('project.view', 'projects');
  const canClients = has('customer.view', 'quotation') || has('customer.view', 'crm');
  const canMarketplace = has('purchase.view');
  const canBilling = has('invoice.view', 'billing');
  const canReports =
    has('report.view') || has('report.financial') || has('financial_report.view', 'billing');
  const canTeam = has('team.view');
  const canInvite = has('team.invite') && has('role.manage');
  const canWebsite = has('website.view', 'website');
  const canSettings = has('organization.view');
  const canSites = context.entitlements.includes('projects');
  const isOwner = context.roles.some((role) => role.name.toLowerCase() === 'owner');
  const query = (await searchParams).q?.trim().slice(0, 80) ?? '';

  // Fetch only the active company's data, with its existing server/RLS guards.
  const [rawLeads, rawQuotes, rawProjects, rawInvoices, rawTeam, rawPlans, rawSites] =
    await Promise.all([
      canLeads
        ? optional(createCrmRepository(client, orgId).search('leads', { sort: 'newest', ...(query ? { q: query } : {}) }, 1))
        : Promise.resolve(null),
      canQuotes
        ? optional(createQuotationRepository(client).search(orgId, 'quotations', query))
        : Promise.resolve(null),
      canProjects
        ? optional(createQuotationRepository(client).search(orgId, 'projects', query, 1, 'active'))
        : Promise.resolve(null),
      canBilling
        ? optional(createGstRepository(client).list(orgId, 'sales_invoice'))
        : Promise.resolve(null),
      canTeam ? optional(repository.team(orgId)) : Promise.resolve(null),
      optional(repository.plans()),
      canSites
        ? optional(client.rpc('project_site_my_projects', { p_organization_id: orgId }))
        : Promise.resolve(null),
    ]);

  const leadResult = rawLeads ? resultSchema.safeParse(rawLeads) : null;
  const quoteResult = rawQuotes ? commercialSearchResultSchema.safeParse(rawQuotes) : null;
  const projectResult = rawProjects ? commercialSearchResultSchema.safeParse(rawProjects) : null;
  const leads = leadResult?.success ? leadResult.data : null;
  const quotes = quoteResult?.success ? quoteResult.data : null;
  const projects = projectResult?.success ? projectResult.data : null;
  const invoices = Array.isArray(rawInvoices) ? rawInvoices : null;
  const team = Array.isArray(rawTeam) ? rawTeam : null;
  const otherMembers = team?.filter((member) => member.user_id !== user.id && member.status === 'active') ?? [];
  const sites: SiteProject[] =
    rawSites && !rawSites.error && Array.isArray(rawSites.data)
      ? rawSites.data.filter(
          (site: unknown): site is SiteProject =>
            typeof site === 'object' && site !== null &&
            'id' in site && typeof site.id === 'string' &&
            'stage' in site && typeof site.stage === 'string' &&
            'role' in site && typeof site.role === 'string',
        )
      : [];
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const plan = rawPlans?.find((item) => item.id === organization.plan_id);
  const planLabel = plan?.name || 'Business plan';
  const accountEmail = user.email ?? '';
  const accountLabel = emailDisplayName(accountEmail);

  const month = new Date().toISOString().slice(0, 7);
  const issuedThisMonth = invoices?.filter(
    (doc) => doc.status === 'issued' && doc.date.startsWith(month),
  );
  const invoiceTotal = issuedThisMonth?.reduce((sum, document) => sum + Number(document.total || 0), 0);
  const navigation: OwnerNavItem[] = [{ label: 'Dashboard', href: '/dashboard', icon: 'dashboard' }];
  if (canLeads) navigation.push({ label: 'Leads', href: '/dashboard/crm/leads', icon: 'leads' });
  if (canQuotes) navigation.push({ label: 'Quotations', href: '/dashboard/quotations', icon: 'quotations' });
  if (canProjects) navigation.push({ label: 'Projects', href: '/dashboard/projects', icon: 'projects' });
  else if (canSites) navigation.push({ label: 'My Sites', href: '/dashboard/site-projects', icon: 'projects' });
  if (canClients) navigation.push({ label: 'Clients', href: '/dashboard/customers', icon: 'clients' });
  if (canMarketplace) {
    navigation.push({ label: 'Marketplace', href: '/dashboard/marketplace', icon: 'marketplace' });
    navigation.push({ label: 'Purchases', href: '/dashboard/marketplace/orders', icon: 'purchases' });
  }
  if (canBilling) {
    navigation.push({ label: 'Billing & Invoices', href: '/dashboard/billing', icon: 'billing' });
    navigation.push({ label: 'Expenses', href: '/dashboard/billing?kind=purchase_bill', icon: 'expenses' });
  }
  if (canReports) navigation.push({ label: 'Reports', href: '/dashboard/reports', icon: 'reports' });
  if (canTeam || has('role.view')) navigation.push({ label: 'Team', href: '/dashboard/company/team', icon: 'team' });
  if (canWebsite) navigation.push({ label: 'Website', href: '/dashboard/website', icon: 'globe' });
  if (canSettings) navigation.push({ label: 'Company Settings', href: '/dashboard/company/settings', icon: 'settings' });

  const quickActions: { label: string; href: string; icon: OwnerIconName; primary?: boolean }[] = [];
  if (has('quotation.create', 'quotation')) quickActions.push({ label: 'Create Quotation', href: '/dashboard/projects', icon: 'plus', primary: true });
  if (has('lead.create', 'crm')) quickActions.push({ label: 'Add New Lead', href: '/dashboard/crm/leads/new', icon: 'leads' });
  if (has('invoice.create', 'billing')) quickActions.push({ label: 'Create Invoice', href: '/dashboard/billing/new?kind=sales_invoice', icon: 'billing' });
  if (has('project.create', 'projects')) quickActions.push({ label: 'Add Project', href: '/dashboard/customers', icon: 'projects' });
  if (has('invoice.create', 'billing')) quickActions.push({ label: 'Add Expense', href: '/dashboard/billing/new?kind=purchase_bill', icon: 'expenses' });

  const tiles: { label: string; href: string; icon: OwnerIconName; tone: string }[] = [];
  if (canLeads) tiles.push({ label: 'Leads', href: '/dashboard/crm/leads', icon: 'leads', tone: 'blue' });
  if (canQuotes) tiles.push({ label: 'Quotations', href: '/dashboard/quotations', icon: 'quotations', tone: 'green' });
  if (canProjects) tiles.push({ label: 'Projects', href: '/dashboard/projects', icon: 'projects', tone: 'purple' });
  if (canBilling) tiles.push({ label: 'Invoices', href: '/dashboard/billing', icon: 'billing', tone: 'orange' });
  if (canClients) tiles.push({ label: 'Clients', href: '/dashboard/customers', icon: 'clients', tone: 'pink' });
  if (canMarketplace) tiles.push({ label: 'Marketplace', href: '/dashboard/marketplace', icon: 'marketplace', tone: 'cyan' });

  const hasSearch = query.length > 0;
  const hasRows = (leads?.rows.length ?? 0) > 0 ||
    (projects?.rows.length ?? 0) > 0 ||
    (quotes?.rows.length ?? 0) > 0;

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={accountLabel}
      accountEmail={accountEmail}
      planLabel={planLabel}
      navigation={navigation}
      search={query}
      notificationsEnabled={has('notification.view')}
    >
      <main id="main-content" tabIndex={-1} className="owner-dashboard">
        <section className="owner-welcome">
          <div>
            <p className="owner-eyebrow">{isOwner ? 'Owner workspace' : 'Company workspace'}</p>
            <h1>Welcome back, {accountLabel}! <span aria-hidden="true">👋</span></h1>
            <p>Here&apos;s what&apos;s happening at {organization.name} today.</p>
          </div>
          <div className="owner-company-card">
            <span className="owner-company-art" aria-hidden="true"><OwnerIcon name="dashboard" size={35} /></span>
            <span className="owner-company-details">
              <strong>{organization.name}</strong>
              <small>{isOwner ? 'Your business' : 'Your company'} · {titleCase(organization.status)}</small>
            </span>
            {canWebsite && (
              <Link className="owner-company-action" href="/dashboard/website">
                <OwnerIcon name="globe" size={16} /> Website
              </Link>
            )}
          </div>
        </section>

        {hasSearch && (
          <section className="owner-search-summary" aria-live="polite">
            <div>
              <strong>Search within {organization.name}</strong>
              <p>Showing matches for “{query}” across the company records you can access.</p>
            </div>
            <Link href="/dashboard">Clear search</Link>
            {!hasRows && <p className="owner-search-empty">No matching leads, active projects, or quotations were found.</p>}
          </section>
        )}

        <section className="owner-stats" aria-label="Company overview">
          {canLeads && (
            <DashboardStat
              label={hasSearch ? 'Matching Leads' : 'Leads'}
              value={leads ? number.format(leads.total) : '—'}
              note={leads ? (hasSearch ? 'Search matches' : 'All visible leads') : 'Temporarily unavailable'}
              icon="leads" tone="blue" href="/dashboard/crm/leads"
            />
          )}
          {canQuotes && (
            <DashboardStat
              label={hasSearch ? 'Matching Quotes' : 'Quotations'}
              value={quotes ? number.format(quotes.total) : '—'}
              note={quotes ? (hasSearch ? 'Search matches' : 'All quotations') : 'Temporarily unavailable'}
              icon="quotations" tone="green" href="/dashboard/quotations"
            />
          )}
          {canProjects && (
            <DashboardStat
              label="Active Projects"
              value={projects ? number.format(projects.total) : '—'}
              note={projects ? (hasSearch ? 'Matching active projects' : 'Active projects') : 'Temporarily unavailable'}
              icon="projects" tone="purple" href="/dashboard/projects"
            />
          )}
          {canBilling && (
            <DashboardStat
              label="Issued Invoices"
              value={invoiceTotal === undefined ? '—' : rupees.format(invoiceTotal)}
              note={invoices ? 'This month · latest register' : 'Temporarily unavailable'}
              icon="billing" tone="orange" href="/dashboard/billing"
            />
          )}
          {!canLeads && !canQuotes && !canProjects && !canBilling && (
            <div className="owner-panel owner-no-modules">
              <strong>Your company workspace is ready.</strong>
              <p>Modules become visible when they are included in your plan and account access.</p>
            </div>
          )}
        </section>

        {(quickActions.length > 0 || canInvite) && (
          <section className="owner-quick-actions" aria-label="Quick actions">
            <div className="owner-quick-scroll">
              {quickActions.map((item) => (
                <QuickLink key={item.label} href={item.href} icon={item.icon} primary={item.primary}>{item.label}</QuickLink>
              ))}
            </div>
            {canInvite && (
              <Link className="owner-quick-invite" href="/dashboard/company/team">
                <OwnerIcon name="team" size={19} /> Invite Team Member
              </Link>
            )}
          </section>
        )}

        <div className="owner-content-grid">
          <section className="owner-panel owner-recent-panel">
            <div className="owner-panel-heading">
              <h2>Recent Leads</h2>
              {canLeads && <Link href="/dashboard/crm/leads">View All <OwnerIcon name="arrow" size={15} /></Link>}
            </div>
            {!canLeads ? (
              <p className="owner-empty">Lead access is not enabled for this account.</p>
            ) : !leads ? (
              <p className="owner-empty">Lead data is temporarily unavailable.</p>
            ) : leads.rows.length === 0 ? (
              <div className="owner-empty-state">
                <span className="owner-empty-graphic"><OwnerIcon name="leads" size={24} /></span>
                <strong>{hasSearch ? 'No matching leads' : 'Your leads will appear here'}</strong>
                <p>{hasSearch ? 'Try another search term.' : 'Capture enquiries and follow-ups in one place.'}</p>
                {has('lead.create', 'crm') && <Link href="/dashboard/crm/leads/new">Add your first lead →</Link>}
              </div>
            ) : (
              <div className="owner-table-wrap">
                <table className="owner-leads-table">
                  <thead>
                    <tr><th>Name</th><th>Requirement</th><th>Location</th><th>Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {leads.rows.slice(0, 5).map((lead: Lead, i) => {
                      const leadId = asText(lead.id);
                      return (
                        <tr key={leadId || String(i)}>
                          <td>
                            {leadId ? <Link href={'/dashboard/crm/leads/' + leadId}>{asText(lead.name) || 'Lead'}</Link> : (asText(lead.name) || 'Lead')}
                          </td>
                          <td>{asText(lead.requirement) || asText(lead.project_type) || '—'}</td>
                          <td>{asText(lead.city) || asText(lead.location) || '—'}</td>
                          <td>{displayDate(lead.created_at)}</td>
                          <td><span className={'owner-status owner-status-' + (asText(lead.lifecycle) === 'open' ? 'blue' : 'neutral')}>{titleCase(asText(lead.lifecycle) || asText(lead.status) || 'New')}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="owner-panel owner-projects-panel">
            <div className="owner-panel-heading">
              <h2>Ongoing Projects</h2>
              {canProjects && <Link href="/dashboard/projects">View All <OwnerIcon name="arrow" size={15} /></Link>}
            </div>
            {!canProjects ? (
              <div className="owner-empty-state">
                <span className="owner-empty-graphic"><OwnerIcon name="projects" size={24} /></span>
                <p>Company project access is not enabled for this account.</p>
                {canSites && <Link href="/dashboard/site-projects">My assigned sites →</Link>}
              </div>
            ) : !projects ? (
              <p className="owner-empty">Project data is temporarily unavailable.</p>
            ) : projects.rows.length === 0 ? (
              <div className="owner-empty-state">
                <span className="owner-empty-graphic"><OwnerIcon name="projects" size={24} /></span>
                <strong>{hasSearch ? 'No matching projects' : 'Ready for your first project'}</strong>
                <p>Manage project delivery, site updates and handover.</p>
                {has('project.create', 'projects') && <Link href="/dashboard/customers">Create from a client →</Link>}
              </div>
            ) : (
              <div className="owner-project-list">
                {projects.rows.slice(0, 4).map((project: Project) => {
                  const site = siteById.get(project.id);
                  return (
                    <Link className="owner-project-row" href={'/dashboard/projects/' + project.id} key={project.id}>
                      <span className="owner-project-thumbnail" aria-hidden="true"><OwnerIcon name="projects" size={24} /></span>
                      <span className="owner-project-info">
                        <strong>{project.name || 'Project'}</strong>
                        <small>{site ? titleCase(site.stage) : 'Project workspace'} · Open details</small>
                      </span>
                      <span className={'owner-status owner-status-' + (site?.stage === 'execution' ? 'green' : 'blue')}>
                        {site ? titleCase(site.stage) : titleCase(project.status)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {tiles.length > 0 && (
            <section className="owner-panel owner-access-panel">
              <div className="owner-panel-heading"><h2>Quick Access</h2></div>
              <div className="owner-access-grid">
                {tiles.map((tile) => <AccessTile key={tile.label} {...tile} />)}
              </div>
            </section>
          )}

          {(canTeam || canInvite) && (
            <section className="owner-panel owner-team-panel">
              <div className="owner-panel-heading">
                <h2>Team Members</h2>
                <Link href="/dashboard/company/team">Manage Team <OwnerIcon name="arrow" size={15} /></Link>
              </div>
              <div className="owner-team-content">
                <span className="owner-team-illustration"><OwnerIcon name="team" size={29} /></span>
                <div>
                  <strong>{team === null ? 'Manage your company team' : otherMembers.length === 0 ? 'Working alone or with a team?' : number.format(otherMembers.length) + ' other active team member' + (otherMembers.length === 1 ? '' : 's')}</strong>
                  <p>{otherMembers.length === 0 ? 'Run the business yourself. Invite employees only when you need them.' : 'You control the access given to each team member.'}</p>
                  <div className="owner-team-buttons">
                    {canInvite && (
                      <Link href="/dashboard/company/team" className="owner-team-primary">
                        <OwnerIcon name="team" size={16} /> Invite Team Member
                      </Link>
                    )}
                    <Link href="/dashboard/company/team" className="owner-team-secondary">Manage Access</Link>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
        {isOwner && <p className="owner-dashboard-note">You can operate your company yourself. Employee accounts are optional; access to paid modules follows your company subscription.</p>}
      </main>
    </OwnerShell>
  );
}
