import Link from 'next/link';
import { z } from 'zod';
import { canAccess } from '@business-os/auth';
import { OwnerIcon, OwnerShell } from '../owner-shell';
import { projectWorkspaceNavigation } from './project-workspace-navigation';
import { ProjectRemovalButton } from './project-removal-button';
import { commercialServices } from '../commercial/service';
import { OwnerMobileNav } from '../owner-mobile-nav';
import { workCompletionByProject } from './work-progress';
import '../owner-dashboard.css';
import '../command-centre.css';
import './projects-dashboard.css';

export const dynamic = 'force-dynamic';

const pageSize = 12;
const assignedSitesSchema = z.array(
  z.object({
    id: z.uuid(),
    stage: z.string(),
    role: z.string().nullable().optional(),
  }),
);

function stageInfo(stage: string | null, status: string) {
  if (status !== 'active') return { label: 'Inactive', tone: 'muted', step: 0 };
  switch (stage) {
    case 'design':
      return { label: 'Design & engineering', tone: 'amber', step: 1 };
    case 'client_approved':
      return { label: 'Planning', tone: 'amber', step: 2 };
    case 'execution':
      return { label: 'Site execution', tone: 'blue', step: 3 };
    case 'handover':
      return { label: 'Quality & handover', tone: 'teal', step: 4 };
    case 'not_started':
      return { label: 'Not started', tone: 'muted', step: 0 };
    default:
      return { label: 'Active', tone: 'blue', step: 0 };
  }
}

function getLocation(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return 'Location not set';
  const address = raw as Record<string, unknown>;
  const segments = [address.city, address.region].filter(
    (item): item is string => typeof item === 'string' && Boolean(item.trim()),
  );
  return (
    segments.join(', ') ||
    (typeof address.line1 === 'string' && address.line1.trim()
      ? address.line1
      : 'Location not set')
  );
}
function displayName(raw: string) {
  return raw
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function accountName(email: string) {
  const part = email.split('@')[0] ?? '';
  return (
    part
      .split(/[._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map(displayName)
      .join(' ') || 'Company member'
  );
}
function locationQuery(value: string) {
  return value.replace(/[\\%_]/g, '\\$&') + '%';
}
function Illustration({ interior }: { interior: boolean }) {
  return (
    <div
      className={
        'proj-art ' + (interior ? 'proj-art-interior' : 'proj-art-build')
      }
      aria-label={
        interior
          ? 'Generic interior illustration, not a project photograph'
          : 'Generic building illustration, not a project photograph'
      }
      role="img"
    >
      {interior ? (
        <svg viewBox="0 0 260 208" aria-hidden="true" focusable="false">
          <path d="M0 145 128 90 260 135V208H0z" fill="#b9cbd5" />
          <path d="M0 0H260V140L128 91 0 140z" fill="#e8e1d6" />
          <path d="M36 30H224V116L129 86 36 116z" fill="#ded6c9" />
          <path d="M100 65h63v73h-63z" fill="#a9917d" />
          <path d="M105 71h52v59h-52z" fill="#cbbeb0" />
          <path d="M40 141h179v52H40z" rx="7" fill="#67798a" />
          <path d="M51 131h65v31H51zM143 131h66v31h-66z" fill="#8298a7" />
          <path
            d="M45 182h170"
            stroke="#526b7a"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path d="M174 63h35v71h-35z" fill="#ae9276" />
          <path d="M188 54v73M174 77h35" stroke="#f1e9d9" strokeWidth="4" />
          <path
            d="M27 160v-47m0 0c-20-5-15-29 2-28 18 0 22 25-2 28"
            fill="#749b7e"
            stroke="#628369"
            strokeWidth="5"
          />
          <ellipse cx="225" cy="190" rx="23" ry="6" fill="#aebdc3" />
        </svg>
      ) : (
        <svg viewBox="0 0 260 208" aria-hidden="true" focusable="false">
          <path d="M0 171 116 112l144 38v58H0z" fill="#c4d9e1" />
          <path d="M46 82 155 37 230 65 118 111z" fill="#f9f6ee" />
          <path d="M45 82 118 111v79L45 153z" fill="#d6d2c8" />
          <path d="M118 111 230 65v93l-112 46z" fill="#faf8f2" />
          <path
            d="M55 95 88 107v37l-33-13zM55 142l33 13v19l-33-14z"
            fill="#415b6a"
          />
          <path
            d="M133 118 213 85v40l-80 32zM133 168l80-33v26l-80 33z"
            fill="#4d6876"
          />
          <path
            d="M140 123 205 97M140 175l65-27"
            stroke="#9fb4bc"
            strokeWidth="3"
          />
          <path
            d="M38 79 151 32l82 31M113 110l118-47"
            stroke="#aab9be"
            strokeWidth="6"
            fill="none"
            strokeLinejoin="round"
          />
          <path d="M32 187V133M236 189v-59" stroke="#738d82" strokeWidth="5" />
          <circle cx="32" cy="126" r="18" fill="#7f9e87" />
          <circle cx="236" cy="123" r="15" fill="#8baa90" />
          <path
            d="M21 193h219"
            stroke="#90a9a8"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="proj-art-label">Illustration</span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: 'projects' | 'check' | 'calendar' | 'dashboard';
  label: string;
  value: number | null;
  note: string;
  tone: string;
}) {
  return (
    <div className="proj-stat">
      <div className={'proj-stat-icon proj-stat-' + tone}>
        <OwnerIcon name={icon} size={23} />
      </div>
      <div className="proj-stat-copy">
        <span>{label}</span>
        <strong>{value === null ? '—' : value.toLocaleString('en-IN')}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    customer?: string;
    status?: string;
    industry?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const s = await commercialServices('project.view', 'projects', true);
  const [organization, user, industries, plans, assigned] = await Promise.all([
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.industries(),
    s.repository.plans().catch(() => []),
    s.client.rpc('project_site_my_projects', { p_organization_id: s.org }),
  ]);
  if (!organization) throw new Error('Company workspace unavailable.');
  const accountEmail = user.email ?? '';
  const planName =
    plans.find((plan) => plan.id === organization.plan_id)?.name ??
    'Business plan';
  const has = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.org,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  const canRemove = has('project.manage', 'projects') && has('organization.manage');
  const canClients =
    has('customer.view', 'crm') || has('customer.view', 'quotation');
  const navigation = projectWorkspaceNavigation(has);
  const mobileNav = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' as const },
    ...(has('project.view', 'projects')
      ? [{ label: 'Projects', href: '/dashboard/projects', icon: 'projects' as const }]
      : []),
    ...(has('invoice.view', 'billing')
      ? [{ label: 'Invoices', href: '/dashboard/billing', icon: 'billing' as const }]
      : []),
    ...(has('team.view')
      ? [{ label: 'Team', href: '/dashboard/company/team', icon: 'team' as const }]
      : []),
    ...(has('organization.view')
      ? [{ label: 'Settings', href: '/dashboard/settings', icon: 'settings' as const }]
      : []),
  ];

  const q = (params.q ?? '').trim().slice(0, 100);
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.page ?? '1', 10) || 1),
  );
  const status =
    params.status === 'active' || params.status === 'inactive'
      ? params.status
      : '';
  const selectedIndustry = industries.some(
    (item) => item.id === params.industry && item.status === 'active',
  )
    ? (params.industry ?? '')
    : '';
  const customer = z.uuid().safeParse(params.customer).success
    ? (params.customer ?? '')
    : '';
  const view = params.view === 'list' ? 'list' : 'grid';
  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (status) baseParams.set('status', status);
  if (selectedIndustry) baseParams.set('industry', selectedIndustry);
  if (customer) baseParams.set('customer', customer);
  if (view === 'list') baseParams.set('view', 'list');
  const urlFor = (updates: Record<string, string>) => {
    const copy = new URLSearchParams(baseParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) copy.delete(key);
      else copy.set(key, value);
    });
    return '/dashboard/projects?' + copy.toString();
  };

  let query = s.client
    .from('projects')
    .select(
      'id,name,version,code,project_type,industry_id,customer_id,site_address,status,created_at',
      { count: 'exact' },
    )
    .eq('organization_id', s.org)
    .eq('is_sales_prospect', false);
  if (q) query = query.ilike('name', locationQuery(q));
  if (status) query = query.eq('status', status);
  if (selectedIndustry) query = query.eq('industry_id', selectedIndustry);
  if (customer) query = query.eq('customer_id', customer);

  const [projectsResult, totalResult, activeResult, inactiveResult] =
    await Promise.all([
      query
        .order('created_at', { ascending: false })
        .order('id')
        .range((page - 1) * pageSize, page * pageSize - 1),
      s.client
        .from('projects')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', s.org)
        .eq('is_sales_prospect', false),
      s.client
        .from('projects')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', s.org)
        .eq('is_sales_prospect', false)
        .eq('status', 'active'),
      s.client
        .from('projects')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', s.org)
        .eq('is_sales_prospect', false)
        .eq('status', 'inactive'),
    ]);
  if (projectsResult.error) throw new Error('Projects could not be loaded.');
  const projects = projectsResult.data ?? [];
  const projectIds = projects.map((project) => project.id);
  const recordedTasks = projectIds.length
    ? await s.client
        .from('project_tasks')
        .select('project_id,status,completion_percentage,weight')
        .eq('organization_id', s.org)
        .in('project_id', projectIds)
        .limit(1000)
    : null;
  const completion = workCompletionByProject(
    projectIds,
    !recordedTasks?.error && recordedTasks?.data && recordedTasks.data.length < 1000
      ? recordedTasks.data
      : null,
  );
  const customerIds = [
    ...new Set(
      projects
        .map((project) => project.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const customerNames = new Map<string, string>();
  if (canClients && customerIds.length) {
    const { data: customers } = await s.client
      .from('customers')
      .select('id,display_name')
      .eq('organization_id', s.org)
      .eq('is_sales_prospect', false)
      .in('id', customerIds);
    for (const item of customers ?? [])
      customerNames.set(item.id, item.display_name);
  }

  const assignedParsed = assigned.error
    ? null
    : assignedSitesSchema.safeParse(assigned.data);
  const assignedSites = assignedParsed?.success ? assignedParsed.data : [];
  const sitesByProject = new Map(assignedSites.map((site) => [site.id, site]));

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={accountName(accountEmail)}
      accountEmail={accountEmail}
      planLabel={planName}
      navigation={navigation}
      search={q}
      notificationsEnabled={has('notification.view')}
      currentHref="/dashboard/projects"
      dashboardBrand
    >
      <main id="main-content" tabIndex={-1} className="proj-dashboard">
        <nav className="proj-breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>
          <span aria-hidden="true">›</span>
          <strong>Projects</strong>
        </nav>
        <header className="proj-header">
          <div className="proj-title-group">
            <span className="proj-title-icon">
              <OwnerIcon name="projects" size={26} />
            </span>
            <div>
              <h1>Projects</h1>
              <p>Plan, track and deliver every project in one place.</p>
            </div>
          </div>
          <Link href="/dashboard/quotations" className="proj-quote-link">
            <OwnerIcon name="quotations" size={16} />
            View quotations
          </Link>
        </header>

        <section className="proj-stats" aria-label="Project overview">
          <Stat
            icon="projects"
            label="Total Projects"
            value={totalResult.error ? null : totalResult.count}
            note="Across this company"
            tone="blue"
          />
          <Stat
            icon="dashboard"
            label="Active Projects"
            value={activeResult.error ? null : activeResult.count}
            note="Current active records"
            tone="blue"
          />
          <Stat
            icon="calendar"
            label="Site Execution"
            value={
              assigned.error || !assignedParsed?.success
                ? null
                : assignedSites.filter((site) => site.stage === 'execution')
                    .length
            }
            note="Your assigned sites"
            tone="amber"
          />
          <Stat
            icon="check"
            label="Inactive Projects"
            value={inactiveResult.error ? null : inactiveResult.count}
            note="Not currently active"
            tone="green"
          />
        </section>

        <section className="proj-register" aria-label="Company projects">
          <form
            action="/dashboard/projects"
            method="get"
            className="proj-filters"
          >
            <label className="proj-search">
              <OwnerIcon name="search" size={18} />
              <input
                name="q"
                type="search"
                maxLength={100}
                defaultValue={q}
                placeholder="Search projects by name…"
                aria-label="Search projects by name"
              />
            </label>
            <label className="proj-select-wrap">
              <span className="proj-sr-only">Project status</span>
              <select
                name="status"
                defaultValue={status}
                aria-label="Project status"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="proj-select-wrap">
              <span className="proj-sr-only">Industry</span>
              <select
                name="industry"
                defaultValue={selectedIndustry}
                aria-label="Industry"
              >
                <option value="">All industries</option>
                {industries
                  .filter((industry) => industry.status === 'active')
                  .map((industry) => (
                    <option key={industry.id} value={industry.id}>
                      {industry.name}
                    </option>
                  ))}
              </select>
            </label>
            {customer && (
              <input type="hidden" name="customer" value={customer} />
            )}
            {view === 'list' && (
              <input type="hidden" name="view" value="list" />
            )}
            <button type="submit" className="proj-filter-button">
              <OwnerIcon name="search" size={16} />
              <span>Filter</span>
            </button>
            <div className="proj-view-toggle" aria-label="View mode">
              <Link
                href={urlFor({ view: '', page: '' })}
                className={view === 'grid' ? 'proj-view-active' : ''}
                aria-label="Card view"
                aria-current={view === 'grid' ? 'page' : undefined}
              >
                ▦
              </Link>
              <Link
                href={urlFor({ view: 'list', page: '' })}
                className={view === 'list' ? 'proj-view-active' : ''}
                aria-label="List view"
                aria-current={view === 'list' ? 'page' : undefined}
              >
                ☷
              </Link>
            </div>
          </form>
          <div className="proj-result-header">
            <div>
              <h2>All company projects</h2>
              <p>Customer, project type and delivery stage together.</p>
            </div>
            <span>{projectsResult.count ?? 0} matching projects</span>
          </div>
          {projects.length ? (
            <div
              className={
                'proj-cards ' + (view === 'list' ? 'proj-cards-list' : '')
              }
            >
              {projects.map((project) => {
                const stage = sitesByProject.get(project.id);
              const percent = completion.get(project.id) ?? null;
                const state = stageInfo(stage?.stage ?? null, project.status);
                const industry = industries.find(
                  (item) => item.id === project.industry_id,
                );
                const interior =
                  industry?.key === 'interior' ||
                  /interior|renovation|furnish/i.test(
                    project.project_type ?? '',
                  );
                return (
                  <article className="proj-card" key={project.id}>
                    <Link
                      href={'/dashboard/projects/' + project.id}
                      className="proj-card-hit-area"
                      aria-label={'Open ' + project.name + ' project overview'}
                    />
                    <Illustration interior={interior} />
                    <div className="proj-card-content">
                      <div className="proj-card-heading">
                        <span className={'proj-stage proj-stage-' + state.tone}>
                          <span aria-hidden="true">●</span>
                          {state.label}
                        </span>
                        <span className="proj-project-code">
                          {project.code || 'Project'}
                        </span>
                      </div>
                      <h3>
                        <Link href={'/dashboard/projects/' + project.id}>
                          {project.name}
                        </Link>
                      </h3>
                      <dl className="proj-meta">
                        <div>
                          <dt>
                            <OwnerIcon name="clients" size={15} />
                            Customer
                          </dt>
                          <dd>
                            {customerNames.get(project.customer_id ?? '') ??
                              'Customer details in project'}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            <OwnerIcon name="globe" size={15} />
                            Location
                          </dt>
                          <dd>{getLocation(project.site_address)}</dd>
                        </div>
                        <div>
                          <dt>
                            <OwnerIcon name="projects" size={15} />
                            Industry
                          </dt>
                          <dd>
                            {industry?.name ??
                              displayName(
                                project.project_type || 'Not assigned',
                              )}
                          </dd>
                        </div>
                      </dl>
                      <div className="proj-progress">
                        <div className="proj-progress-heading">
                          <span>Overall work completed</span>
                          <strong>{percent === null ? 'Not tracked' : percent + '%'}</strong>
                        </div>
                        <div className="proj-work-rail"
                          role={percent === null ? undefined : 'progressbar'}
                          aria-label="Recorded work completed"
                          aria-valuenow={percent ?? undefined}
                          aria-valuemin={percent === null ? undefined : 0}
                          aria-valuemax={percent === null ? undefined : 100}>
                          {percent !== null && <span style={{ width: percent + '%' }} />}
                        </div>
                      </div>
                      <div className="proj-card-bottom">
                        <span className="proj-card-secondary">
                          <OwnerIcon name="team" size={16} />
                          {stage?.role
                            ? displayName(stage.role)
                            : 'Company project'}
                        </span>
                        <span className="proj-open-label">
                          Open project <OwnerIcon name="arrow" size={16} />
                        </span>
                        {canRemove && (
                          <ProjectRemovalButton
                            id={project.id}
                            name={project.name}
                            version={project.version}
                          />
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="proj-empty">
              <span className="proj-empty-icon">
                <OwnerIcon name="projects" size={31} />
              </span>
              <h3>No matching projects</h3>
              <p>
                Try a different project name or filter. New projects appear
                here after the approved quotation and first invoice.
              </p>
              <Link href="/dashboard/projects">Clear filters →</Link>
            </div>
          )}
          <nav className="proj-pagination" aria-label="Projects pagination">
            <span>
              Page {page} · {projectsResult.count ?? 0} project records
            </span>
            <div>
              {page > 1 && (
                <Link href={urlFor({ page: String(page - 1) })}>
                  ← Previous
                </Link>
              )}
              {page * pageSize < (projectsResult.count ?? 0) && (
                <Link href={urlFor({ page: String(page + 1) })}>Next →</Link>
              )}
            </div>
          </nav>
        </section>
        <OwnerMobileNav navigation={mobileNav} currentHref="/dashboard/projects" />
      </main>
    </OwnerShell>
  );
}
