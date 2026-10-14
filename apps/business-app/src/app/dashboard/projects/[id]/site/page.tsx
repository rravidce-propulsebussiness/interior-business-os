import Link from 'next/link';
import { canAccess } from '@business-os/auth';
import { OwnerShell } from '../../../owner-shell';
import { projectWorkspaceNavigation } from '../../project-workspace-navigation';
import { SiteCommandOverview } from './command-overview';
import { SiteAccessState } from './site-access-state';
import { SiteActivity } from './site-activity';
import { ConstructionPlanningPanel } from './construction-planning-panel';
import { ConstructionPaymentsPanel } from './construction-payments-panel';
import { ConstructionClientPortalManager } from './construction-client-portal-panel';
import { ConstructionTomorrowPanel } from './construction-tomorrow-panel';
import { ConstructionProcurementWatch } from './construction-procurement-watch';
import { ConstructionHandoverReadiness } from './construction-handover-readiness';
import { AgreementReadinessPanel } from './agreement-readiness-panel';
import '../../../owner-dashboard.css';
import './site-command.css';
import './site-premium.css';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { ProjectSiteForm, ProjectSiteMediaForm, type SiteField } from './forms';

export const dynamic = 'force-dynamic';

const row = z.object({ id: z.uuid() }).passthrough();
const siteSchema = z.object({
  project: z.object({ id: z.uuid(), name: z.string(), code: z.string() }),
  stage: z.enum([
    'not_started',
    'design',
    'client_approved',
    'execution',
    'handover',
  ]),
  role: z.string().nullable(),
  can_manage: z.boolean(),
  approval_evidence: z.string().nullable().optional(),
  client_approval_recorded_at: z.string().nullable().optional(),
  team: z.array(row),
  member_options: z.array(z.object({ id: z.uuid(), label: z.string() })),
  designs: z.array(row),
  reports: z.array(row),
  materials: z.array(row),
  checks: z.array(row),
  gate: z.array(row),
  media: z.array(row),
  events: z.array(z.record(z.string(), z.unknown())),
});
type Site = z.infer<typeof siteSchema>;
const agreementSchema = z.object({
  contract_id: z.uuid().nullable(),
  contract_number: z.string().nullable(),
  contract_status: z.string().nullable(),
  contract_value: z.string().nullable(),
  currency: z.string().nullable(),
  active_contract_count: z.number().int().nonnegative(),
  active_schedule: z.boolean(),
  clearance_event_id: z.uuid().nullable(),
  clearance_type: z.string().nullable(),
  clearance_media_id: z.uuid().nullable(),
  clearance_recorded_at: z.string().nullable(),
  current_scope: z.boolean(),
  execution_authorized: z.boolean(),
  can_authorize_exception: z.boolean(),
});
const constructionFieldSchema = z.object({
  can_manage: z.boolean(),
  can_verify: z.boolean(),
  plans: z.array(
    z.object({
      id: z.uuid(),
      stage_id: z.uuid(),
      pour_reference: z.string(),
      pour_date: z.string(),
      minimum_days: z.number().int(),
      method: z.string(),
      notes: z.string(),
      required_until: z.string(),
      ready: z.boolean(),
      observations: z.array(
        z.object({
          id: z.uuid(),
          date: z.string(),
          result: z.enum(['wet', 'insufficient']),
          note: z.string(),
          observed_by: z.uuid(),
          verified: z.boolean(),
        }),
      ),
    }),
  ),
  stage_reports: z.array(
    z.object({
      stage_id: z.uuid(),
      report_id: z.uuid(),
      report_date: z.string(),
      completed_work: z.string(),
      tomorrow_plan: z.string(),
      blockers: z.string(),
      worker_count: z.number().int(),
      created_by: z.uuid(),
    }),
  ),
});
const constructionProcurementSchema = z.object({
  can_update: z.boolean(),
  materials: z.array(
    z.object({
      material_id: z.uuid(),
      name: z.string(),
      unit: z.string(),
      request_quantity: z.number(),
      required_quantity: z.number(),
      request_status: z.enum([
        'requested',
        'approved',
        'ordered',
        'received',
        'rejected',
      ]),
      source: z.enum(['undecided', 'marketplace', 'outside']),
      vendor_reference: z.string(),
      work_date: z.string(),
      stage_id: z.uuid(),
      stage_title: z.string(),
      plan_id: z.uuid(),
      readiness: z.enum([
        'approval_required',
        'ordering_required',
        'delivery_pending',
        'site_marked_received',
        'blocked',
      ]),
    }),
  ),
});
const constructionTomorrowSchema = z.object({
  can_approve: z.boolean(),
  can_submit: z.boolean(),
  material_choices: z.array(
    z.object({
      id: z.uuid(),
      item: z.string(),
      quantity: z.number(),
      unit: z.string(),
      status: z.string(),
    }),
  ),
  plans: z.array(
    z.object({
      id: z.uuid(),
      stage_id: z.uuid(),
      work_date: z.string(),
      revision: z.number().int(),
      work_summary: z.string(),
      labor_plan: z.array(
        z.object({
          trade: z.string(),
          workers: z.number().int(),
        }),
      ),
      instructions: z.string(),
      status: z.string(),
      submitted_at: z.string(),
      materials: z.array(
        z.object({
          id: z.uuid(),
          item: z.string(),
          quantity: z.number(),
          unit: z.string(),
          status: z.string(),
          required_quantity: z.number(),
        }),
      ),
    }),
  ),
});
const clientProgressManagementSchema = z.object({
  shares: z.array(
    z.object({
      id: z.uuid(),
      expires_at: z.string(),
      revoked_at: z.string().nullable(),
      created_at: z.string(),
      active: z.boolean(),
    }),
  ),
  reports: z.array(
    z.object({
      id: z.uuid(),
      report_date: z.string(),
      completed_work: z.string(),
      tomorrow_plan: z.string(),
      approved: z.boolean(),
      published: z.boolean(),
    }),
  ),
});
const constructionPaymentSchema = z.object({
  active_contract_id: z.uuid().nullable(),
  currency: z.string().nullable(),
  can_bind: z.boolean(),
  can_issue: z.boolean(),
  stage_options: z.array(
    z.object({
      id: z.uuid(),
      instance_code: z.string(),
      title: z.string(),
      current: z.boolean(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.uuid(),
      contract_id: z.uuid(),
      schedule_id: z.uuid(),
      label: z.string(),
      expected_amount: z.string(),
      due_trigger: z.string(),
      due_date: z.string().nullable(),
      linked_stage_ids: z.array(z.uuid()),
      is_stage_milestone: z.boolean(),
      eligible: z.boolean(),
      issued_request_id: z.uuid().nullable(),
    }),
  ),
});
const constructionQualitySchema = z.object({
  available_inspections: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      status: z.string(),
      mandatory: z.boolean(),
      is_final: z.boolean(),
    }),
  ),
  stages: z.array(
    z.object({
      stage_id: z.uuid(),
      title: z.string(),
      instance_code: z.string(),
      hold_point: z.string().nullable(),
      cleared: z.boolean(),
      inspections: z.array(
        z.object({
          id: z.uuid(),
          number: z.string(),
          status: z.string(),
          mandatory: z.boolean(),
          inspector_id: z.uuid(),
          approved_by: z.uuid().nullable(),
          current: z.boolean(),
        }),
      ),
      reviews: z.array(
        z.object({
          id: z.uuid(),
          review_kind: z.enum(['quality', 'structural']),
          decision: z.enum(['approved', 'rejected']),
          reviewer_id: z.uuid(),
          notes: z.string(),
          inspections_id: z.uuid(),
          reviewed_at: z.string(),
        }),
      ),
    }),
  ),
});
const constructionSchema = z.object({
  can_manage: z.boolean(),
  workflow: z
    .object({
      id: z.uuid(),
      template_code: z.string(),
      template_version: z.string(),
      status: z.string(),
      version: z.number().int(),
      floor_snapshot: z.array(z.object({ code: z.string(), name: z.string() })),
    })
    .nullable(),
  roles: z.array(
    z.object({
      id: z.uuid(),
      user_id: z.uuid(),
      role: z.string(),
      active: z.boolean(),
      version: z.number().int(),
    }),
  ),
  stages: z.array(
    z.object({
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
    }),
  ),
});
const managerDataSchema = z.object({
  updates: z.array(row),
  reviews: z.array(row),
  quantity_revisions: z.array(row),
});
type ManagerData = z.infer<typeof managerDataSchema>;

function value(row: Record<string, unknown>, key: string) {
  const field = row[key];
  return typeof field === 'string' || typeof field === 'number'
    ? String(field)
    : '';
}
function display(value: string) {
  return value.replaceAll('_', ' ');
}
const card = 'sc-panel rounded-2xl border p-5 sm:p-6';
const formDetails = 'sc-disclosure mt-4 rounded-xl border p-4';
const green = 'sc-pill-positive rounded-lg px-2.5 py-1 text-xs font-semibold';
const gray = 'sc-pill-neutral rounded-lg px-2.5 py-1 text-xs font-semibold';
const designKinds = [
  { value: 'architectural_plan', label: 'Architectural plan' },
  { value: '3d_design', label: '3D design / elevation' },
  { value: 'structural_design', label: 'Structural drawings' },
];
const supplierOptions = [
  { value: 'marketplace', label: 'Business OS marketplace seller' },
  { value: 'outside', label: 'Outside supplier' },
  { value: 'undecided', label: 'Not selected' },
];
const unitOptions = [
  'bags',
  'kg',
  'tonnes',
  'litres',
  'nos',
  'sqft',
  'sqm',
  'cft',
  'cum',
  'yards',
  'metres',
  'feet',
].map((x) => ({ value: x, label: x }));
function Action({
  project,
  operation,
  label,
  fields,
  hidden,
}: {
  project: string;
  operation: string;
  label: string;
  fields: SiteField[];
  hidden?: Record<string, string>;
}) {
  return (
    <ProjectSiteForm
      project={project}
      operation={operation}
      label={label}
      fields={fields}
      hidden={hidden ?? {}}
      secondary
    />
  );
}
function ManagerAction({
  project,
  operation,
  label,
  fields,
  hidden,
}: {
  project: string;
  operation: string;
  label: string;
  fields: SiteField[];
  hidden?: Record<string, string>;
}) {
  return (
    <ProjectSiteForm
      project={project}
      operation={operation}
      label={label}
      fields={fields}
      hidden={hidden ?? {}}
      manager
    />
  );
}

function Heading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="sc-heading mb-5">
      <p className="sc-eyebrow text-xs font-bold uppercase tracking-[.18em]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-6">{detail}</p>
    </div>
  );
}

export default async function ProjectDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const s = await pageServices();
  const context = await activeOrganization();
  if (!context) notFound();
  const result = await s.client.rpc('project_site_read', {
    p_organization_id: context.organizationId,
    p_project_id: id,
  });
  if (result.error) return <SiteAccessState projectId={id} />;
  const parsed = siteSchema.safeParse(result.data);
  if (!parsed.success) return <SiteAccessState projectId={id} />;
  const site: Site = parsed.data;
  const agreementResponse = site.can_manage
    ? await s.client.rpc('project_agreement_read', {
        p_organization_id: context.organizationId,
        p_project_id: id,
      })
    : null;
  const agreementParsed =
    agreementResponse && !agreementResponse.error
      ? agreementSchema.safeParse(agreementResponse.data)
      : null;
  const agreement = agreementParsed?.success ? agreementParsed.data : null;
  const agreementPdfChoices = site.media
    .filter((media) => value(media, 'mime') === 'application/pdf')
    .map((media) => ({
      id: value(media, 'id'),
      filename: value(media, 'filename'),
      category: value(media, 'category'),
      mime: value(media, 'mime'),
    }));

  // Staged rollout: preserve existing Site Delivery if the new RPC is not yet
  // installed on the verified environment; never infer missing stages.
  const constructionResponse = await s.client.rpc('construction_project_read', {
    p_organization_id: context.organizationId,
    p_project_id: id,
  });
  const constructionResult = constructionSchema.safeParse(
    constructionResponse.data,
  );
  const construction =
    !constructionResponse.error && constructionResult.success
      ? constructionResult.data
      : null;
  const qualityResponse = construction
    ? await s.client.rpc('construction_quality_read', {
        p_org: context.organizationId,
        p_project: id,
      })
    : null;
  const qualityResult =
    qualityResponse && !qualityResponse.error
      ? constructionQualitySchema.safeParse(qualityResponse.data)
      : null;
  const constructionQuality = qualityResult?.success
    ? qualityResult.data
    : null;
  const fieldResponse = construction
    ? await s.client.rpc('construction_field_read', {
        p_org: context.organizationId,
        p_project: id,
      })
    : null;
  const fieldParsed =
    fieldResponse && !fieldResponse.error
      ? constructionFieldSchema.safeParse(fieldResponse.data)
      : null;
  const constructionField = fieldParsed?.success ? fieldParsed.data : null;
  const tomorrowResponse = construction
    ? await s.client.rpc('construction_tomorrow_read', {
        p_org: context.organizationId,
        p_project: id,
      })
    : null;
  const tomorrowParsed =
    tomorrowResponse && !tomorrowResponse.error
      ? constructionTomorrowSchema.safeParse(tomorrowResponse.data)
      : null;
  const tomorrowWork = tomorrowParsed?.success ? tomorrowParsed.data : null;
  const procurementResponse =
    construction && (site.can_manage || site.role === 'procurement')
      ? await s.client.rpc('construction_procurement_watch', {
          p_org: context.organizationId,
          p_project: id,
        })
      : null;
  const procurementParsed =
    procurementResponse && !procurementResponse.error
      ? constructionProcurementSchema.safeParse(procurementResponse.data)
      : null;
  const procurementWatch = procurementParsed?.success
    ? procurementParsed.data
    : null;
  const paymentResponse =
    site.can_manage && construction
      ? await s.client.rpc('construction_payment_read', {
          p_org: context.organizationId,
          p_project: id,
        })
      : null;
  const paymentParsed =
    paymentResponse && !paymentResponse.error
      ? constructionPaymentSchema.safeParse(paymentResponse.data)
      : null;
  const constructionPayments = paymentParsed?.success
    ? paymentParsed.data
    : null;
  const clientPortalResponse =
    site.can_manage && construction
      ? await s.client.rpc('construction_client_manage_read', {
          p_org: context.organizationId,
          p_project: id,
        })
      : null;
  const clientPortalParsed =
    clientPortalResponse && !clientPortalResponse.error
      ? clientProgressManagementSchema.safeParse(clientPortalResponse.data)
      : null;
  const clientPortalManager = clientPortalParsed?.success
    ? clientPortalParsed.data
    : null;
  const canSeeManagerUpdates =
    site.can_manage ||
    ['site_engineer', 'quality_inspector', 'procurement'].includes(
      site.role ?? '',
    );
  let managerDataUnavailable = false;
  let managerData: ManagerData = {
    updates: [],
    reviews: [],
    quantity_revisions: [],
  };
  if (canSeeManagerUpdates && ['execution', 'handover'].includes(site.stage)) {
    const response = await s.client.rpc('project_site_manager_read', {
      p_organization_id: context.organizationId,
      p_project_id: id,
    });
    const selected = managerDataSchema.safeParse(response.data);
    if (response.error || !selected.success) {
      managerDataUnavailable = true;
    } else {
      managerData = selected.data;
    }
  }
  const latestReviews = new Map<string, Record<string, unknown>>();
  for (const review of managerData.reviews) {
    const reportId = value(review, 'report_id');
    if (!latestReviews.has(reportId)) latestReviews.set(reportId, review);
  }
  const role = site.role;
  const manager = site.can_manage;
  const isDesign =
    manager || role === 'architect' || role === 'structural_designer';
  const isEngineer = manager || role === 'site_engineer';
  const isQuality =
    manager || role === 'quality_inspector' || role === 'site_engineer';
  const isProcurement = manager || role === 'procurement';
  const isWatchman = manager || role === 'watchman';
  const open = site.stage === 'execution';
  const pendingChecks = site.checks.filter(
    (c) => value(c, 'status') !== 'passed',
  );
  const pendingMaterials = site.materials.filter(
    (m) => !['received', 'rejected'].includes(value(m, 'status')),
  );
  const latestDesigns = designKinds.map((kind) => ({
    ...kind,
    latest: site.designs
      .filter((d) => value(d, 'kind') === kind.value)
      .sort((a, b) => Number(b.revision) - Number(a.revision))[0],
  }));

  const has = (permission: string, moduleKey?: string) =>
    canAccess(context, {
      organizationId: context.organizationId,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });
  const [organization, user, plans] = await Promise.all([
    s.repository.organization(context.organizationId),
    s.authorization.requireAuthenticatedUser(),
    s.repository.plans().catch(() => []),
  ]);
  if (!organization) notFound();
  const email = user.email ?? '';
  const accountLabel =
    email.split('@')[0]?.split(/[._-]/).filter(Boolean).slice(0, 2).join(' ') ||
    'Company member';
  const planLabel =
    plans.find((plan) => plan.id === organization.plan_id)?.name ??
    'Business plan';
  let mobileUpdateHref = '#overview';
  if (site.stage !== 'not_started' && isDesign) {
    mobileUpdateHref = '#design';
  }
  if (open || site.stage === 'handover') {
    if (isEngineer || isQuality) {
      mobileUpdateHref = '#daily-reports';
    } else if (isWatchman) {
      mobileUpdateHref = '#security';
    }
  }

  return (
    <div className="site-command-theme">
      <OwnerShell
        companyName={organization.name}
        accountLabel={accountLabel}
        accountEmail={email}
        planLabel={planLabel}
        navigation={projectWorkspaceNavigation(has)}
        currentHref="/dashboard/projects"
        notificationsEnabled={has('notification.view')}
        search=""
      >
        <main id="main-content" tabIndex={-1} className="site-command-page">
          <div className="site-command-container">
            <SiteCommandOverview
              projectId={id}
              projectName={site.project.name}
              projectCode={site.project.code}
              stage={site.stage}
              role={role}
              isManager={manager}
              isEngineer={isEngineer}
              isQuality={isQuality}
              isProcurement={isProcurement}
              isWatchman={isWatchman}
              isDesign={isDesign}
              canSeeManagerUpdates={canSeeManagerUpdates}
              reports={site.reports}
              reviews={managerData.reviews}
              managerUpdates={managerData.updates}
              managerDataUnavailable={managerDataUnavailable}
              checks={site.checks}
              materials={site.materials}
              gate={site.gate}
              media={site.media}
            />
            {managerDataUnavailable && (
              <div className="sc-service-alert" role="status">
                Manager updates are temporarily unavailable. Existing Site
                Delivery records and other actions remain accessible according
                to your role.
              </div>
            )}
            <div id="overview" className="sc-activity-anchor">
              <SiteActivity
                projectId={id}
                stage={site.stage}
                isManager={manager}
                isEngineer={isEngineer}
                isQuality={isQuality}
                isProcurement={isProcurement}
                isWatchman={isWatchman}
                isDesign={isDesign}
                canSeeManagerUpdates={
                  canSeeManagerUpdates && !managerDataUnavailable
                }
                canViewOperations={has('execution.view')}
                reports={site.reports}
                updates={managerData.updates}
                checks={site.checks}
                materials={site.materials}
                gate={site.gate}
                media={site.media}
              />
            </div>

            {agreement && (
              <AgreementReadinessPanel
                projectId={id}
                state={agreement}
                files={agreementPdfChoices}
              />
            )}
            {construction && (
              <ConstructionPlanningPanel
                projectId={id}
                data={construction}
                memberOptions={site.member_options}
                quality={constructionQuality}
                field={constructionField}
                dailyReports={site.reports
                  .filter(
                    (report) =>
                      typeof report.id === 'string' &&
                      typeof report.report_date === 'string',
                  )
                  .map((report) => ({
                    id: String(report.id),
                    date: String(report.report_date),
                  }))}
              />
            )}

            {construction && tomorrowWork && (
              <ConstructionTomorrowPanel
                projectId={id}
                stages={construction.stages.map((stage) => ({
                  id: stage.id,
                  title: stage.title,
                  instance_code: stage.instance_code,
                }))}
                data={tomorrowWork}
              />
            )}

            {procurementWatch && (
              <ConstructionProcurementWatch
                projectId={id}
                data={procurementWatch}
              />
            )}

            {clientPortalManager && (
              <ConstructionClientPortalManager
                projectId={id}
                data={clientPortalManager}
              />
            )}
            {constructionPayments && (
              <ConstructionPaymentsPanel
                projectId={id}
                data={constructionPayments}
              />
            )}

            {site.stage === 'not_started' && (
              <section className={card} id="initialize">
                <Heading
                  eyebrow="Set up"
                  title="Start the project delivery workflow"
                  detail="A company manager initiates delivery after creating the customer project. The design stage starts first."
                />
                {manager ? (
                  <Action
                    project={id}
                    operation="initialize"
                    label="Initialize design stage"
                    fields={[]}
                  />
                ) : (
                  <p className="text-sm text-amber-800">
                    Ask your project manager to initialize the delivery process.
                  </p>
                )}
              </section>
            )}

            {manager && site.stage !== 'not_started' && (
              <section className={card} id="team">
                <Heading
                  eyebrow="Project access"
                  title="Assign the right people"
                  detail="Architects and structural designers prepare drawings. After client approval, the site engineer, watchman, QA and procurement team take over. Only assigned employees can access this project."
                />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {site.team
                    .filter((t) => t.active)
                    .map((member) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm"
                        key={member.id}
                      >
                        <span>
                          {site.member_options.find(
                            (m) => m.id === member.user_id,
                          )?.label ?? value(member, 'user_id').slice(0, 8)}
                        </span>
                        <span className={gray}>
                          {display(value(member, 'role'))}
                        </span>
                      </div>
                    ))}
                </div>
                <details className={formDetails}>
                  <summary className="cursor-pointer font-semibold">
                    Assign or change an employee&apos;s project role
                  </summary>
                  <div className="mt-4">
                    <Action
                      project={id}
                      operation="assign"
                      label="Save project access"
                      fields={[
                        {
                          name: 'user_id',
                          label: 'Active company member',
                          input: 'select',
                          required: true,
                          options: site.member_options.map((x) => ({
                            value: x.id,
                            label: x.label,
                          })),
                        },
                        {
                          name: 'role',
                          label: 'Project role',
                          input: 'select',
                          required: true,
                          options: [
                            'manager',
                            'architect',
                            'structural_designer',
                            'site_engineer',
                            'watchman',
                            'quality_inspector',
                            'procurement',
                          ].map((x) => ({ value: x, label: display(x) })),
                        },
                        {
                          name: 'active',
                          label: 'Access',
                          input: 'select',
                          required: true,
                          options: [
                            { value: 'true', label: 'Enable' },
                            { value: 'false', label: 'Revoke' },
                          ],
                          initial: 'true',
                        },
                      ]}
                    />
                  </div>
                </details>
              </section>
            )}

            {(isDesign ||
              manager ||
              role === 'site_engineer' ||
              role === 'quality_inspector') &&
              site.stage !== 'not_started' && (
                <section className={card} id="design">
                  <Heading
                    eyebrow="Stage 1"
                    title="Design and technical approval"
                    detail="Latest architectural plan, 3D design and structural revision must each be reviewed before client approval can be recorded."
                  />
                  <div className="grid gap-4 md:grid-cols-3">
                    {latestDesigns.map((kind) => {
                      const current = kind.latest;
                      return (
                        <article
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                          key={kind.value}
                        >
                          <h3 className="font-semibold">{kind.label}</h3>
                          {current ? (
                            <>
                              <p className="mt-2 text-xs text-slate-500">
                                Revision {value(current, 'revision')}
                              </p>
                              <span
                                className={
                                  value(current, 'status') === 'approved'
                                    ? green
                                    : gray
                                }
                              >
                                {display(value(current, 'status'))}
                              </span>
                              <p className="mt-2 break-all text-sm">
                                {value(current, 'reference')}
                              </p>
                              {value(current, 'review_note') && (
                                <p className="mt-2 text-xs text-slate-600">
                                  Review: {value(current, 'review_note')}
                                </p>
                              )}
                              {manager &&
                                site.stage === 'design' &&
                                value(current, 'status') === 'submitted' && (
                                  <div className="mt-4 space-y-3">
                                    <Action
                                      project={id}
                                      operation="design_decide"
                                      label="Approve drawing"
                                      hidden={{
                                        id: String(current.id),
                                        decision: 'approved',
                                        note: '',
                                      }}
                                      fields={[]}
                                    />
                                    <Action
                                      project={id}
                                      operation="design_decide"
                                      label="Request changes"
                                      hidden={{
                                        id: String(current.id),
                                        decision: 'changes_requested',
                                      }}
                                      fields={[
                                        {
                                          name: 'note',
                                          label: 'Changes required',
                                          required: true,
                                        },
                                      ]}
                                    />
                                  </div>
                                )}
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">
                              Not submitted
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {isDesign && site.stage === 'design' && (
                    <details className={formDetails}>
                      <summary className="cursor-pointer font-semibold">
                        Submit a drawing or revised design
                      </summary>
                      <div className="mt-4">
                        <Action
                          project={id}
                          operation="design_submit"
                          label="Submit for technical review"
                          fields={[
                            {
                              name: 'kind',
                              label: 'Design deliverable',
                              input: 'select',
                              required: true,
                              options: designKinds,
                            },
                            {
                              name: 'reference',
                              label:
                                'Drawing reference or uploaded evidence filename',
                              required: true,
                              placeholder:
                                'Example: Structural drawing STR-02 / uploaded file name',
                            },
                            {
                              name: 'notes',
                              label: 'Revision notes',
                              input: 'textarea',
                            },
                          ]}
                        />
                      </div>
                    </details>
                  )}
                  {site.stage === 'design' && manager && (
                    <details className={formDetails}>
                      <summary className="cursor-pointer font-semibold">
                        Record client approval and release drawings
                      </summary>
                      <p className="my-3 text-sm text-slate-600">
                        Record how the client approved the final revisions,
                        including date and evidence. This is a staff-recorded
                        acknowledgement, not a client digital signature.
                      </p>
                      <Action
                        project={id}
                        operation="client_approve"
                        label="Record client's design approval"
                        fields={[
                          {
                            name: 'evidence',
                            label:
                              'Client approval evidence (date, message or signed reference)',
                            input: 'textarea',
                            required: true,
                            placeholder:
                              'Approved latest revisions by email/meeting on …',
                          },
                        ]}
                      />
                    </details>
                  )}
                </section>
              )}

            {site.stage === 'client_approved' && manager && (
              <section className={card} id="launch">
                <Heading
                  eyebrow="Stage 2"
                  title="Design approved. Begin site work"
                  detail="Confirm marking readiness, assign the site team and begin execution. This step is blocked until all three designs have been approved and client approval evidence has been recorded."
                />
                <p className="mb-4 text-sm text-slate-600">
                  Approval recorded: {site.client_approval_recorded_at ?? '—'}
                </p>
                <Action
                  project={id}
                  operation="execution_start"
                  label="Authorize site execution"
                  fields={[]}
                />
              </section>
            )}

            {canSeeManagerUpdates && (open || site.stage === 'handover') && (
              <section className={card} id="manager-updates">
                <Heading
                  eyebrow="Manager control"
                  title="Project manager's updates & tomorrow priorities"
                  detail="Human-entered instructions, project health, tomorrow's priorities, site risks and pending decisions. Engineers can read the updates; only the project manager can publish them."
                />
                {manager && open && (
                  <details
                    className={formDetails}
                    open={managerData.updates.length === 0}
                  >
                    <summary className="cursor-pointer font-semibold">
                      Publish a project manager update
                    </summary>
                    <div className="mt-4">
                      <ManagerAction
                        project={id}
                        operation="manager_update"
                        label="Save manager's daily update"
                        fields={[
                          {
                            name: 'report_date',
                            label: 'Update date',
                            input: 'date',
                            required: true,
                          },
                          {
                            name: 'health',
                            label: 'Overall site status',
                            input: 'select',
                            required: true,
                            options: [
                              { value: 'on_track', label: 'On track' },
                              { value: 'at_risk', label: 'At risk' },
                              {
                                value: 'blocked',
                                label: 'Blocked / cannot proceed',
                              },
                            ],
                          },
                          {
                            name: 'summary',
                            label: 'Progress / decisions today',
                            input: 'textarea',
                            required: true,
                          },
                          {
                            name: 'tomorrow_priorities',
                            label: 'Tomorrow work priorities',
                            input: 'textarea',
                            required: true,
                          },
                          {
                            name: 'decisions_needed',
                            label: 'Pending approvals and decisions',
                            input: 'textarea',
                          },
                          {
                            name: 'materials_notes',
                            label: 'Manual material / procurement instructions',
                            input: 'textarea',
                          },
                          {
                            name: 'site_instructions',
                            label: 'Instructions to site engineer / security',
                            input: 'textarea',
                          },
                        ]}
                      />
                    </div>
                  </details>
                )}
                <div className="mt-4 space-y-3">
                  {managerData.updates.map((update) => (
                    <article
                      className="rounded-xl border border-slate-200 p-4 text-sm"
                      key={update.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{value(update, 'report_date')}</strong>
                        <span
                          className={
                            value(update, 'health') === 'on_track'
                              ? green
                              : gray
                          }
                        >
                          {display(value(update, 'health'))}
                        </span>
                      </div>
                      <p className="mt-2">
                        <strong>Progress:</strong> {value(update, 'summary')}
                      </p>
                      <p className="mt-2">
                        <strong>Tomorrow:</strong>{' '}
                        {value(update, 'tomorrow_priorities')}
                      </p>
                      {value(update, 'decisions_needed') && (
                        <p className="mt-2">
                          <strong>Pending approvals:</strong>{' '}
                          {value(update, 'decisions_needed')}
                        </p>
                      )}
                      {value(update, 'materials_notes') && (
                        <p className="mt-2">
                          <strong>Material instructions:</strong>{' '}
                          {value(update, 'materials_notes')}
                        </p>
                      )}
                      {value(update, 'site_instructions') && (
                        <p className="mt-2">
                          <strong>Staff instructions:</strong>{' '}
                          {value(update, 'site_instructions')}
                        </p>
                      )}
                    </article>
                  ))}
                  {!managerData.updates.length && (
                    <p className="text-sm text-slate-500">
                      No project manager updates yet.
                    </p>
                  )}
                </div>
              </section>
            )}

            {(isEngineer || isQuality) &&
              (open || site.stage === 'handover') && (
                <section className={card} id="daily-reports">
                  <Heading
                    eyebrow="Stage 3"
                    title="Daily site execution"
                    detail="Site engineer records completed work, today's labour, blockers, tomorrow's tasks, checks completed and checks required. Add photo or video evidence below."
                  />
                  {open && isEngineer && (
                    <details
                      className={formDetails}
                      open={site.reports.length === 0}
                    >
                      <summary className="cursor-pointer font-semibold">
                        Submit daily progress update
                      </summary>
                      <div className="mt-4">
                        <Action
                          project={id}
                          operation="report_add"
                          label="Publish site report"
                          fields={[
                            {
                              name: 'report_date',
                              label: 'Work date',
                              input: 'date',
                              required: true,
                              initial: new Date().toISOString().slice(0, 10),
                            },
                            {
                              name: 'worker_count',
                              label: 'Workers on site',
                              input: 'number',
                              required: true,
                              initial: '0',
                            },
                            {
                              name: 'completed_work',
                              label: 'Work completed today',
                              input: 'textarea',
                              required: true,
                              placeholder:
                                'Marking, footing, concrete, brickwork…',
                            },
                            {
                              name: 'tomorrow_plan',
                              label: 'Planned work for tomorrow',
                              input: 'textarea',
                              required: true,
                            },
                            {
                              name: 'blockers',
                              label: 'Delays / blockers',
                              input: 'textarea',
                            },
                            {
                              name: 'checks_done',
                              label: 'Checks completed',
                              input: 'textarea',
                            },
                            {
                              name: 'checks_required',
                              label: 'Checks required / due next',
                              input: 'textarea',
                            },
                          ]}
                        />
                      </div>
                    </details>
                  )}
                  <div className="mt-4 space-y-3">
                    {site.reports.map((report) => (
                      <article
                        key={report.id}
                        className="rounded-xl border border-slate-200 p-4 text-sm"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{value(report, 'report_date')}</strong>
                          <span className={gray}>
                            {value(report, 'worker_count')} workers
                          </span>
                        </div>
                        <p className="mt-3">
                          <strong>Completed:</strong>{' '}
                          {value(report, 'completed_work')}
                        </p>
                        <p className="mt-2">
                          <strong>Tomorrow:</strong>{' '}
                          {value(report, 'tomorrow_plan')}
                        </p>
                        {value(report, 'blockers') && (
                          <p className="mt-2 text-amber-800">
                            <strong>Blockers:</strong>{' '}
                            {value(report, 'blockers')}
                          </p>
                        )}
                        {value(report, 'checks_done') && (
                          <p className="mt-2">
                            <strong>Checks done:</strong>{' '}
                            {value(report, 'checks_done')}
                          </p>
                        )}
                        {value(report, 'checks_required') && (
                          <p className="mt-2">
                            <strong>Checks required:</strong>{' '}
                            {value(report, 'checks_required')}
                          </p>
                        )}
                        {latestReviews.has(String(report.id)) && (
                          <p className="mt-3 rounded-lg bg-slate-50 p-2 text-xs">
                            <strong>Manager review:</strong>{' '}
                            {display(
                              value(
                                latestReviews.get(String(report.id)) ?? {},
                                'decision',
                              ),
                            )}
                            {value(
                              latestReviews.get(String(report.id)) ?? {},
                              'note',
                            ) &&
                              ' · ' +
                                value(
                                  latestReviews.get(String(report.id)) ?? {},
                                  'note',
                                )}
                          </p>
                        )}
                        {manager && open && (
                          <details className={formDetails}>
                            <summary className="cursor-pointer font-semibold">
                              Review engineer report
                            </summary>
                            <p className="my-2 text-xs text-slate-600">
                              Manager reviews of reports submitted by another
                              team member are recorded permanently. A manager
                              cannot approve their own report.
                            </p>
                            <ManagerAction
                              project={id}
                              operation="report_review"
                              label="Record review"
                              hidden={{ report_id: String(report.id) }}
                              fields={[
                                {
                                  name: 'decision',
                                  label: 'Review decision',
                                  input: 'select',
                                  required: true,
                                  options: [
                                    { value: 'approved', label: 'Approved' },
                                    {
                                      value: 'changes_requested',
                                      label: 'Changes needed',
                                    },
                                  ],
                                },
                                {
                                  name: 'note',
                                  label:
                                    'Review notes / work requiring correction',
                                  input: 'textarea',
                                },
                              ]}
                            />
                          </details>
                        )}
                      </article>
                    ))}
                    {!site.reports.length && (
                      <p className="text-sm text-slate-500">
                        No site reports recorded yet.
                      </p>
                    )}
                  </div>
                </section>
              )}

            {(isEngineer || isProcurement) &&
              (open || site.stage === 'handover') && (
                <section className={card} id="materials">
                  <Heading
                    eyebrow="Materials"
                    title="Quantities and purchasing"
                    detail="Request measured quantities for site marking and execution, approve procurement, then record whether the actual purchase is from a Business OS seller or an outside supplier. A request does not itself create a purchase order."
                  />
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link
                      className="font-semibold text-blue-700 underline"
                      href={`/dashboard/execution?project=${id}`}
                    >
                      Approved estimate &amp; BOQ →
                    </Link>
                    <Link
                      className="font-semibold text-blue-700 underline"
                      href={`/dashboard/execution/purchase_orders?project=${id}`}
                    >
                      Purchase orders →
                    </Link>
                    <Link
                      className="font-semibold text-blue-700 underline"
                      href="/dashboard/marketplace"
                    >
                      Marketplace sellers →
                    </Link>
                  </div>
                  {open && (isEngineer || isProcurement) && (
                    <details className={formDetails}>
                      <summary className="cursor-pointer font-semibold">
                        Request material / planned quantity
                      </summary>
                      <div className="mt-4">
                        <Action
                          project={id}
                          operation="material_add"
                          label="Add site material request"
                          fields={[
                            {
                              name: 'item',
                              label: 'Material',
                              required: true,
                              placeholder:
                                'Cement / steel / sand / electrical conduit',
                            },
                            {
                              name: 'quantity',
                              label: 'Required quantity',
                              input: 'number',
                              required: true,
                            },
                            {
                              name: 'unit',
                              label: 'Unit',
                              input: 'select',
                              required: true,
                              options: unitOptions,
                            },
                            {
                              name: 'notes',
                              label: 'BOQ reference, marking or usage notes',
                              input: 'textarea',
                            },
                          ]}
                        />
                      </div>
                    </details>
                  )}
                  <div className="mt-4 space-y-3">
                    {site.materials.map((m) => (
                      <article
                        key={m.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{value(m, 'item')}</strong>
                          <span className={gray}>
                            {display(value(m, 'status'))}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {value(m, 'quantity')} {value(m, 'unit')} ·{' '}
                          {display(value(m, 'source'))}
                        </p>
                        {value(m, 'vendor_reference') && (
                          <p className="mt-1 text-xs text-slate-600">
                            Supplier/PO reference:{' '}
                            {value(m, 'vendor_reference')}
                          </p>
                        )}
                        {manager &&
                          open &&
                          ['requested', 'approved'].includes(
                            value(m, 'status'),
                          ) && (
                            <details className={formDetails}>
                              <summary className="cursor-pointer text-sm font-semibold">
                                Correct manually measured quantity
                              </summary>
                              <p className="mt-2 text-xs text-slate-600">
                                AI measurement is not enabled. The original
                                quantity and reason are preserved, and already
                                ordered materials cannot be changed here.
                              </p>
                              <div className="mt-3">
                                <ManagerAction
                                  project={id}
                                  operation="material_quantity_correct"
                                  label="Save corrected quantity"
                                  hidden={{ id: String(m.id) }}
                                  fields={[
                                    {
                                      name: 'quantity',
                                      label:
                                        'New required quantity (' +
                                        value(m, 'unit') +
                                        ')',
                                      input: 'number',
                                      required: true,
                                      initial: value(m, 'quantity'),
                                    },
                                    {
                                      name: 'reason',
                                      label: 'Why did the quantity change?',
                                      input: 'textarea',
                                      required: true,
                                    },
                                  ]}
                                />
                              </div>
                            </details>
                          )}
                        {open &&
                          isProcurement &&
                          ['requested', 'approved', 'ordered'].includes(
                            value(m, 'status'),
                          ) && (
                            <details className={formDetails}>
                              <summary className="cursor-pointer text-sm font-semibold">
                                Record procurement decision
                              </summary>
                              <div className="mt-3">
                                <Action
                                  project={id}
                                  operation="material_update"
                                  label="Save procurement status"
                                  hidden={{ id: String(m.id) }}
                                  fields={[
                                    {
                                      name: 'status',
                                      label: 'Next status',
                                      input: 'select',
                                      required: true,
                                      options: (value(m, 'status') ===
                                      'requested'
                                        ? ['approved', 'rejected']
                                        : value(m, 'status') === 'approved'
                                          ? ['ordered']
                                          : ['received']
                                      ).map((v) => ({
                                        value: v,
                                        label: display(v),
                                      })),
                                    },
                                    {
                                      name: 'source',
                                      label: 'Purchase source',
                                      input: 'select',
                                      required: true,
                                      options: supplierOptions,
                                      initial: value(m, 'source'),
                                    },
                                    {
                                      name: 'vendor_reference',
                                      label:
                                        'Seller / external supplier / actual PO reference',
                                      placeholder:
                                        'Required once ordered or received',
                                    },
                                  ]}
                                />
                              </div>
                            </details>
                          )}
                      </article>
                    ))}
                    {manager && managerData.quantity_revisions.length > 0 && (
                      <details className={formDetails}>
                        <summary className="cursor-pointer text-sm font-semibold">
                          Manual quantity revision history
                        </summary>
                        <div className="mt-3 space-y-2">
                          {managerData.quantity_revisions.map((revision) => (
                            <p
                              className="text-xs text-slate-700"
                              key={revision.id}
                            >
                              {value(revision, 'old_quantity')} →{' '}
                              {value(revision, 'new_quantity')}
                              {' · '}
                              {value(revision, 'reason')}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                    {!site.materials.length && (
                      <p className="text-sm text-slate-500">
                        No materials requested yet.
                      </p>
                    )}
                  </div>
                </section>
              )}

            {isQuality && (open || site.stage === 'handover') && (
              <section className={card} id="quality">
                <Heading
                  eyebrow="Quality"
                  title="Checks done and checks required"
                  detail="Create marking and quality checks, record pass/fail and rechecks. Formal template-driven inspections and snags remain available in the existing site execution module."
                />
                <div className="mb-4 flex flex-wrap gap-3 text-sm">
                  <Link
                    className="text-blue-700 underline"
                    href={`/dashboard/operations/project_inspections?project=${id}`}
                  >
                    Formal inspections →
                  </Link>
                  <Link
                    className="text-blue-700 underline"
                    href={`/dashboard/operations/project_snags?project=${id}`}
                  >
                    Site snags →
                  </Link>
                </div>
                {open && (
                  <details className={formDetails}>
                    <summary className="cursor-pointer font-semibold">
                      Create a required quality check
                    </summary>
                    <div className="mt-3">
                      <Action
                        project={id}
                        operation="check_add"
                        label="Add check"
                        fields={[
                          {
                            name: 'title',
                            label: 'Check description',
                            required: true,
                            placeholder:
                              'Marking gridline levels / steel cover / curing…',
                          },
                          {
                            name: 'due_date',
                            label: 'Due date',
                            input: 'date',
                          },
                          {
                            name: 'notes',
                            label: 'Inspection notes',
                            input: 'textarea',
                          },
                        ]}
                      />
                    </div>
                  </details>
                )}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {site.checks.map((c) => (
                    <article
                      key={c.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{value(c, 'title')}</strong>
                        <span
                          className={
                            value(c, 'status') === 'passed' ? green : gray
                          }
                        >
                          {display(value(c, 'status'))}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {value(c, 'due_date')
                          ? 'Due ' + value(c, 'due_date')
                          : ''}
                      </p>
                      {open && value(c, 'status') !== 'passed' && (
                        <details className={formDetails}>
                          <summary className="cursor-pointer text-sm font-semibold">
                            Record check result
                          </summary>
                          <div className="mt-3">
                            <Action
                              project={id}
                              operation="check_update"
                              label="Save check result"
                              hidden={{ id: String(c.id) }}
                              fields={[
                                {
                                  name: 'status',
                                  label: 'Result',
                                  input: 'select',
                                  required: true,
                                  options: ['passed', 'failed', 'recheck'].map(
                                    (x) => ({ value: x, label: display(x) }),
                                  ),
                                },
                                {
                                  name: 'notes',
                                  label: 'Check evidence / notes',
                                  input: 'textarea',
                                },
                              ]}
                            />
                          </div>
                        </details>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {isWatchman && (open || site.stage === 'handover') && (
              <section className={card} id="security">
                <Heading
                  eyebrow="Security &amp; curing"
                  title="Gate register and site rounds"
                  detail="Watchman records material delivery arrivals, visitors, labour entry, security checks and curing rounds without access to quotations or purchase costs."
                />
                {open && (
                  <details
                    className={formDetails}
                    open={site.gate.length === 0}
                  >
                    <summary className="cursor-pointer font-semibold">
                      Record site event
                    </summary>
                    <div className="mt-3">
                      <Action
                        project={id}
                        operation="gate_add"
                        label="Save gate log"
                        fields={[
                          {
                            name: 'kind',
                            label: 'Entry type',
                            input: 'select',
                            required: true,
                            options: [
                              'material_delivery',
                              'visitor',
                              'labour',
                              'security_round',
                              'curing',
                            ].map((x) => ({ value: x, label: display(x) })),
                          },
                          {
                            name: 'description',
                            label: 'What happened',
                            input: 'textarea',
                            required: true,
                          },
                          {
                            name: 'notes',
                            label: 'Truck number, count, area or timings',
                            input: 'textarea',
                          },
                        ]}
                      />
                    </div>
                  </details>
                )}
                <div className="mt-4 space-y-2">
                  {site.gate.map((entry) => (
                    <p
                      className="rounded-xl border border-slate-200 p-3 text-sm"
                      key={entry.id}
                    >
                      <strong className="capitalize">
                        {display(value(entry, 'kind'))}
                      </strong>{' '}
                      · {value(entry, 'description')}
                      <small className="ml-2 text-slate-500">
                        {value(entry, 'created_at')
                          .slice(0, 16)
                          .replace('T', ' ')}
                      </small>
                    </p>
                  ))}
                </div>
              </section>
            )}

            {(isDesign || isEngineer || isQuality) &&
              ['design', 'execution'].includes(site.stage) && (
                <section className={card} id="media">
                  <Heading
                    eyebrow="Evidence"
                    title="Drawings, photos and progress clips"
                    detail="Private uploads are restricted to assigned project roles. Each file can be up to 8 MB; large video storage needs the planned object-storage integration."
                  />
                  <ProjectSiteMediaForm
                    project={id}
                    phase={site.stage as 'design' | 'execution'}
                  />
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {site.media.map((m) => (
                      <a
                        className="rounded-xl border border-slate-200 p-3 hover:border-blue-400"
                        key={m.id}
                        href={`/dashboard/projects/${id}/site/media/${m.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <p className="truncate text-sm font-semibold">
                          {value(m, 'filename')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {display(value(m, 'category'))} · {value(m, 'mime')}
                        </p>
                        <p className="mt-2 text-xs text-slate-600">
                          {value(m, 'caption')}
                        </p>
                        <span className="mt-2 block text-xs font-semibold text-blue-700">
                          Open evidence ↗
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              )}

            {manager && open && (
              <section className={card} id="handover">
                <Heading
                  eyebrow="Stage 4"
                  title="Quality clearance and handover"
                  detail="The system checks formal inspections, task completion, open snags, site checklists and outstanding materials before allowing the project to move to handover."
                />
                <p className="mb-4 text-sm text-slate-700">
                  Pending site checks: {pendingChecks.length} · Material items
                  awaiting closure: {pendingMaterials.length}
                </p>
                {construction && constructionQuality && (
                  <ConstructionHandoverReadiness
                    workflowStatus={construction.workflow?.status ?? null}
                    pendingChecks={pendingChecks.length}
                    pendingMaterials={pendingMaterials.length}
                    stages={constructionQuality.stages.map((stage) => ({
                      id: stage.stage_id,
                      title: stage.title,
                      instance_code: stage.instance_code,
                      hold_point: stage.hold_point,
                      cleared: stage.cleared,
                      floor_code:
                        construction.stages.find(
                          (planned) => planned.id === stage.stage_id,
                        )?.floor_code ?? null,
                    }))}
                  />
                )}
                <Action
                  project={id}
                  operation="handover"
                  label="Validate and mark ready for handover"
                  fields={[]}
                />
                <Link
                  className="ml-3 text-sm font-semibold text-blue-700 underline"
                  href={`/dashboard/operations/closure?project=${id}`}
                >
                  Full physical completion review →
                </Link>
              </section>
            )}

            <footer className="sc-footer flex flex-wrap gap-3 rounded-xl border p-4 text-sm">
              <Link
                className="font-semibold text-blue-700 underline"
                href={`/dashboard/operations?project=${id}`}
              >
                Schedule, tasks &amp; inspections →
              </Link>
              <Link
                className="font-semibold text-blue-700 underline"
                href={`/dashboard/execution?project=${id}`}
              >
                BOQ, procurement &amp; receipts →
              </Link>
            </footer>
          </div>
        </main>
        <nav
          className="sc-mobile-bottom"
          aria-label="Mobile workspace navigation"
        >
          <Link href="/dashboard">
            <span aria-hidden="true">⌂</span>Dashboard
          </Link>
          <Link href="/dashboard/projects" aria-current="page">
            <span aria-hidden="true">▱</span>Projects
          </Link>
          <a href={mobileUpdateHref}>
            <span aria-hidden="true">＋</span>Site updates
          </a>
          <a href="#overview">
            <span aria-hidden="true">⋯</span>Overview
          </a>
        </nav>
      </OwnerShell>
    </div>
  );
}
