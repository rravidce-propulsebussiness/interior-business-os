import Link from 'next/link';
import { canAccess } from '@business-os/auth';
import { OwnerShell } from '../../../owner-shell';
import { OwnerMobileNav } from '../../../owner-mobile-nav';
import { ProjectMobileTabs } from '../project-mobile-tabs';
import { projectWorkspaceNavigation } from '../../project-workspace-navigation';
import { SiteCommandOverview } from './command-overview';
import { SiteAccessState } from './site-access-state';
import { ConstructionPlanningPanel } from './construction-planning-panel';
import { ConstructionJourney } from './construction-journey';
import { stageOwnerSchema, mergeStageOwnerEdits } from './stage-owner-view';
import { AgreementReadinessPanel } from './agreement-readiness-panel';
import '../../../owner-dashboard.css';
import './site-command.css';
import './site-premium.css';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { ProjectSiteForm, ProjectSiteMediaForm, type SiteField } from './forms';

const stageRecordSchema = z.object({
  owned: z.array(z.object({ kind: z.string(), id: z.uuid() })).default([]),
  links: z.array(
    z.object({
      stage_id: z.uuid(),
      kind: z.string(),
      record_id: z.uuid(),
    }),
  ),
  payments: z.array(
    z.object({
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
    }),
  ),
  options: z.array(
    z.object({
      id: z.uuid(),
      contract_id: z.uuid(),
      label: z.string(),
      amount: z.string(),
      currency: z.string(),
      contract_number: z.string(),
    }),
  ),
});

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
  advance_required: z.boolean().default(false),
  advance_received: z.boolean().default(false),
  advance_total: z.string().default('0'),
  clearance_event_id: z.uuid().nullable(),
  clearance_type: z.string().nullable(),
  clearance_media_id: z.uuid().nullable(),
  clearance_recorded_at: z.string().nullable(),
  current_scope: z.boolean(),
  execution_authorized: z.boolean(),
  can_authorize_exception: z.boolean(),
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
const constructionDesignKinds = [
  { value: 'architectural_plan', label: 'Architectural / floor plan' },
  { value: '3d_design', label: '3D design / elevation' },
  { value: 'structural_design', label: 'Structural drawings' },
];
const interiorDesignKinds = [
  { value: 'interior_layout', label: 'Interior layout / room plan' },
  { value: '3d_design', label: 'Interior 3D views' },
  { value: 'electrical_plan', label: 'Electrical / lighting plan (optional)' },
  { value: 'plumbing_plan', label: 'Plumbing plan (optional)' },
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
  const constructionBase =
    !constructionResponse.error && constructionResult.success
      ? constructionResult.data
      : null;
  const ownerResponse = constructionBase
    ? await s.client.rpc('project_stage_owner_read', {
        p_org: context.organizationId,
        p_project: id,
      })
    : null;
  const ownerParsed =
    ownerResponse && !ownerResponse.error
      ? stageOwnerSchema.safeParse(ownerResponse.data)
      : null;
  const ownerData = ownerParsed?.success ? ownerParsed.data : null;
  const construction = constructionBase
    ? {
        ...constructionBase,
        stages: mergeStageOwnerEdits(constructionBase.stages, ownerData),
      }
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
  const stageRecordResponse = construction
    ? await s.client.rpc('construction_stage_record_read', {
        p_organization_id: context.organizationId,
        p_project_id: id,
      })
    : null;
  const stageRecordParsed =
    stageRecordResponse && !stageRecordResponse.error
      ? stageRecordSchema.safeParse(stageRecordResponse.data)
      : null;
  const stageRecords = stageRecordParsed?.success
    ? stageRecordParsed.data
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
  const { data: projectIndustry } = await s.client
    .from('projects').select('industry_id')
    .eq('organization_id', context.organizationId).eq('id', id).maybeSingle();
  const { data: industryDefinition } = projectIndustry?.industry_id
    ? await s.client.from('industries').select('key')
        .eq('id', projectIndustry.industry_id).maybeSingle()
    : { data: null };
  const isInterior = industryDefinition?.key === 'interior';
  const availableDesignKinds = isInterior
    ? interiorDesignKinds : constructionDesignKinds;
  const latestDesigns = availableDesignKinds.map((kind) => ({
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

  const initialSiteFocus: 'timeline' | 'setup' | 'security' =
    ['not_started','design','client_approved'].includes(site.stage)
      ? 'setup'
      : role === 'watchman' && !manager ? 'security' : 'timeline';

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
        dashboardBrand
      >
        <main id="main-content" tabIndex={-1} className="site-command-page"
          data-project-focus={initialSiteFocus}>
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
            <ProjectMobileTabs projectId={id}
              active={initialSiteFocus === 'timeline' ? 'timeline' : 'more'}
              defaultSiteFocus={initialSiteFocus}
              allowFinance={has('invoice.view','billing')}
              allowUpdates={(open || site.stage === 'handover') &&
                (isEngineer || isQuality || canSeeManagerUpdates)}
              allowTeam={manager}
              allowMaterials={(open || site.stage === 'handover') &&
                (isEngineer || isProcurement)}
              allowQuality={(open || site.stage === 'handover') && isQuality}
              allowFiles={isDesign || isEngineer || isQuality || isWatchman}
              allowSetup={isDesign || isEngineer || manager}
              allowSecurity={isWatchman}
              allowHandover={manager}/>

            {agreement && (
              <div className="site-agreement-panel">
                <AgreementReadinessPanel
                projectId={id}
                state={agreement}
                files={agreementPdfChoices}
                />
              </div>
            )}
            {construction && (
              <ConstructionJourney
                projectId={id}
                stages={construction.stages}
                quality={constructionQuality}
                materials={site.materials}
                checks={site.checks}
                media={site.media}
                reports={site.reports}
                gate={site.gate}
                canSeeFinance={has('contract.view', 'billing')}
                inSiteWorkspace
                canUploadCuringPhotos={open && isWatchman}
                stageRecords={stageRecords}
                canLinkRecords={construction.can_manage || isEngineer}
                canManageLinks={construction.can_manage}
                isWatchman={role === 'watchman' && !manager}
              />
            )}
            {!construction && (
              <section className="sc-plan-empty" id="construction-timeline">
                <h2>Timeline not started</h2>
                <p>The project timeline comes from the accepted quotation and agreement.
                  No floor or room plan needs to be entered twice.</p>
                <a href="#design">Open agreement & design →</a>
              </section>
            )}
            {managerDataUnavailable && (
              <div className="sc-service-alert" role="status">
                Manager updates are temporarily unavailable. Existing Site
                Delivery records and other actions remain accessible according
                to your role.
              </div>
            )}
            {construction && (
              <details className="sc-advanced-plan">
                <summary>Manage execution plan and stage assignments</summary>
                <ConstructionPlanningPanel
                projectId={id}
                data={construction}
                canOwnerEdit={Boolean(ownerData?.can_edit)}
                memberOptions={site.member_options}
                quality={constructionQuality}
                />
              </details>
            )}

            {site.stage === 'not_started' && (
              <section className={card} id="initialize">
                <Heading
                  eyebrow="Quote-first project delivery"
                  title="Awaiting the approved quotation and agreement"
                  detail="Site Delivery and the planned stage timeline are created automatically when the approved construction or interior quote becomes an agreement."
                />
                <Link
                  href="/dashboard/quotations"
                  className="inline-flex rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800"
                >
                  View quotation and agreement
                </Link>
                {manager && (
                  <p className="mt-2 text-xs text-slate-600">
                    If the agreement was created earlier, use the quote recovery
                    action in the stage panel. Do not enter floors or stages
                    twice.
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
                    detail="Designer uploads drawings and revisions. Internal technical checks do not replace client consent. Record the client's explicit approval or requested changes before site work proceeds."
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
                                      label="Technical check passed"
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
                                      label="Request technical corrections"
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
                              options: availableDesignKinds,
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
                        Record the client's design decision
                      </summary>
                      <p className="my-3 text-sm text-slate-600">
                        Record the customer's acceptance of the final revisions,
                        including the date and evidence. The customer should approve
                        or request changes; this staff entry only records their
                        decision, and is not an online customer signature.
                      </p>
                      <Action
                        project={id}
                        operation="client_approve"
                        label="Record client-approved revisions"
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
                      {latestDesigns.some((kind) => value(kind.latest ?? {}, 'status') === 'approved') && (
                        <div className="mt-5 border-t border-slate-200 pt-4">
                          <p className="mb-3 text-sm text-slate-700">
                            Did the customer ask for changes? Record their response.
                            The designer can then upload a new revision for review.
                          </p>
                          <Action
                            project={id}
                            operation="client_changes"
                            label="Customer requested changes"
                            fields={[
                              {
                                name: 'kind',
                                label: 'Drawing to revise',
                                input: 'select',
                                required: true,
                                options: latestDesigns
                                  .filter((kind) => value(kind.latest ?? {}, 'status') === 'approved')
                                  .map((kind) => ({ value: kind.value, label: kind.label })),
                              },
                              {
                                name: 'note',
                                label: 'What must the designer change?',
                                input: 'textarea',
                                required: true,
                              },
                              {
                                name: 'evidence',
                                label: 'Customer request reference (date, email, message)',
                                input: 'textarea',
                                required: true,
                              },
                            ]}
                          />
                        </div>
                      )}
                    </details>
                  )}
                </section>
              )}

            {site.stage === 'client_approved' && manager && (
              <section className={card} id="launch">
                <Heading
                  eyebrow="Stage 2"
                  title="Design approved. Begin site work"
                  detail="Confirm required construction or interior drawings, signed agreement and recorded advance before releasing site execution. Quality and structural checks remain mandatory where applicable."
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
                              label: 'Workers on site today (actual)',
                              input: 'number',
                              required: true,
                              initial: '0',
                            },
                            {
                              name: 'tomorrow_workers',
                              label: 'Workers required for tomorrow (planned)',
                              input: 'number',
                              placeholder: 'Enter expected labour count',
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
                        {value(report, 'tomorrow_workers') && (
                          <p className="mt-2">
                            <strong>Labour needed tomorrow:</strong>{' '}
                            {value(report, 'tomorrow_workers')} workers
                            (planned)
                          </p>
                        )}
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
                    detail="Site engineers and project managers can request the actual required quantity. Project managers review/correct requests; procurement staff approve, order and record delivery with an actual supplier reference. A request is not a purchase order."
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
                        Site engineer / project manager: request materials
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
                {open && (manager || role === 'watchman') && (
                  <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                    <h3 className="text-sm font-bold text-slate-900">
                      Watchman curing photo evidence
                    </h3>
                    <p className="my-2 text-xs leading-5 text-slate-600">
                      Record a curing round above first, then upload a site
                      photo with its time and location. Photos remain private to
                      this project. Watchmen cannot upload unrelated site or
                      contract files.
                    </p>
                    <ProjectSiteMediaForm project={id} phase="curing" />
                  </div>
                )}
                {site.media.some(
                  (item) => value(item, 'category') === 'curing',
                ) && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {site.media
                      .filter((item) => value(item, 'category') === 'curing')
                      .slice(0, 8)
                      .map((item) => (
                        <a
                          key={item.id}
                          href={`/dashboard/projects/${id}/site/media/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                        >
                          <span className="block truncate p-3 text-xs font-semibold">
                            {value(item, 'caption') || 'Curing photo'}
                          </span>
                          <span className="block px-3 pb-3 text-xs text-blue-700">
                            View private photo ↗
                          </span>
                        </a>
                      ))}
                  </div>
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


          </div>
        </main>
        <OwnerMobileNav
          currentHref="/dashboard/projects"
          navigation={[
            {label:'Dashboard',href:'/dashboard',icon:'dashboard'},
            {label:'Projects',href:'/dashboard/projects',icon:'projects'},
            ...(has('invoice.view','billing')
              ? [{label:'Finance',href:'/dashboard/finance',icon:'billing' as const}] : []),
            ...(has('team.view')
              ? [{label:'Team',href:'/dashboard/company/team',icon:'team' as const}] : []),
            ...(has('organization.view')
              ? [{label:'Settings',href:'/dashboard/settings',icon:'settings' as const}] : []),
          ]}
        />

      </OwnerShell>
    </div>
  );
}
