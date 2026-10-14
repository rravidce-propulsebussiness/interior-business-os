import Link from 'next/link';
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
import { ConstructionJourney } from './site/construction-journey';
import '../../owner-dashboard.css';
import './project-detail.css';

const stageRecordSchema = z.object({
  links: z.array(z.object({
    stage_id: z.uuid(),
    kind: z.string(),
    record_id: z.uuid(),
  })),
  payments: z.array(z.object({
    stage_id: z.uuid(),
    item_id: z.uuid(),
    contract_id: z.uuid(),
    label: z.string(),
    amount: z.string(),
    due_date: z.string().nullable(),
    currency: z.string(),
    contract_number: z.string(),
    request_number: z.string().nullable(),
    request_status: z.string().nullable(),
  })),
  options: z.array(z.object({
    id: z.uuid(),
    contract_id: z.uuid(),
    label: z.string(),
    amount: z.string(),
    currency: z.string(),
    contract_number: z.string(),
  })),
});

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
const timelineStageSchema = z.object({
  id: z.uuid(),
  instance_code: z.string(),
  template_code: z.string(),
  phase: z.string(),
  floor_code: z.string().nullable(),
  title: z.string(),
  explanation: z.string(),
  hold_point: z.string().nullable(),
  activities: z.array(z.string()),
  inspection_topics: z.array(z.string()),
  dependencies: z.array(z.string()),
  status: z.string(),
  task_count: z.number().int().nonnegative(),
});
const timelineStagesSchema = z.object({ stages: z.array(timelineStageSchema) });
const timelineQualitySchema = z.object({
  stages: z.array(
    z.object({
      stage_id: z.uuid(),
      cleared: z.boolean(),
      inspections: z.array(
        z.object({
          mandatory: z.boolean(),
          status: z.string(),
          current: z.boolean(),
        }),
      ),
    }),
  ),
});
const deliveryStages = [
  {
    key: 'design',
    label: 'Design & engineering',
    detail: 'Plans, 3D and structural drawings',
  },
  {
    key: 'client_approved',
    label: 'Client approval',
    detail: 'Recorded design acceptance',
  },
  {
    key: 'execution',
    label: 'Site execution',
    detail: 'Daily updates and materials',
  },
  {
    key: 'handover',
    label: 'Quality & handover',
    detail: 'Inspections and close-out',
  },
] as const;

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
function StageIcon({
  index,
  completed,
  current,
}: {
  index: number;
  completed: boolean;
  current: boolean;
}) {
  if (completed) return <OwnerIcon name="check" size={17} />;
  if (current) return <span>{index + 1}</span>;
  return <span>{index + 1}</span>;
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
  const stageResponse = site
    ? await s.client.rpc('construction_project_read', {
        p_organization_id: s.org,
        p_project_id: id,
      })
    : null;
  const stageParsed =
    stageResponse && !stageResponse.error
      ? timelineStagesSchema.safeParse(stageResponse.data)
      : null;
  const timelineStages = stageParsed?.success ? stageParsed.data.stages : [];
  const qcResponse = timelineStages.length
    ? await s.client.rpc('construction_quality_read', {
        p_org: s.org,
        p_project: id,
      })
    : null;
  const qcParsed =
    qcResponse && !qcResponse.error
      ? timelineQualitySchema.safeParse(qcResponse.data)
      : null;
  const timelineQuality = qcParsed?.success ? qcParsed.data : null;
  const stageRecordResponse = site && timelineStages.length
    ? await s.client.rpc('construction_stage_record_read', {
        p_organization_id: s.org,
        p_project_id: id,
      })
    : null;
  const stageRecordParsed = stageRecordResponse && !stageRecordResponse.error
    ? stageRecordSchema.safeParse(stageRecordResponse.data)
    : null;
  const stageRecords = stageRecordParsed?.success ? stageRecordParsed.data : null;
  const currentStage = site
    ? deliveryStages.findIndex((stage) => stage.key === site.stage)
    : -1;
  const team = site?.team.filter((member) => member.active === true) ?? [];
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
  const recentReports = [...(site?.reports ?? [])]
    .sort((a, b) =>
      field(b, 'report_date').localeCompare(field(a, 'report_date')),
    )
    .slice(0, 3);
  const recentMedia = (site?.media ?? []).slice(0, 4);

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
          <div className="pd-hero-actions">
            {canManage && (
              <a href="#settings" className="pd-button pd-button-outline">
                <OwnerIcon name="settings" size={16} /> Edit Project
              </a>
            )}
            <Link href={deliveryUrl} className="pd-button pd-button-primary">
              <OwnerIcon name="arrow" size={17} /> Open Site Workspace
            </Link>
          </div>
        </header>

        <nav className="pd-tabs" aria-label="Project sections">
          <a href="#overview">
            <OwnerIcon name="dashboard" size={16} />
            Overview
          </a>
          <a href="#construction-timeline">
            <OwnerIcon name="calendar" size={16} />
            Timeline
          </a>
          <Link href={deliveryUrl + '#daily-reports'}>
            <OwnerIcon name="globe" size={16} />
            Site updates
          </Link>
          <Link href={deliveryUrl + '#materials'}>
            <OwnerIcon name="purchases" size={16} />
            Materials
          </Link>
          <a href="#team">
            <OwnerIcon name="team" size={16} />
            Team
          </a>
          <a href="#areas">
            <OwnerIcon name="projects" size={16} />
            Rooms & areas
          </a>
          <a href="#media">
            <OwnerIcon name="globe" size={16} />
            Media & reports
          </a>
          <a href="#commercial">
            <OwnerIcon name="quotations" size={16} />
            Commercial
          </a>
          {canManage && (
            <a href="#settings">
              <OwnerIcon name="settings" size={16} />
              Settings
            </a>
          )}
        </nav>

        <section className="pd-metrics" aria-label="Project summary">
          <div className="pd-metric">
            <span className="pd-metric-icon pd-icon-blue">
              <OwnerIcon name="calendar" size={21} />
            </span>
            <div>
              <small>Project created</small>
              <strong>{formatDate(project.created_at)}</strong>
              <span>Registered in Business OS</span>
            </div>
          </div>
          <div className="pd-metric">
            <span className="pd-metric-icon pd-icon-green">
              <OwnerIcon name="projects" size={21} />
            </span>
            <div>
              <small>Rooms & areas</small>
              <strong>{areas.length}</strong>
              <span>
                {areas.length === 250
                  ? 'Showing first 250 areas'
                  : 'Areas recorded'}
              </span>
            </div>
          </div>
          <div className="pd-metric">
            <span className="pd-metric-icon pd-icon-amber">
              <OwnerIcon name="team" size={21} />
            </span>
            <div>
              <small>Assigned team</small>
              <strong>{site ? team.length : '—'}</strong>
              <span>
                {site
                  ? 'Active project assignments'
                  : 'Open site workspace for access'}
              </span>
            </div>
          </div>
          <div className="pd-metric">
            <span className="pd-metric-icon pd-icon-purple">
              <OwnerIcon name="check" size={21} />
            </span>
            <div>
              <small>Open quality checks</small>
              <strong>{site ? pendingChecks.length : '—'}</strong>
              <span>
                {site
                  ? 'Awaiting a passed result'
                  : 'Access through site delivery'}
              </span>
            </div>
          </div>
        </section>

        {site && (
          <ConstructionJourney
            projectId={id}
            stages={timelineStages}
            quality={timelineQuality}
            materials={site.materials}
            checks={site.checks}
            media={site.media}
            reports={site.reports}
            gate={site.gate}
            canSeeFinance={has('contract.view', 'billing')}
            stageRecords={stageRecords}
            canLinkRecords={Boolean(stageRecords && site.can_manage)}
            canRequestMaterials={
              site.stage === 'execution' &&
              (site.can_manage ||
                site.role === 'site_engineer' ||
                site.role === 'procurement')
            }
            canUploadWorkPhotos={
              site.stage === 'execution' &&
              (site.can_manage || site.role === 'site_engineer')
            }
            canUploadCuringPhotos={
              site.stage === 'execution' &&
              (site.can_manage || site.role === 'watchman')
            }
          />
        )}

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

            <section className="pd-panel" id="delivery">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="calendar" size={18} /> Project delivery
                  </h2>
                  <p>
                    Verified workflow stages, from drawings to quality handover.
                  </p>
                </div>
                <Link href={deliveryUrl} className="pd-text-link">
                  Full workflow →
                </Link>
              </div>
              {site ? (
                <>
                  <div className="pd-current-stage">
                    <span className="pd-stage-flag">
                      {site.stage === 'not_started'
                        ? 'Not started'
                        : 'Current stage'}
                    </span>
                    <strong>
                      {site.stage === 'not_started'
                        ? 'Initialize the project workflow'
                        : (deliveryStages[currentStage]?.label ??
                          titleCase(site.stage))}
                    </strong>
                  </div>
                  <div className="pd-timeline">
                    {deliveryStages.map((stage, index) => {
                      const complete = index < currentStage;
                      const current = index === currentStage;
                      return (
                        <div
                          key={stage.key}
                          className={
                            'pd-timeline-step' +
                            (complete
                              ? ' pd-step-complete'
                              : current
                                ? ' pd-step-current'
                                : '')
                          }
                        >
                          <div className="pd-stage-dot">
                            <StageIcon
                              index={index}
                              completed={complete}
                              current={current}
                            />
                          </div>
                          <strong>{stage.label}</strong>
                          <small>{stage.detail}</small>
                          <span>
                            {complete
                              ? 'Previous stage'
                              : current
                                ? 'Current stage'
                                : 'Upcoming'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="pd-help-text">
                    Stages indicate workflow position, not a calculated
                    percentage of physical construction completed.
                  </p>
                </>
              ) : (
                <div className="pd-unavailable">
                  <OwnerIcon name="projects" size={24} />
                  <p>
                    Delivery information is available to assigned project roles
                    and authorized managers in the site workspace.
                  </p>
                  <Link href={deliveryUrl}>Open site delivery →</Link>
                </div>
              )}
            </section>

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

            <section className="pd-panel" id="media">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="globe" size={18} /> Site updates & files
                  </h2>
                  <p>Reports and restricted site evidence from this project.</p>
                </div>
                <Link href={deliveryUrl} className="pd-text-link">
                  View site workspace →
                </Link>
              </div>
              {site ? (
                <div className="pd-media-columns">
                  <div>
                    <h3>Recent daily reports</h3>
                    {recentReports.length ? (
                      recentReports.map((report) => (
                        <div className="pd-update" key={report.id}>
                          <span className="pd-update-icon">
                            <OwnerIcon name="calendar" size={17} />
                          </span>
                          <div>
                            <strong>
                              {field(report, 'completed_work') || 'Site report'}
                            </strong>
                            <small>
                              {formatDate(field(report, 'report_date'))}
                            </small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="pd-empty-copy">No site reports recorded.</p>
                    )}
                  </div>
                  <div>
                    <h3>Project media</h3>
                    {recentMedia.length ? (
                      recentMedia.map((media) => (
                        <a
                          key={media.id}
                          className="pd-update"
                          href={deliveryUrl + '/media/' + media.id}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <span className="pd-update-icon">
                            <OwnerIcon name="quotations" size={17} />
                          </span>
                          <div>
                            <strong>
                              {field(media, 'file_name') ||
                                field(media, 'filename') ||
                                'Project file'}
                            </strong>
                            <small>
                              {titleCase(
                                field(media, 'phase') || 'Site evidence',
                              )}{' '}
                              · Open securely ↗
                            </small>
                          </div>
                        </a>
                      ))
                    ) : (
                      <p className="pd-empty-copy">No media uploaded yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="pd-empty-copy">
                  Site reports and files are visible to authorized site members.
                </p>
              )}
            </section>

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
              <div className="pd-integrations">
                <OriginLeads projectId={id} />
                <CommercialResponseStatus projectId={id} />
                <ProjectCommercial projectId={id} />
              </div>
            </section>
          </div>

          <aside className="pd-side-column" aria-label="Project tools">
            <section className="pd-panel" id="team">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="team" size={18} /> Project team
                  </h2>
                  <p>Roles assigned to this site.</p>
                </div>
                <Link href={deliveryUrl} className="pd-text-link">
                  Manage →
                </Link>
              </div>
              {site ? (
                team.length ? (
                  <div className="pd-team-list">
                    {team.slice(0, 8).map((member) => {
                      const label =
                        site.member_options.find(
                          (option) => option.id === member.user_id,
                        )?.label ?? 'Assigned team member';
                      const role = titleCase(
                        field(member, 'role') || 'Team member',
                      );
                      return (
                        <div className="pd-member" key={member.id}>
                          <span className="pd-avatar" aria-hidden="true">
                            {label
                              .split(' ')
                              .slice(0, 2)
                              .map((word) => word[0] || '')
                              .join('')
                              .toUpperCase()}
                          </span>
                          <div>
                            <strong>{label}</strong>
                            <small>{role}</small>
                          </div>
                          <span className="pd-member-status">Active</span>
                        </div>
                      );
                    })}
                    {team.length > 8 && (
                      <Link href={deliveryUrl} className="pd-text-link">
                        View all {team.length} assignments →
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="pd-empty-copy">
                    No active assignments recorded.
                  </p>
                )
              ) : (
                <p className="pd-empty-copy">
                  Team assignments are available in the site workspace if you
                  have access.
                </p>
              )}
            </section>

            <section className="pd-panel">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="arrow" size={18} /> Quick actions
                  </h2>
                </div>
              </div>
              <div className="pd-quick-actions">
                <Link href={deliveryUrl}>
                  <OwnerIcon name="calendar" size={18} /> View site updates{' '}
                  <OwnerIcon name="arrow" size={15} />
                </Link>
                <Link href={deliveryUrl}>
                  <OwnerIcon name="check" size={18} /> Quality & checks{' '}
                  <OwnerIcon name="arrow" size={15} />
                </Link>
                {canQuotes && (
                  <Link href={'/dashboard/quotations?project=' + id}>
                    <OwnerIcon name="quotations" size={18} /> View quotations{' '}
                    <OwnerIcon name="arrow" size={15} />
                  </Link>
                )}
                {canExecution && (
                  <Link href={'/dashboard/operations?project=' + id}>
                    <OwnerIcon name="projects" size={18} /> Site operations{' '}
                    <OwnerIcon name="arrow" size={15} />
                  </Link>
                )}
                {canManage && (
                  <a href="#settings">
                    <OwnerIcon name="settings" size={18} /> Edit project details{' '}
                    <OwnerIcon name="arrow" size={15} />
                  </a>
                )}
              </div>
            </section>

            <section className="pd-panel">
              <div className="pd-panel-heading">
                <div>
                  <h2>
                    <OwnerIcon name="clients" size={18} /> Customer & location
                  </h2>
                </div>
              </div>
              <div className="pd-side-details">
                <small>Customer</small>
                <strong>
                  {customer?.display_name ??
                    'Customer details restricted or unavailable'}
                </strong>
                {customer && (
                  <Link href={'/dashboard/customers/' + customer.id}>
                    Open customer profile →
                  </Link>
                )}
                <small>Site location</small>
                <strong>{locationSummary(project.site_address)}</strong>
                <small>Registered</small>
                <strong>{formatDate(project.created_at)}</strong>
              </div>
            </section>
          </aside>
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
      </main>
    </OwnerShell>
  );
}
