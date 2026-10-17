import Link from 'next/link';
import Image from 'next/image';
import { ProjectMobileTabs } from './project-mobile-tabs';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { canAccess } from '@business-os/auth';
import { OriginLeads } from '../../commercial/origin-leads';
import { CommercialResponseStatus } from '../../commercial/response-status';
import { ProjectCommercial } from '../../finance/handoff';
import { commercialServices } from '../../commercial/service';
import { MasterForm } from '../../commercial/master-form';
import { OwnerIcon, OwnerShell } from '../../owner-shell';
import { projectWorkspaceNavigation } from '../project-workspace-navigation';
import { OwnerMobileNav } from '../../owner-mobile-nav';
import { workCompletionByProject } from '../work-progress';
import '../../owner-dashboard.css';
import '../../command-centre.css';
import './project-detail.css';

export const dynamic = 'force-dynamic';

const siteRow = z.object({ id: z.uuid() }).passthrough();
const siteSummarySchema = z.object({
  stage: z.enum([
    'not_started',
    'design',
    'client_approved',
    'execution',
    'handover',
  ]),
  role: z.string().nullable(),
  can_manage: z.boolean(),
  gate: z.array(siteRow),
  team: z.array(siteRow),
  member_options: z.array(z.object({ id: z.uuid(), label: z.string() })),
  reports: z.array(siteRow),
  checks: z.array(siteRow),
  materials: z.array(siteRow),
  media: z.array(siteRow),
  designs: z.array(siteRow),
});
type SiteSummary = z.infer<typeof siteSummarySchema>;
function field(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}
function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatDate(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date);
}
function accountName(email: string) {
  const name = (email.split('@')[0] ?? '')
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2);
  return name.map(titleCase).join(' ') || 'Company member';
}
function locationSummary(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Site address not entered';
  const address = value as Record<string, unknown>;
  const parts = [
    address.line1,
    address.city,
    address.region,
    address.postal_code,
  ].filter(
    (part): part is string => typeof part === 'string' && Boolean(part.trim()),
  );
  return parts.length ? parts.join(', ') : 'Site address not entered';
}
export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const s = await commercialServices('project.view', 'projects', true);
  const { data: project, error: projectError } = await s.client
    .from('projects')
    .select('*')
    .eq('organization_id', s.org)
    .eq('id', id)
    .eq('is_sales_prospect', false)
    .maybeSingle();
  if (projectError || !project) notFound();

  const has = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.org,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  const canManage = has('project.manage', 'projects');
  const canClients =
    has('customer.view', 'crm') || has('customer.view', 'quotation');
  const canQuotes = has('quotation.view', 'quotation');
  const canEditQuotes = has('quotation.create', 'quotation');
  const canExecution = has('execution.view', 'projects');
  const canEstimate = has('estimate.view', 'projects');

  const [
    organization,
    user,
    plans,
    industries,
    areaResponse,
    siteResponse,
    branches,
  ] = await Promise.all([
    s.repository.organization(s.org),
    s.authorization.requireAuthenticatedUser(),
    s.repository.plans().catch(() => []),
    s.repository.industries(),
    s.client
      .from('project_areas')
      .select('*')
      .eq('organization_id', s.org)
      .eq('project_id', id)
      .order('sort_order')
      .order('id')
      .limit(250),
    s.client.rpc('project_site_read', {
      p_organization_id: s.org,
      p_project_id: id,
    }),
    canManage ? s.repository.branches(s.org) : Promise.resolve([]),
  ]);
  if (!organization) notFound();

  const siteResult = siteResponse.error
    ? null
    : siteSummarySchema.safeParse(siteResponse.data);
  const site: SiteSummary | null = siteResult?.success ? siteResult.data : null;
  const pendingChecks =
    site?.checks.filter((check) => field(check, 'status') !== 'passed') ?? [];
  const industry = industries.find((item) => item.id === project.industry_id);
  const areas = areaResponse.data ?? [];
  const accountEmail = user.email ?? '';
  const planName =
    plans.find((plan) => plan.id === organization.plan_id)?.name ??
    'Business plan';
  const clientResponse =
    canClients && project.customer_id
      ? await s.client
          .from('customers')
          .select('id,display_name,phone,email')
          .eq('organization_id', s.org)
          .eq('id', project.customer_id)
          .maybeSingle()
      : null;
  const customer =
    clientResponse && !clientResponse.error ? clientResponse.data : null;

  const projectUrl = '/dashboard/projects/' + id;
  const deliveryUrl = projectUrl + '/site';
  const navigation = projectWorkspaceNavigation(has);
  const mobileNav = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' as const },
    ...(has('project.view', 'projects')
      ? [{ label: 'Projects', href: '/dashboard/projects', icon: 'projects' as const }]
      : []),
    ...(has('invoice.view', 'billing')
      ? [{ label: 'Finance', href: '/dashboard/finance', icon: 'billing' as const }]
      : []),
    ...(has('team.view')
      ? [{ label: 'Team', href: '/dashboard/company/team', icon: 'team' as const }]
      : []),
    ...(has('organization.view')
      ? [{ label: 'Settings', href: '/dashboard/settings', icon: 'settings' as const }]
      : []),
  ];
  const recentReports = [...(site?.reports ?? [])]
    .sort((a, b) =>
      field(b, 'report_date').localeCompare(field(a, 'report_date')),
    )
    .slice(0, 3);
  const heroPhoto = (site?.media ?? []).find((item) =>
    field(item,'mime').startsWith('image/') &&
    ['site','daily','inspection'].includes(field(item,'category')),
  );
  const photoId = heroPhoto ? field(heroPhoto,'id') : '';
  const lastReport = recentReports[0];
  const tomorrowPlan = lastReport ? field(lastReport,'tomorrow_plan') : '';
  const pendingMaterials = site?.materials.filter((record) =>
    !['received','rejected'].includes(field(record,'status'))) ?? [];
  const attention = site ? pendingChecks.length + pendingMaterials.length : null;
  const taskResult = await s.client
    .from('project_tasks')
    .select('project_id,status,completion_percentage,weight,title,planned_start')
    .eq('organization_id', s.org)
    .eq('project_id', id)
    .limit(1000);
  const safeTasks =
    !taskResult.error && taskResult.data.length < 1000 ? taskResult.data : null;
  const progress = workCompletionByProject([id], safeTasks).get(id) ?? null;
  const upcomingTasks = (safeTasks ?? [])
    .filter((task) => task.status !== 'done' && task.status !== 'cancelled')
    .filter((task) => Boolean(task.planned_start))
    .sort((a, b) => (a.planned_start ?? '').localeCompare(b.planned_start ?? ''))
    .slice(0, 2);

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={accountName(accountEmail)}
      accountEmail={accountEmail}
      planLabel={planName}
      navigation={navigation}
      currentHref="/dashboard/projects"
      search=""
      notificationsEnabled={has('notification.view')}
      dashboardBrand
    >
      <main
        id="main-content"
        tabIndex={-1}
        className="project-detail-dashboard"
      >
        <nav className="pd-breadcrumb" aria-label="Breadcrumb">
          <Link href="/dashboard">Dashboard</Link>
          <span>›</span>
          <Link href="/dashboard/projects">Projects</Link>
          <span>›</span>
          <strong>{project.name}</strong>
        </nav>

        <header className="pd-hero">
          <div className="pd-hero-main">
            <div className="pd-hero-symbol" aria-hidden="true">
              <OwnerIcon name="projects" size={35} />
            </div>
            <div className="pd-hero-text">
              <div className="pd-heading-line">
                <h1>{project.name}</h1>
                <span
                  className={
                    'pd-status ' +
                    (project.status === 'active' ? 'pd-active' : 'pd-muted')
                  }
                >
                  {titleCase(project.status)}
                </span>
              </div>
              <p>
                {project.code || 'No project code'} <span>·</span>{' '}
                {industry?.name || titleCase(project.project_type || 'Project')}
              </p>
              <p className="pd-location">
                <OwnerIcon name="globe" size={15} />
                {locationSummary(project.site_address)}
              </p>
            </div>
          </div>
          <div className="pd-project-photo" aria-label={photoId?'Recorded project site photograph':'Project image placeholder'}>
            {photoId ? (
              <Image unoptimized width={960} height={390}
                src={'/dashboard/projects/'+id+'/site/media/'+photoId}
                alt={field(heroPhoto ?? {},'caption') || 'Recorded project site photograph'}/>
            ) : <div className="pd-project-photo-placeholder">
              <OwnerIcon name="projects" size={44}/>
              <span>Project photographs will appear here after a site upload</span>
            </div>}
          </div>
          <div className="pd-hero-progress">
            <span>Overall work completed</span>
            <strong>{progress === null ? 'Not tracked' : progress + '%'}</strong>
            <div className="pd-progress-track"
              role={progress === null ? undefined : 'progressbar'}
              aria-label="Recorded work completion"
              aria-valuenow={progress ?? undefined}
              aria-valuemin={progress === null ? undefined : 0}
              aria-valuemax={progress === null ? undefined : 100}>
              {progress !== null && <span style={{ width: progress + '%' }} />}
            </div>
          </div>
          <div className="pd-hero-actions">
            {canManage && (
              <a href="#settings" className="pd-button pd-button-outline">
                <OwnerIcon name="settings" size={16} /> Edit Project
              </a>
            )}
            {has('payment.view', 'billing') && (
              <Link href={'/dashboard/billing/labour?project=' + id}
                className="pd-button pd-button-outline">
                <OwnerIcon name="billing" size={16}/> Labour & wages
              </Link>
            )}
          </div>
        </header>

        <ProjectMobileTabs projectId={id} active="overview"
          allowFinance={has('invoice.view','billing')}
          allowTeam={site?.can_manage === true}
          allowUpdates={Boolean(site && (site.can_manage ||
            ['site_engineer','quality_inspector'].includes(site.role ?? '')))}
          allowMaterials={Boolean(site && (site.can_manage ||
            ['site_engineer','procurement'].includes(site.role ?? '')))}
          allowQuality={Boolean(site && (site.can_manage ||
            ['site_engineer','quality_inspector'].includes(site.role ?? '')))}
          allowFiles={Boolean(site && (site.can_manage ||
            ['architect','structural_designer','site_engineer','quality_inspector'].includes(site.role ?? '')))}
          allowSecurity={Boolean(site && (site.can_manage || site.role === 'watchman'))}
          allowHandover={site?.can_manage === true && site.stage === 'execution'}
          allowSetup={Boolean(site && (site.can_manage ||
            ['architect','structural_designer','site_engineer'].includes(site.role ?? '')))}/>


        <section className="pd-quick-overview pd-mobile-snapshot" aria-label="Current project status">
          <article className="pd-panel pd-quick-card">
            <h2>Next activity</h2>
            <strong className="pd-snapshot-value">
              {upcomingTasks[0]?.title ?? 'Not scheduled'}
            </strong>
            <span className="pd-quick-label">
              {upcomingTasks[0]?.planned_start
                ? formatDate(upcomingTasks[0].planned_start)
                : 'Add work tasks to build your upcoming schedule'}
            </span>
            <Link href={'/dashboard/operations?project='+id}>View task schedule →</Link>
          </article>
          <article className="pd-panel pd-quick-card">
            <h2>Tomorrow's plan</h2>
            <strong className="pd-snapshot-value">
              {tomorrowPlan || 'Not entered'}
            </strong>
            <span className="pd-quick-label">From the latest recorded site report</span>
            <Link href={deliveryUrl + '#daily-reports'}>Site updates →</Link>
          </article>
          <article className="pd-panel pd-quick-card">
            <h2>Attention required</h2>
            <strong className="pd-quick-number">
              {attention === null ? '—' : attention}
            </strong>
            <span className="pd-quick-label">
              {attention === null ? 'Site data not available'
                : 'Open quality checks and outstanding site material requests'}
            </span>
            <Link href={deliveryUrl + '#quality'}>Review site issues →</Link>
          </article>
        </section>
        <div className="pd-content-grid" id="overview">
          <div className="pd-main-column">
            <section className="pd-panel">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="dashboard" size={18} /> Project overview
                  </h2>
                  <p>Client and project information in one place.</p>
                </div>
              </div>
              <div className="pd-overview-grid">
                <div className="pd-overview-item">
                  <small>Customer</small>
                  <strong>
                    {customer?.display_name ??
                      (canClients
                        ? 'Customer not available'
                        : 'Restricted to authorized users')}
                  </strong>
                  {customer && (
                    <Link href={'/dashboard/customers/' + customer.id}>
                      View customer →
                    </Link>
                  )}
                </div>
                <div className="pd-overview-item">
                  <small>Industry</small>
                  <strong>{industry?.name ?? 'Not assigned'}</strong>
                </div>
                <div className="pd-overview-item">
                  <small>Project type</small>
                  <strong>
                    {titleCase(project.project_type || 'Not specified')}
                  </strong>
                </div>
                <div className="pd-overview-item">
                  <small>Project reference</small>
                  <strong>{project.code || 'Not recorded'}</strong>
                </div>
                <div className="pd-overview-item pd-overview-wide">
                  <small>Site location</small>
                  <strong>{locationSummary(project.site_address)}</strong>
                </div>
              </div>
              {project.notes && (
                <div className="pd-project-notes">
                  <small>Project notes</small>
                  <p>{project.notes}</p>
                </div>
              )}
            </section>

            <details className="pd-areas-disclosure">
              <summary>Rooms &amp; areas <span>{areas.length} recorded</span></summary>
            <section className="pd-panel" id="areas">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="projects" size={18} /> Rooms & areas
                  </h2>
                  <p>Manage floors, rooms, site zones and specifications.</p>
                </div>
                <span className="pd-count">{areas.length} shown</span>
              </div>
              {areas.length ? (
                <div className="pd-areas-grid">
                  {areas.map((area) => (
                    <details key={area.id} className="pd-area">
                      <summary>
                        <span className="pd-area-icon">
                          <OwnerIcon name="projects" size={18} />
                        </span>
                        <span>
                          <strong>{area.name}</strong>
                          <small>
                            {titleCase(area.area_type || 'Project area')}
                          </small>
                        </span>
                        <span className="pd-area-chevron">⌄</span>
                      </summary>
                      <div className="pd-area-body">
                        {area.notes && <p>{area.notes}</p>}
                        {canManage && (
                          <MasterForm
                            entity="project_areas"
                            title="Save area"
                            initial={area}
                            fields={[
                              {
                                key: 'name',
                                label: 'Area name',
                                required: true,
                              },
                              { key: 'area_type', label: 'Type' },
                              {
                                key: 'parent_id',
                                label: 'Parent area',
                                nullable: true,
                                options: [
                                  { value: '', label: 'None' },
                                  ...areas
                                    .filter((parent) => parent.id !== area.id)
                                    .map((parent) => ({
                                      value: parent.id,
                                      label: parent.name,
                                    })),
                                ],
                              },
                              {
                                key: 'sort_order',
                                label: 'Order',
                                type: 'number',
                              },
                              {
                                key: 'notes',
                                label: 'Internal notes',
                                type: 'textarea',
                              },
                            ]}
                          />
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="pd-empty-copy">
                  No rooms or project areas have been recorded yet.
                </p>
              )}
              {canManage && (
                <details className="pd-action-disclosure">
                  <summary>
                    <OwnerIcon name="plus" size={17} /> Add new area
                  </summary>
                  <MasterForm
                    entity="project_areas"
                    title="Create area"
                    initial={{
                      organization_id: s.org,
                      version: 1,
                      project_id: id,
                      parent_id: null,
                      name: '',
                      code: '',
                      area_type: '',
                      sort_order: areas.length,
                      notes: '',
                      status: 'active',
                    }}
                    fields={[
                      { key: 'name', label: 'Area name', required: true },
                      { key: 'area_type', label: 'Type' },
                      { key: 'sort_order', label: 'Order', type: 'number' },
                    ]}
                  />
                </details>
              )}
            </section>

            </details>
            <section className="pd-panel" id="commercial">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="quotations" size={18} /> Quotations &
                    commercial
                  </h2>
                  <p>
                    Lead conversion, approved quotes, contracts and payment
                    handoff.
                  </p>
                </div>
                {canQuotes && (
                  <Link
                    href={'/dashboard/quotations?project=' + id}
                    className="pd-text-link"
                  >
                    View quotations →
                  </Link>
                )}
              </div>
              <details className="pd-action-disclosure pd-commercial-advanced">
                <summary>More commercial links</summary>
              <div className="pd-commercial-actions">
                {canEditQuotes && (
                  <Link
                    href={'/dashboard/quotations?project=' + id}
                    className="pd-button pd-button-outline"
                  >
                    Quotations <OwnerIcon name="arrow" size={15} />
                  </Link>
                )}
                {canExecution && (
                  <Link
                    href={'/dashboard/operations?project=' + id}
                    className="pd-button pd-button-outline"
                  >
                    Site execution <OwnerIcon name="arrow" size={15} />
                  </Link>
                )}
                {canEstimate && (
                  <Link
                    href={'/dashboard/execution?project=' + id}
                    className="pd-button pd-button-outline"
                  >
                    Execution planning <OwnerIcon name="arrow" size={15} />
                  </Link>
                )}
              </div>

              </details>
              <div className="pd-integrations">
                <OriginLeads projectId={id} />
                <CommercialResponseStatus projectId={id} />
                <ProjectCommercial projectId={id} />
              </div>
            </section>
          </div>

          </div>

        {canManage && (
          <section className="pd-panel pd-settings" id="settings">
            <div className="pd-panel-heading">
              <div>
                <h2>
                  <OwnerIcon name="settings" size={18} /> Project settings
                </h2>
                <p>
                  Manage project information and site address. Available to
                  authorized managers.
                </p>
              </div>
            </div>
            <details className="pd-action-disclosure">
              <summary>
                <OwnerIcon name="settings" size={17} /> Edit project details
              </summary>
              <MasterForm
                entity="projects"
                title="Save project"
                initial={project}
                fields={[
                  { key: 'name', label: 'Project name', required: true },
                  { key: 'code', label: 'Project code', required: true },
                  { key: 'project_type', label: 'Project type' },
                  {
                    key: 'branch_id',
                    label: 'Branch',
                    nullable: true,
                    options: [
                      { value: '', label: 'Organization' },
                      ...branches.map((branch) => ({
                        value: branch.id,
                        label: branch.name,
                      })),
                    ],
                  },
                  ...[
                    'line1',
                    'line2',
                    'city',
                    'region',
                    'postal_code',
                    'country_code',
                  ].map((key) => ({
                    key: 'site_address.' + key,
                    label: 'Site ' + key.replaceAll('_', ' '),
                  })),
                  { key: 'notes', label: 'Internal notes', type: 'textarea' },
                  {
                    key: 'status',
                    label: 'Status',
                    options: [
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ],
                  },
                ]}
              />
            </details>
          </section>
        )}
        <OwnerMobileNav navigation={mobileNav} currentHref="/dashboard/projects" />
      </main>
    </OwnerShell>
  );
}
