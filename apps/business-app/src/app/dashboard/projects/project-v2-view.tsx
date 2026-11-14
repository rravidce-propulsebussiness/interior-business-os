import Link from 'next/link';
import Image from 'next/image';
import { OwnerIcon, type OwnerIconName, OwnerShell } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { OwnerMobileNav } from '../owner-mobile-nav';
import { OwnerProjectRequests } from '../../project-request-widgets';
import { canAccess } from '@business-os/auth';
import { guidanceForConstructionStage } from '@business-os/core/construction-payment-schedule';
import {
  ProjectStageLinker,
  type StageLinkOption,
} from './project-stage-linker';
import {
  suggestedStageMaterials,
  suggestedActivityMaterials,
} from './stage-material-options';
import { MaterialMarketplaceOrder } from './project-material-marketplace-order';
import {
  MaterialOrderingAccess,
  MaterialDeliveryActions,
} from './project-material-delivery';
import { StageChecklistItem } from './project-stage-checklist-item';
import { ProjectItemSchedule } from './project-item-schedule';
import { forecastWork } from './project-work-forecast';
import { BulkStageChecks } from './project-stage-bulk-checks';
import { StageOnsiteQcReview } from './project-onsite-qc-review';
import { ProjectStageReviewActions } from './project-stage-review-actions';
import { RccDailyPlan, RccSubstageGroups } from './project-rcc-substage-groups';
import { ProjectQuotationLinker } from './project-quotation-linker';
import { ProjectFlow } from './project-flow-view';
import {
  flowRole,
  measurementPrompts,
  projectWorkItems,
  stageLabel,
} from './project-flow';
import { WorkItemCard, type WorkItemView } from './project-work-item-card';
import { StageActivationControl } from './project-stage-activation';
import { ProjectClientAccess } from './project-client-access';
import { ProjectSiteSurvey, ProjectAdvanceAction } from './project-next-forms';
import { effectiveProjectStageStatus } from './project-stage-status';
import { projectTimelineStages } from './project-visible-stages';
import { stagePlanPreview } from './project-stage-schedule-preview';
import { MasterForm } from '../commercial/master-form';
import { activeOrganization } from '@business-os/auth/server';
import {
  projectWorkspace,
  formatMoney,
  pretty,
  shortDate,
  stringValue,
  type WorkspaceData,
  type SiteRow,
} from './project-v2-data';
import {
  SiteReportForm,
  SiteMediaForm,
  MaterialRequestForm,
  MaterialUpdateForm,
  DirectSupplierCashPaymentForm,
  QualityForm,
  ReviewCheck,
  GateForm,
  AssignRole,
  SyncStages,
  ProjectLifecycle,
  PrepareAgreement,
  SignedAgreementUploadForm,
  ProjectContractActivation,
  SkipAgreementUpload,
} from './project-v2-forms';
import '../owner-dashboard.css';
import './project-v2.css';
import './project-daily-command.css';
import './project-stage-review-actions.css';
import './project-rcc-substage-groups.css';

/** Milestones is the single project workflow. Older timeline and overview
 * addresses remain valid aliases, not separate project sections. */
export const projectPages = [
  {
    slug: 'milestones',
    title: 'Milestones',
    icon: 'calendar' as OwnerIconName,
    tab: true,
  },
  {
    slug: 'timeline',
    title: 'Milestones',
    icon: 'check' as OwnerIconName,
    tab: false,
  },
  {
    slug: 'procurement',
    title: 'Materials',
    icon: 'purchases' as OwnerIconName,
    tab: true,
  },
  {
    slug: 'designs',
    title: 'Designs',
    icon: 'quotations' as OwnerIconName,
    tab: true,
  },
  {
    slug: 'documents',
    title: 'Agreement',
    icon: 'quotations' as OwnerIconName,
    tab: true,
  },
  {
    slug: 'payments',
    title: 'Payments & Expenses',
    icon: 'billing' as OwnerIconName,
    tab: true,
  },
  { slug: 'labour', title: 'Labour', icon: 'team' as OwnerIconName, tab: true },
  {
    slug: 'execution',
    title: 'Site reports',
    icon: 'reports' as OwnerIconName,
    tab: true,
  },
  { slug: 'team', title: 'Team', icon: 'team' as OwnerIconName, tab: true },
  {
    slug: 'overview',
    title: 'Milestones',
    icon: 'calendar' as OwnerIconName,
    tab: false,
  },
  {
    slug: 'checks',
    title: 'Checks',
    icon: 'check' as OwnerIconName,
    tab: false,
  },
] as const;
export type ProjectPageSlug = (typeof projectPages)[number]['slug'];
const cur = (id: string, view: string) =>
  '/dashboard/projects/' +
  id +
  (['overview', 'timeline', 'milestones'].includes(view) ? '' : '/' + view);
function Status({ value }: { value: string }) {
  return (
    <span
      className={
        'pv2-status ' +
        (value === 'delayed'
          ? 'delayed'
          : [
                'active',
                'ongoing',
                'paid',
                'passed',
                'approved',
                'received',
                'completed',
                'signed',
              ].includes(value)
            ? 'good'
            : [
                  'pending',
                  'in_progress',
                  'requested',
                  'submitted',
                  'ordered',
                ].includes(value)
              ? 'warn'
              : 'neutral')
      }
    >
      {value === 'delayed' ? 'Delayed' : pretty(value) || 'Not recorded'}
    </span>
  );
}
function Title({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="pv2-section-header">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </header>
  );
}
function Blank({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="pv2-blank">
      <OwnerIcon name="projects" size={28} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
function DataTable({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="pv2-table-scroll">
      <table className="pv2-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function NextLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="pv2-action-link" href={href}>
      {label} <OwnerIcon name="arrow" size={14} />
    </Link>
  );
}
function PhotoStrip({
  projectId,
  rows,
}: {
  projectId: string;
  rows: SiteRow[];
}) {
  const media = rows
    .filter((row) => stringValue(row.mime).startsWith('image/'))
    .slice(0, 4);
  if (!media.length) return null;
  return (
    <div className="pv2-photo-strip">
      {media.map((m) => (
        <a
          key={m.id}
          href={'/dashboard/projects/' + projectId + '/site/media/' + m.id}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={stringValue(m.caption) || 'View photo'}
        >
          <Image
            unoptimized
            src={'/dashboard/projects/' + projectId + '/site/media/' + m.id}
            width={152}
            height={92}
            alt={stringValue(m.caption) || 'Project site photo'}
          />
        </a>
      ))}
    </div>
  );
}
function FieldDate({ value }: { value: unknown }) {
  return <time>{shortDate(value)}</time>;
}
function LinkTabs({
  data,
  active,
}: {
  data: WorkspaceData;
  active: ProjectPageSlug;
}) {
  const id = data.project.id;
  // Watchmen work only on their curing and security screen.
  if (viewerRole(data) === 'watchman') return null;
  const current =
    active === 'overview' || active === 'timeline' || active === 'checks'
      ? 'milestones'
      : active;
  const tabs = projectPages.filter(
    (item) =>
      item.tab && (item.slug !== 'payments' || data.permissions.payments),
  );
  return (
    <nav
      className="pv2-project-tabs pv2-premium-tabs pv2-flow-tabs"
      aria-label="Project sections"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.slug}
          href={cur(id, tab.slug)}
          aria-current={current === tab.slug ? 'page' : undefined}
          className={
            (current === tab.slug ? 'selected ' : '') +
            (tab.slug === 'milestones' ? 'pv2-tab-main' : '')
          }
        >
          <OwnerIcon name={tab.icon} size={16} />
          {tab.title}
        </Link>
      ))}
    </nav>
  );
}
function ProjectHeader({
  data,
  active,
}: {
  data: WorkspaceData;
  active: ProjectPageSlug;
}) {
  const p = data.project;
  // The header reflects the exact physical work/checklist in the project, not
  // an unrelated task counter or a paid milestone. No stage/QC is auto-passed.
  const realWork = forecastWork(
    projectTimelineStages(data.stages),
    [],
    data.stageProgress.work,
    '',
  );
  const usesWork =
    realWork.total > 0 &&
    (data.site?.stage === 'execution' || realWork.completed > 0);
  const displayedProgress = usesWork ? realWork.progressPct : p.progress;
  return (
    <div className="pv2-project-header">
      <div className="pv2-project-identity">
        <div className="pv2-project-thumb">
          {data.site?.media.find((row) =>
            stringValue(row.mime).startsWith('image/'),
          ) ? (
            <Image
              unoptimized
              width={95}
              height={65}
              alt="Project site"
              src={
                '/dashboard/projects/' +
                p.id +
                '/site/media/' +
                data.site.media.find((row) =>
                  stringValue(row.mime).startsWith('image/'),
                )!.id
              }
            />
          ) : (
            <OwnerIcon name="projects" size={27} />
          )}
        </div>
        <div>
          <h1>{p.name}</h1>
          <div className="pv2-project-meta">
            <span>
              <OwnerIcon name="quotations" size={13} />
              {p.code || 'Project'}
            </span>
            <span>
              <OwnerIcon name="projects" size={13} />
              {p.industry}
            </span>
            <span>
              <OwnerIcon name="globe" size={13} />
              {p.address}
            </span>
          </div>
        </div>
        <Status value={p.status} />
      </div>
      {displayedProgress !== null && (
        <div className="pv2-header-progress">
          <span>
            {usesWork ? 'Recorded physical work' : 'Operations task progress'}{' '}
            <strong>{displayedProgress}%</strong>
          </span>
          <div className="pv2-bar">
            <span style={{ width: displayedProgress + '%' }} />
          </div>
        </div>
      )}
      <div className="pv2-project-header-actions">
        {data.permissions.manage && data.projectRaw && (
          <details className="pv2-header-drawer">
            <summary className="pv2-button pv2-outline">✎ Edit project</summary>
            <div className="pv2-header-drawer-body">
              <MasterForm
                entity="projects"
                title="Save project"
                initial={data.projectRaw}
                fields={[
                  { key: 'name', label: 'Project name', required: true },
                  { key: 'site_address.line1', label: 'Site address' },
                  { key: 'site_address.city', label: 'City' },
                  { key: 'site_address.region', label: 'State' },
                  {
                    key: 'notes',
                    label: 'Internal notes',
                    type: 'textarea' as const,
                  },
                ]}
              />
            </div>
          </details>
        )}
        {p.customerId && (
          <details className="pv2-header-drawer">
            <summary className="pv2-button pv2-outline">
              Share with client
            </summary>
            <div className="pv2-header-drawer-body">
              <ProjectClientAccess projectId={p.id} customerId={p.customerId} />
            </div>
          </details>
        )}
      </div>
      <LinkTabs data={data} active={active} />
    </div>
  );
}
function ProjectStageWorkflow({ d, code }: { d: WorkspaceData; code: string }) {
  const hasPrecon = d.stages.some((x) => x.template_code === 'PRECONSTRUCTION');
  const agreementStep =
    code === 'PRECONSTRUCTION' || (code === 'SITE_SURVEY' && !hasPrecon);
  const surveyStep = code === 'PRECONSTRUCTION' || code === 'SITE_SURVEY';
  const designStep = code === 'DESIGN' || code === 'DESIGN_APPROVAL';
  if (!agreementStep && !surveyStep && !designStep) return null;
  const signed =
    d.agreement?.clearanceType === 'signed_copy_recorded' ||
    d.preflight?.signedReady === true;
  const agreementCleared =
    signed || d.agreement?.clearanceType === 'owner_exception';
  const quote = d.quotations[0];
  // The signed contract is the agreed scope; later quote alternatives are history.
  const sameRevision =
    signed ||
    !d.agreement?.revisionId ||
    !quote ||
    d.agreement.revisionId === quote.revisionId;
  const inspection = d.preflight?.inspectionDone === true;
  const measured = d.preflight?.measurementsDone === true;
  const canSurvey =
    d.permissions.manage ||
    ['manager', 'site_engineer'].includes(d.site?.role ?? '');
  const pdfs = (d.site?.media ?? []).filter(
    (x) => x.category === 'agreement' && x.mime === 'application/pdf',
  );
  const invoice = d.advance;
  const due = invoice?.invoiceId
    ? Math.max(0, invoice.invoiceTotal - invoice.received)
    : null;
  const paid = Boolean(
    invoice?.invoiceId && invoice.invoiceTotal > 0 && due === 0,
  );
  const defaultPercent =
    d.quotePaymentTriggers.find((x) => /advance|booking/i.test(x.name))
      ?.percent ?? 10;
  // The database is authoritative for clearance; guide the user to just one
  // required finance action at a time, rather than sending them backward.
  const contractHref = cur(d.project.id, 'documents') + '#project-agreement';
  const readinessStep = !d.agreement
    ? {
        title: 'Prepare the contract',
        detail: 'A contract is required before work can start.',
        href: cur(d.project.id, 'documents'),
        action: 'Review quotation & agreement',
      }
    : !sameRevision
      ? {
          title: 'Confirm quotation scope',
          detail:
            'The project contract refers to a different quotation revision. Review the linked Final quotation before choosing agreement handling.',
          href: contractHref,
          action: 'Open project agreement',
        }
      : !agreementCleared
        ? {
            title: 'Record agreement choice',
            detail:
              'Upload the offline signed copy or have the owner record that the final quotation will be used without a separate agreement upload.',
            href: cur(d.project.id, 'timeline'),
            action: 'Choose agreement option',
          }
        : d.agreement.status !== 'active'
          ? {
              title: 'Activate the project contract',
              detail: signed
                ? 'Signed agreement recorded. Activate its existing contract.'
                : 'Owner-recorded offline homeowner approval saved. Activate the quote-based project contract.',
              href: contractHref,
              action: signed
                ? 'Activate signed contract'
                : 'Activate quote-based project',
            }
          : !d.advance?.scheduleActive
            ? d.quotePaymentTriggers.length > 0
              ? {
                  title: 'Sync agreed payment milestones',
                  detail:
                    'The stage-wise payment plan is already saved in the Final quotation. It is imported automatically; refresh the project to confirm its activation.',
                  href: cur(d.project.id, 'payments'),
                  action: 'View agreed payment milestones',
                }
              : {
                  title: 'Confirm contract payment terms',
                  detail:
                    'No valid stage-wise payment plan was found in the Final quotation. Confirm the agreed terms before physical work.',
                  href: contractHref,
                  action: 'View agreement terms',
                }
            : d.quotePaymentTriggers.some((x) =>
                  /advance|booking/i.test(x.name),
                ) && !d.advance?.received
              ? {
                  title: 'Record advance actually received',
                  detail:
                    'The advance invoice is issued, but no payment has been verified. Record a receipt only after receiving funds.',
                  href:
                    '/dashboard/finance?tab=payments&contract_id=' +
                    d.agreement.contractId,
                  action: 'Open Finance payments',
                }
              : !d.agreement.authorized
                ? {
                    title: 'Confirm site-start clearance',
                    detail:
                      'Verify the current agreement choice and required payment records before physical construction.',
                    href: contractHref,
                    action: 'View project agreement',
                  }
                : null;
  return (
    <div className="pv2-stage-workflow">
      {agreementStep && (
        <>
          <h3>Final quotation & agreement</h3>
          {!d.agreement ? (
            <>
              <p className="pv2-muted">
                The final quotation defines this project’s scope and payment
                groups. Prepare the project contract once; the owner can upload
                an offline signed agreement or record that no separate upload
                will be used.
              </p>
              {quote?.status === 'issued' &&
                d.permissions.manage &&
                d.permissions.finance && (
                  <PrepareAgreement
                    projectId={d.project.id}
                    revisionId={quote.revisionId}
                  />
                )}
              {(!quote || quote.status !== 'issued') && (
                <p className="pv2-muted">
                  Issue the final quotation before preparing the agreement.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="pv2-stage-workflow-status">
                <strong>{d.agreement.contractNumber}</strong>
                <Status
                  value={
                    signed
                      ? 'signed'
                      : d.agreement.clearanceType === 'owner_exception'
                        ? 'owner-recorded offline approval'
                        : d.agreement.status || 'pending'
                  }
                />
              </div>
              {d.permissions.finance && (
                <NextLink href={contractHref} label="View agreement record" />
              )}
              {agreementCleared &&
                d.agreement.status === 'pending' &&
                d.permissions.contractManage &&
                typeof d.agreement.version === 'number' && (
                  <ProjectContractActivation
                    contractId={d.agreement.contractId}
                    version={d.agreement.version}
                    offlineAgreement={!signed}
                  />
                )}

              {!sameRevision && (
                <p role="alert" className="pv2-form-feedback bad">
                  This agreement belongs to an earlier Final quotation. Check
                  the linked revision before proceeding.
                </p>
              )}
              {!signed &&
                sameRevision &&
                d.site?.canManage &&
                d.permissions.finance && (
                  <details className="pv2-edit-drawer">
                    <summary>Upload or record signed agreement</summary>
                    <SignedAgreementUploadForm
                      projectId={d.project.id}
                      contractId={d.agreement.contractId}
                      media={pdfs.map((x) => ({
                        id: x.id,
                        name: stringValue(x.filename),
                      }))}
                    />
                  </details>
                )}
              {!signed &&
                sameRevision &&
                d.agreement.canAuthorizeException &&
                d.agreement.clearanceType !== 'owner_exception' && (
                  <details className="pv2-edit-drawer">
                    <summary>
                      Use Final quotation without agreement upload
                    </summary>
                    <SkipAgreementUpload
                      projectId={d.project.id}
                      contractId={d.agreement.contractId}
                    />
                  </details>
                )}
              {d.agreement.clearanceType === 'owner_exception' && (
                <p className="pv2-hint">
                  Owner-recorded offline homeowner approval: the Final quotation
                  is the agreed scope. No separate signed upload or digital
                  signature was used.
                </p>
              )}
              {signed && (
                <p className="pv2-form-feedback good">
                  Signed agreement recorded. No repeat approval or upload is
                  required.
                </p>
              )}
              {agreementCleared && invoice !== null && (
                <div className="pv2-stage-workflow-payment">
                  {d.quotePaymentTriggers.some((x) =>
                    /advance|booking/i.test(x.name),
                  ) ? (
                    <>
                      <strong>
                        Quoted advance — required before site execution
                      </strong>
                      <p>
                        {invoice.invoiceId
                          ? formatMoney(invoice.received) +
                            ' received · ' +
                            formatMoney(due) +
                            ' pending'
                          : 'Advance invoice not yet requested'}
                      </p>
                      <Status
                        value={
                          paid ? 'paid' : invoice.invoiceStatus || 'pending'
                        }
                      />
                      {!invoice.invoiceId &&
                        d.permissions.finance &&
                        d.permissions.manage && (
                          <details className="pv2-edit-drawer">
                            <summary>Issue advance proforma</summary>
                            <ProjectAdvanceAction
                              projectId={d.project.id}
                              defaultPercent={defaultPercent}
                            />
                          </details>
                        )}
                      {invoice.invoiceId && d.permissions.finance && (
                        <NextLink
                          href={
                            '/dashboard/finance?tab=invoices' +
                            (invoice.invoiceNumber
                              ? '&q=' +
                                encodeURIComponent(invoice.invoiceNumber)
                              : '')
                          }
                          label="View advance in Finance"
                        />
                      )}
                      {!invoice.scheduleActive && (
                        <p className="pv2-hint">
                          Payment stages come from the Final quotation; no
                          second payment schedule should be entered. A verified
                          advance is required before physical construction.
                        </p>
                      )}
                      {invoice.scheduleActive && (
                        <p className="pv2-hint">
                          Agreed quotation milestones are active. Payments
                          remain unpaid until actual receipts are recorded.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="pv2-hint">
                      No separate advance is defined in the Final quotation. Its
                      grouped payment milestones remain unchanged and are
                      managed in Finance.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {d.site?.stage === 'not_started' &&
            d.agreement?.authorized === true &&
            agreementCleared &&
            sameRevision &&
            d.site.canManage && (
              <ProjectLifecycle
                id={d.project.id}
                stage="not_started"
                canManage
                agreementCleared={agreementCleared}
                industry={d.project.industry}
                designs={[]}
              />
            )}
        </>
      )}
      {surveyStep && agreementCleared && (
        <div className="pv2-stage-workflow-survey">
          <h3>Site inspection & measurements</h3>
          <div className="pv2-checklist-inline">
            <span className={inspection ? 'done' : 'waiting'}>
              {inspection ? '✓' : '○'} Site inspection
            </span>
            <span className={measured ? 'done' : 'waiting'}>
              {measured ? '✓' : '○'} Measurements
            </span>
          </div>
          {!inspection && canSurvey && (
            <details className="pv2-edit-drawer">
              <summary>Record site inspection</summary>
              <ProjectSiteSurvey
                projectId={d.project.id}
                kind="inspection"
                previous={d.preflight?.inspectionDetails}
              />
            </details>
          )}
          {inspection && !measured && canSurvey && (
            <details className="pv2-edit-drawer">
              <summary>Record site measurements</summary>
              <ProjectSiteSurvey
                projectId={d.project.id}
                kind="measurements"
                previous={d.preflight?.measurementDetails}
              />
            </details>
          )}
        </div>
      )}
      {designStep && d.site?.stage === 'client_approved' && (
        <div
          className="pv2-execution-readiness"
          aria-label="Site execution requirements"
        >
          <h3>Construction start readiness</h3>
          <div className="pv2-execution-readiness-grid">
            <span>
              Active contract{' '}
              <strong>
                {d.agreement?.status === 'active'
                  ? 'Ready'
                  : d.agreement
                    ? 'Pending activation'
                    : 'Not available'}
              </strong>
            </span>
            <span>
              Agreement choice{' '}
              <strong>
                {signed
                  ? 'Signed copy recorded'
                  : d.agreement?.clearanceType === 'owner_exception'
                    ? 'Owner confirmed offline homeowner approval'
                    : 'Not recorded'}
              </strong>
            </span>
            <span>
              Payment schedule{' '}
              <strong>
                {d.advance === null
                  ? 'Unavailable'
                  : d.advance.scheduleActive
                    ? 'Active'
                    : 'Not active'}
              </strong>
            </span>
            <span>
              Verified advance{' '}
              <strong>
                {d.advance === null
                  ? 'Unavailable'
                  : formatMoney(d.advance.received)}
              </strong>
            </span>
          </div>
          {d.agreement?.authorized ? (
            <p className="pv2-hint">
              Commercial and agreement clearance confirmed. Review site
              readiness and start execution below.
            </p>
          ) : (
            <div className="pv2-readiness-next" role="status">
              <strong>
                Next action:{' '}
                {readinessStep?.title ?? 'Confirm execution clearance'}
              </strong>
              <p>
                {readinessStep?.detail ??
                  'Confirm the project financial records before physical site work.'}
              </p>
              {readinessStep?.title === 'Activate the project contract' &&
              d.agreement &&
              agreementCleared &&
              d.permissions.contractManage &&
              typeof d.agreement.version === 'number' ? (
                <ProjectContractActivation
                  contractId={d.agreement.contractId}
                  version={d.agreement.version}
                  offlineAgreement={!signed}
                />
              ) : readinessStep && d.permissions.finance ? (
                <NextLink
                  href={readinessStep.href}
                  label={readinessStep.action}
                />
              ) : (
                <p className="pv2-hint">
                  Ask a company owner or finance manager to complete this step.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {designStep &&
        d.site &&
        ['design', 'client_approved'].includes(d.site.stage) && (
          <ProjectLifecycle
            id={d.project.id}
            stage={d.site.stage}
            canManage={d.site.canManage}
            agreementCleared={agreementCleared}
            industry={d.project.industry}
            executionReady={d.agreement?.authorized === true}
            designs={d.site.designs.map((x) => ({
              id: x.id,
              kind: stringValue(x.kind),
              status: stringValue(x.status),
            }))}
          />
        )}
    </div>
  );
}
/** The same canonical material controls are embedded in the work item that requested them.
 * Marketplace sourcing, owner approval, order and delivery remain unchanged.
 */
function MaterialSupplierCashSettlement({
  d,
  material,
}: {
  d: WorkspaceData;
  material: SiteRow;
}) {
  const m = material;
  const status = stringValue(m.status);
  return (
    <>
      {stringValue(m.homeowner_paid_amount) && (
        <p className="pv2-hint pv2-material-homeowner-paid">
          Homeowner paid supplier directly · cash ·{' '}
          {formatMoney(Number(m.homeowner_paid_amount))}
          {stringValue(m.homeowner_paid_to)
            ? ' · ' + stringValue(m.homeowner_paid_to)
            : ''}
          {stringValue(m.homeowner_paid_date)
            ? ' · ' + shortDate(m.homeowner_paid_date)
            : ''}
        </p>
      )}
      {['ordered', 'received'].includes(status) &&
        !stringValue(m.homeowner_paid_amount) &&
        d.materialAccess.canOrder && (
          <DirectSupplierCashPaymentForm id={d.project.id} materialId={m.id} />
        )}
    </>
  );
}
function StageMaterialRows({ d, rows }: { d: WorkspaceData; rows: SiteRow[] }) {
  const site = d.site;
  return (
    <>
      {!!rows.length && (
        <div className="pv2-stage-material-requests">
          <strong>Stage material requests</strong>
          {rows.map((m) => {
            const source = stringValue(m.source),
              status = stringValue(m.status);
            return (
              <article key={m.id} className="pv2-stage-material-row">
                <div>
                  <b>{stringValue(m.item)}</b>
                  <small>
                    {stringValue(m.quantity)} {stringValue(m.unit)}
                  </small>
                </div>
                <Status value={status} />
                <MaterialSupplierCashSettlement d={d} material={m} />
                {(site?.canManage ||
                  ['manager', 'procurement'].includes(site?.role ?? '')) &&
                  !(
                    source === 'marketplace' &&
                    stringValue(m.vendor_reference).startsWith(
                      'Marketplace request ',
                    ) &&
                    !stringValue(m.vendor_reference).startsWith(
                      'Marketplace request rejected ',
                    ) &&
                    status === 'approved'
                  ) &&
                  ['requested', 'approved', 'ordered'].includes(status) && (
                    <MaterialUpdateForm
                      id={d.project.id}
                      material={{
                        id: m.id,
                        status,
                        source,
                        vendorReference: stringValue(m.vendor_reference),
                      }}
                    />
                  )}

                <MaterialDeliveryActions
                  projectId={d.project.id}
                  material={{
                    id: m.id,
                    status,
                    source,
                    reference: stringValue(m.vendor_reference),
                    date: stringValue(m.expected_delivery_date) || null,
                    window: stringValue(m.expected_delivery_window) || null,
                  }}
                  canOrder={d.materialAccess.canOrder}
                  canReceive={
                    site?.canManage === true ||
                    ['site_engineer', 'manager', 'procurement'].includes(
                      site?.role ?? '',
                    )
                  }
                />
                {(status === 'ordered' || status === 'received') && (
                  <p className="pv2-hint pv2-material-eta">
                    {status === 'received'
                      ? 'Received at site'
                      : stringValue(m.expected_delivery_date)
                        ? 'Expected ' +
                          shortDate(m.expected_delivery_date) +
                          (stringValue(m.expected_delivery_window)
                            ? ' · ' + stringValue(m.expected_delivery_window)
                            : '')
                        : 'Ordered · delivery date not yet set'}
                  </p>
                )}
                {d.permissions.purchaseManage && d.materialAccess.canOrder && (
                  <MaterialMarketplaceOrder
                    projectId={d.project.id}
                    material={{
                      id: m.id,
                      item: stringValue(m.item),
                      quantity: Number(m.quantity),
                      unit: stringValue(m.unit),
                      status,
                      source,
                      vendorReference: stringValue(m.vendor_reference),
                    }}
                    offers={d.marketplaceOffers}
                  />
                )}
                {['approved', 'requested', 'ordered', 'received'].includes(
                  status,
                ) && (
                  <p className="pv2-hint">
                    {status === 'requested'
                      ? 'Awaiting owner/procurement approval'
                      : status === 'approved'
                        ? 'Approved for sourcing'
                        : status === 'ordered'
                          ? 'Supplier order placed; delivery must still be verified'
                          : 'Marked received by site staff'}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
type Activity = {
  id: string;
  date: string;
  title: string;
  kind: string;
  description: string;
  media?: SiteRow;
};
function timeline(d: WorkspaceData): Activity[] {
  const site = d.site,
    all: Activity[] = [];
  for (const row of site?.reports ?? [])
    all.push({
      id: row.id,
      title: 'Daily work update',
      kind: 'execution',
      date: stringValue(row.report_date),
      description: stringValue(row.completed_work),
    });
  for (const row of site?.materials ?? [])
    all.push({
      id: row.id,
      title: 'Material: ' + stringValue(row.item),
      kind: 'material',
      date: stringValue(row.created_at),
      description:
        stringValue(row.quantity) +
        ' ' +
        stringValue(row.unit) +
        ' · ' +
        pretty(row.status),
    });
  for (const row of site?.checks ?? [])
    all.push({
      id: row.id,
      title: 'Quality check: ' + stringValue(row.title),
      kind: 'check',
      date: stringValue(row.created_at),
      description: pretty(row.status),
    });
  for (const row of site?.media ?? [])
    all.push({
      id: row.id,
      title: 'Site file: ' + stringValue(row.filename),
      kind: 'media',
      date: stringValue(row.created_at),
      description: stringValue(row.caption),
      media: row,
    });
  for (const row of site?.gate ?? [])
    all.push({
      id: row.id,
      title: pretty(row.kind),
      kind: 'gate',
      date: stringValue(row.created_at),
      description: stringValue(row.description),
    });
  return all.sort((a, b) => b.date.localeCompare(a.date));
}
const viewerRole = (d: WorkspaceData) =>
  flowRole({
    canManage: d.site?.canManage === true,
    siteRole: d.site?.role ?? '',
    qcReviewer: d.stageQc.canReview && !d.site?.canManage,
  });
/** The primary project screen: one role-first flow on top of the same records.
 * Stage-level planning, agreement steps and records stay one tap below. */
function Milestones({ d }: { d: WorkspaceData }) {
  return <ProjectFlow d={d} milestoneMode />;
}
function Documents({ d }: { d: WorkspaceData }) {
  const canSeeCommercial = d.permissions.quotation || d.permissions.finance;
  const photos = d.site?.media ?? [],
    agreement = photos.filter((r) => stringValue(r.category) === 'agreement');
  const signedRecorded = d.agreement?.clearanceType === 'signed_copy_recorded';
  const ownerQuoteChoice = d.agreement?.clearanceType === 'owner_exception';
  const plans = photos.filter((r) =>
    ['plan', 'design'].includes(stringValue(r.category)),
  );
  const other = photos.filter(
    (r) => !['agreement', 'plan', 'design'].includes(stringValue(r.category)),
  );
  const group = (title: string, list: SiteRow[]) => (
    <section className="pv2-panel" key={title}>
      <Title
        title={title}
        detail={
          title === 'Agreement'
            ? 'Signed project contract and supporting PDFs'
            : title === 'Plans & Drawings'
              ? 'Approved drawings and revisions'
              : 'Photographs and attached project documents'
        }
      />
      {list.length ? (
        <div className="pv2-file-list">
          {list.map((row) => (
            <a
              key={row.id}
              href={
                '/dashboard/projects/' + d.project.id + '/site/media/' + row.id
              }
              className="pv2-file"
            >
              <span className="pv2-file-icon">
                <OwnerIcon name="quotations" size={23} />
              </span>
              <span>
                <strong>{stringValue(row.filename)}</strong>
                <small>
                  {shortDate(row.created_at)} ·{' '}
                  {stringValue(row.caption) || pretty(row.category)}
                </small>
              </span>
              <b>View / Download</b>
            </a>
          ))}
        </div>
      ) : (
        <Blank
          title="No files in this category"
          detail="Evidence uploaded through project milestones appears here."
        />
      )}
    </section>
  );
  return (
    <div className="pv2-content">
      {canSeeCommercial && (
        <>
          <section className="pv2-section-intro">
            <h2>Quotation & Agreement</h2>
            <p>
              Approved quotation and signed-contract archive. Continue tasks in
              the project milestones.
            </p>
          </section>
          <section className="pv2-panel pv2-quote-links">
            <Title
              title="Final Quotation"
              detail="The quotation linked to this project's agreed scope."
            />
            {d.quotations.length ? (
              <div className="pv2-file-list">
                {d.quotations.map((q) => (
                  <div className="pv2-commercial-row" key={q.id}>
                    <div className="pv2-commercial-details">
                      <strong>{q.number}</strong>
                      <span>
                        <Status
                          value={q.status === 'draft' ? 'Saved' : q.status}
                        />
                        <small>{shortDate(q.createdAt)}</small>
                      </span>
                    </div>
                    <div className="pv2-commercial-actions">
                      <NextLink
                        href={
                          '/dashboard/quotations/' + q.revisionId + '/preview'
                        }
                        label="Preview PDF"
                      />
                      <NextLink
                        href={
                          '/dashboard/quotations/' +
                          q.revisionId +
                          '/studio?step=quote'
                        }
                        label={
                          q.status === 'draft'
                            ? 'Edit saved quote'
                            : 'Quote & payment plan'
                        }
                      />
                    </div>
                    {q.status === 'draft' && (
                      <p className="pv2-muted">
                        Saved and editable. Sharing/finalizing this quotation
                        locks the agreed version before preparing an agreement;
                        no separate client approval is needed.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Blank
                title="No saved final quotation found"
                detail="No active quotation was found for this project or its converted Won lead."
                action={
                  d.permissions.quotation ? (
                    <NextLink
                      href="/dashboard/quotations"
                      label="Open Quotations"
                    />
                  ) : undefined
                }
              />
            )}
            {d.permissions.linkQuotation && d.linkableQuotations.length > 0 && (
              <ProjectQuotationLinker
                projectId={d.project.id}
                quotes={d.linkableQuotations}
              />
            )}
            {d.permissions.quotation && (
              <details className="pv2-secondary-more">
                <summary>Quotation history / change Final</summary>
                <NextLink
                  href="/dashboard/quotations"
                  label="Manage quotation history"
                />
              </details>
            )}
          </section>
          <section
            className="pv2-panel pv2-agreement-status"
            id="project-agreement"
          >
            <Title
              title="Agreement"
              detail="Recorded contract and signed-document history"
            />
            {d.agreement ? (
              <div>
                <div className="pv2-between">
                  <strong>{d.agreement.contractNumber}</strong>
                  <Status
                    value={
                      signedRecorded
                        ? 'signed'
                        : ownerQuoteChoice
                          ? 'owner-recorded offline approval'
                          : d.agreement.authorized
                            ? 'approved'
                            : d.agreement.status || 'pending'
                    }
                  />
                </div>
                {!signedRecorded &&
                d.quotations[0] &&
                d.agreement.revisionId &&
                d.quotations[0].revisionId !== d.agreement.revisionId ? (
                  <p role="alert" className="pv2-form-feedback bad">
                    The unsigned agreement references a different quotation.
                    Confirm the agreed version before signing.
                  </p>
                ) : (
                  <p className="pv2-muted">
                    The project scope and payment groups come from this saved
                    quotation. The owner can record its offline signed copy or
                    choose to proceed without a separate upload.
                  </p>
                )}
                {signedRecorded && (
                  <p className="pv2-muted">
                    The signed agreement fixes the agreed quotation for this
                    project. New alternatives stay in quotation history; changed
                    signed scope requires a formal change order.
                  </p>
                )}
                {ownerQuoteChoice && (
                  <p className="pv2-muted">
                    The owner recorded that the homeowner approved the Final
                    quotation offline. A separate signed agreement upload or
                    digital signature is not required.
                  </p>
                )}
                {signedRecorded &&
                  d.agreement.status === 'pending' &&
                  d.permissions.contractManage &&
                  typeof d.agreement.version === 'number' && (
                    <ProjectContractActivation
                      contractId={d.agreement.contractId}
                      version={d.agreement.version}
                    />
                  )}

                {signedRecorded && (
                  <p className="pv2-form-feedback good">
                    Signed agreement recorded. No second upload or confirmation
                    is needed.
                  </p>
                )}
                {agreement.length > 0 && (
                  <div className="pv2-file-list" aria-label="Agreement PDFs">
                    {agreement.map((row) => (
                      <a
                        key={row.id}
                        className="pv2-file"
                        href={
                          '/dashboard/projects/' +
                          d.project.id +
                          '/site/media/' +
                          row.id
                        }
                      >
                        <span className="pv2-file-icon">
                          <OwnerIcon name="quotations" size={23} />
                        </span>
                        <span>
                          <strong>{stringValue(row.filename)}</strong>
                          <small>{shortDate(row.created_at)}</small>
                        </span>
                        <b>View / Download</b>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="pv2-muted">
                Prepare an agreement from the issued final quotation before
                uploading or recording a signed copy.
              </p>
            )}
          </section>
        </>
      )}
      <div className="pv2-section-intro">
        <h2>Project Documents</h2>
        <p>Approved drawings, site photos and supporting records.</p>
      </div>
      {!canSeeCommercial && group('Agreement', agreement)}
      {group('Plans & Drawings', plans)}
      {group('Site Photos & Documents', other)}
    </div>
  );
}
function Payments({ d }: { d: WorkspaceData }) {
  if (!d.permissions.payments)
    return (
      <Blank
        title="Finance permission required"
        detail="Only authorized finance users can view client receipts."
      />
    );
  const paymentRows = d.transactions;
  const total =
    paymentRows
      ?.filter((x) => x.status === 'recorded')
      .reduce((sum, x) => sum + x.amount, 0) ?? null;
  return (
    <div className="pv2-content">
      <section className="pv2-stat-grid pv2-finance-metrics">
        <article className="pv2-stat">
          <small>Contract Value</small>
          <strong>{formatMoney(d.contractValue)}</strong>
        </article>
        <article className="pv2-stat">
          <small>Received</small>
          <strong>{formatMoney(total)}</strong>
        </article>
        <article className="pv2-stat">
          <small>Pending</small>
          <strong>
            {formatMoney(
              d.contractValue !== null && total !== null
                ? Math.max(0, d.contractValue - total)
                : null,
            )}
          </strong>
        </article>
      </section>
      <section className="pv2-panel">
        <Title
          title="Payment Schedule"
          detail="Milestones from active contract schedules. Requests are not receipts."
          action={
            <NextLink
              href={
                '/dashboard/finance?tab=payments' +
                (d.agreement ? '&contract_id=' + d.agreement.contractId : '')
              }
              label="Finance payments"
            />
          }
        />
        {d.milestones.length ? (
          <DataTable head={['Milestone', 'Amount', 'Contract', 'Actions']}>
            {d.milestones.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.label}</strong>
                </td>
                <td>
                  {m.currency} {m.amount}
                </td>
                <td>{m.contract_number}</td>
                <td>
                  <NextLink
                    href={
                      '/dashboard/finance?tab=payments&contract_id=' +
                      m.contract_id
                    }
                    label="Finance ledger"
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No payment milestones"
            detail="Payment stages are copied from the signed quotation when the contract is activated."
          />
        )}
      </section>
      {!!d.quotePaymentTriggers.length && (
        <section className="pv2-panel">
          <Title
            title="Quoted Work-Linked Payments"
            detail="Quoted payment proposal; actual contract requests and receipts remain in Finance."
          />
          <DataTable
            head={[
              'Quoted milestone',
              'Percentage',
              'Associated work',
              'Status',
            ]}
          >
            {d.quotePaymentTriggers.map((p, i) => (
              <tr key={i}>
                <td>
                  <strong>{p.name}</strong>
                </td>
                <td>{p.percent}%</td>
                <td>
                  {p.stageCodes.length
                    ? p.stageCodes
                        .map(
                          (key) =>
                            d.stages.find(
                              (stage) => stage.instance_code === key,
                            )?.title ?? key,
                        )
                        .join(' · ')
                    : 'Custom milestone'}
                </td>
                <td>
                  <span className="pv2-label">Not a receipt</span>
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      )}
      <section className="pv2-panel">
        <Title
          title="Stage payment requests"
          detail="Automatically created only when linked work passes independent quality certification. Requests do not confirm payment."
        />
        {d.stageRequests?.length ? (
          <DataTable head={['Request', 'Issued', 'Amount', 'Status', 'PDF']}>
            {d.stageRequests.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.number}</strong>
                </td>
                <td>
                  <FieldDate value={r.date} />
                </td>
                <td>{formatMoney(r.amount)}</td>
                <td>
                  <Status value={r.status} />
                </td>
                <td>
                  <NextLink
                    href={'/dashboard/finance/requests/' + r.id + '/pdf'}
                    label="Download request"
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No stage payment requests yet"
            detail="The system issues the first eligible request when all required linked stages are certified. No payment has been assumed."
          />
        )}
      </section>
      <section className="pv2-panel">
        <Title
          title="Client Payment Transactions"
          detail="Read-only mirror of recorded and voided receipts in Finance"
        />
        {paymentRows?.length ? (
          <DataTable head={['Receipt / Payment', 'Date', 'Amount', 'Status']}>
            {paymentRows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.number}</strong>
                </td>
                <td>
                  <FieldDate value={r.date} />
                </td>
                <td>{formatMoney(r.amount)}</td>
                <td>
                  <Status value={r.status} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No payments recorded"
            detail="Record and allocate payments through the existing Finance module."
          />
        )}
      </section>
    </div>
  );
}
function Procurement({ d }: { d: WorkspaceData }) {
  const site = d.site,
    materials = site?.materials ?? [];
  return (
    <div className="pv2-content">
      <section className="pv2-panel">
        <Title
          title="Procurement & Materials"
          detail="Requests, purchase orders and delivery statuses share one canonical register"
          action={
            <NextLink
              href="/dashboard/marketplace/orders"
              label="Purchase Orders"
            />
          }
        />
        <nav className="pv2-local-tabs">
          <span className="active">Requests ({materials.length})</span>
          <span>Purchase Orders ({d.purchaseOrders?.length ?? '—'})</span>
        </nav>
        {materials.length ? (
          <div className="pv2-material-list">
            {materials.map((m) => (
              <article className="pv2-material" key={m.id}>
                <span className="pv2-material-icon">
                  <OwnerIcon name="purchases" size={23} />
                </span>
                <div>
                  <strong>{stringValue(m.item)}</strong>
                  <small>
                    {stringValue(m.quantity)} {stringValue(m.unit)} ·{' '}
                    {shortDate(m.created_at)}
                  </small>
                  {Boolean(m.vendor_reference) && (
                    <small>
                      Supplier / order: {stringValue(m.vendor_reference)}
                    </small>
                  )}
                </div>
                <Status value={stringValue(m.status)} />
                <MaterialSupplierCashSettlement d={d} material={m} />
                {['ordered', 'received'].includes(stringValue(m.status)) && (
                  <small>
                    {stringValue(m.status) === 'received'
                      ? 'Received at site'
                      : 'Expected ' +
                        (stringValue(m.expected_delivery_date)
                          ? shortDate(m.expected_delivery_date)
                          : 'date not set') +
                        (stringValue(m.expected_delivery_window)
                          ? ' · ' + stringValue(m.expected_delivery_window)
                          : '')}
                  </small>
                )}
                <MaterialDeliveryActions
                  projectId={d.project.id}
                  material={{
                    id: m.id,
                    status: stringValue(m.status),
                    source: stringValue(m.source),
                    reference: stringValue(m.vendor_reference),
                    date: stringValue(m.expected_delivery_date) || null,
                    window: stringValue(m.expected_delivery_window) || null,
                  }}
                  canOrder={d.materialAccess.canOrder}
                  canReceive={
                    site?.canManage === true ||
                    ['site_engineer', 'manager', 'procurement'].includes(
                      site?.role ?? '',
                    )
                  }
                />
                {site?.stage === 'execution' &&
                  (site.canManage ||
                    ['manager', 'procurement'].includes(site.role ?? '')) && (
                    <MaterialUpdateForm
                      id={d.project.id}
                      material={{
                        id: m.id,
                        status: stringValue(m.status),
                        source: stringValue(m.source),
                        vendorReference: stringValue(m.vendor_reference),
                      }}
                    />
                  )}
              </article>
            ))}
          </div>
        ) : (
          <Blank
            title="No material requests"
            detail="Site engineers and procurement staff can add requests throughout the project."
          />
        )}
        {site?.stage === 'execution' &&
          (site.canManage ||
            ['manager', 'procurement', 'site_engineer'].includes(
              site.role ?? '',
            )) && (
            <details className="pv2-edit-drawer">
              <summary>＋ Request Material</summary>
              <MaterialRequestForm id={d.project.id} />
            </details>
          )}
      </section>
      <section className="pv2-panel">
        <Title
          title="Purchase Orders"
          detail="Orders come from the existing procurement engine, never from a duplicate form."
        />
        {d.purchaseOrders?.length ? (
          <DataTable head={['PO Number', 'Order Date', 'Status', 'Action']}>
            {d.purchaseOrders.map((po) => (
              <tr key={po.id}>
                <td>{po.number}</td>
                <td>
                  <FieldDate value={po.date} />
                </td>
                <td>
                  <Status value={po.status} />
                </td>
                <td>
                  <NextLink href="/dashboard/marketplace/orders" label="View" />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No purchase orders available"
            detail="Review requests, supplier decisions and actual orders in Procurement."
          />
        )}
      </section>
    </div>
  );
}
function Labour({ d }: { d: WorkspaceData }) {
  const reports = d.site?.reports ?? [];
  return (
    <div className="pv2-content">
      <section className="pv2-panel">
        <Title
          title="Labour & Site Attendance"
          detail="Daily workforce counts and field gate entries"
          action={
            <NextLink
              href={'/dashboard/billing/labour?project=' + d.project.id}
              label="Labour payments"
            />
          }
        />
        {reports.length ? (
          <DataTable
            head={['Work date', 'On site', 'Required tomorrow', 'Work']}
          >
            {reports.map((r) => (
              <tr key={r.id}>
                <td>
                  <FieldDate value={r.report_date} />
                </td>
                <td>{stringValue(r.worker_count) || '—'}</td>
                <td>{stringValue(r.tomorrow_workers) || '—'}</td>
                <td>{stringValue(r.completed_work)}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No workforce reports yet"
            detail="Engineer work updates also record the number of labourers on site."
          />
        )}
      </section>
      <section className="pv2-panel">
        <Title
          title="Curing, Security & Gate Register"
          detail="Repeated labour, material delivery and site-security observations"
        />
        {d.site?.gate.length ? (
          <div className="pv2-history">
            {d.site.gate.map((r) => (
              <div className="pv2-history-row" key={r.id}>
                <span>
                  <strong>{pretty(r.kind)}</strong>
                  <small>{shortDate(r.created_at)}</small>
                </span>
                <p>{stringValue(r.description)}</p>
              </div>
            ))}
          </div>
        ) : (
          <Blank
            title="No entries"
            detail="Watchman and manager can record site rounds and material arrivals."
          />
        )}
        {d.site?.stage === 'execution' &&
          ['manager', 'watchman'].includes(d.site.role) && (
            <details className="pv2-edit-drawer">
              <summary>＋ Add gate / curing entry</summary>
              <GateForm id={d.project.id} />
            </details>
          )}
      </section>
    </div>
  );
}
function Execution({ d }: { d: WorkspaceData }) {
  const rows = d.site?.reports ?? [];
  return (
    <div className="pv2-content">
      <section className="pv2-panel">
        <Title
          title="Execution Updates"
          detail="Photos, reports, labour counts and progress are recorded repeatedly"
          action={
            <span className="pv2-label">{rows.length} recorded updates</span>
          }
        />
        {rows.length ? (
          <div className="pv2-execution-list">
            {rows.map((row) => (
              <article className="pv2-execution" key={row.id}>
                <div>
                  <strong>{stringValue(row.completed_work)}</strong>
                  <Status value="recorded" />
                </div>
                <small>
                  {shortDate(row.report_date)} · {stringValue(row.worker_count)}{' '}
                  workers
                </small>
                <p>Tomorrow: {stringValue(row.tomorrow_plan)}</p>
                {Boolean(row.blockers) && (
                  <small>Blockers: {stringValue(row.blockers)}</small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Blank
            title="No daily execution reports"
            detail="When work starts, site engineers can record daily updates here."
          />
        )}
        <div id="site-photos">
          <PhotoStrip projectId={d.project.id} rows={d.site?.media ?? []} />
        </div>
        {d.site?.stage === 'execution' &&
          ['manager', 'site_engineer'].includes(d.site.role) && (
            <details className="pv2-edit-drawer">
              <summary>＋ Add Work Update</summary>
              <SiteReportForm id={d.project.id} />
            </details>
          )}
        {d.site?.stage === 'execution' && (
          <details className="pv2-edit-drawer">
            <summary>＋ Upload Work Photos</summary>
            <SiteMediaForm id={d.project.id} />
          </details>
        )}
      </section>
    </div>
  );
}
function Checks({ d }: { d: WorkspaceData }) {
  const checks = d.site?.checks ?? [];
  return (
    <div className="pv2-content">
      <section className="pv2-panel">
        <Title
          title="Checks & Quality"
          detail="Repeated structural checks, passes, failed checks and re-inspections"
        />
        {checks.length ? (
          <DataTable head={['Inspection', 'Date', 'Status', 'Action']}>
            {checks.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{stringValue(c.title)}</strong>
                  <small>{stringValue(c.notes)}</small>
                </td>
                <td>
                  <FieldDate value={c.due_date || c.created_at} />
                </td>
                <td>
                  <Status value={stringValue(c.status)} />
                </td>
                <td>
                  {d.site?.stage === 'execution' &&
                    ['manager', 'quality_inspector', 'site_engineer'].includes(
                      d.site.role,
                    ) &&
                    stringValue(c.status) !== 'passed' && (
                      <ReviewCheck id={d.project.id} checkId={c.id} />
                    )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No checks yet"
            detail="Record inspections and follow up until each check passes."
          />
        )}
        {d.site?.stage === 'execution' &&
          ['manager', 'quality_inspector', 'site_engineer'].includes(
            d.site.role,
          ) && (
            <details className="pv2-edit-drawer">
              <summary>＋ Add Check</summary>
              <QualityForm id={d.project.id} />
            </details>
          )}
      </section>
    </div>
  );
}
function Designs({ d }: { d: WorkspaceData }) {
  const rows = d.site?.designs ?? [],
    designFiles =
      d.site?.media.filter((x) =>
        ['design', 'plan'].includes(stringValue(x.category)),
      ) ?? [];
  return (
    <div className="pv2-content">
      <section className="pv2-panel">
        <Title
          title="Designs & Plans"
          detail="Floor plans, structural drawings, revision numbers and design approvals"
        />
        {rows.length ? (
          <DataTable head={['Design', 'Revision', 'Reference', 'Status']}>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <strong>{pretty(x.kind)}</strong>
                </td>
                <td>Rev {stringValue(x.revision)}</td>
                <td>{stringValue(x.reference)}</td>
                <td>
                  <Status value={stringValue(x.status)} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <Blank
            title="No design revisions"
            detail="Architects and structural designers can submit revisioned plans during the design stage."
          />
        )}
        {designFiles.length > 0 && (
          <div className="pv2-file-list">
            {designFiles.map((f) => (
              <a
                key={f.id}
                href={
                  '/dashboard/projects/' + d.project.id + '/site/media/' + f.id
                }
                className="pv2-file"
              >
                <OwnerIcon name="quotations" size={20} />
                <strong>{stringValue(f.filename)}</strong>
                <span>Download</span>
              </a>
            ))}
          </div>
        )}
        <p className="pv2-muted">
          Drawing uploads and approvals are handled in the project&apos;s design
          milestone.
        </p>
      </section>
    </div>
  );
}
function Team({ d }: { d: WorkspaceData }) {
  const people = d.site?.team ?? [],
    users = d.site?.memberOptions ?? [];
  return (
    <div className="pv2-content">
      <section className="pv2-panel">
        <Title
          title="Team & Access"
          detail="Project-specific staff and client access; no duplicate company employee records"
          action={
            <NextLink href="/dashboard/company/team" label="Company Team" />
          }
        />
        {people.length ? (
          <div className="pv2-team-list">
            {people.map((row) => (
              <div className="pv2-person" key={row.id}>
                <span className="pv2-person-avatar">
                  {pretty(row.role).slice(0, 1) || 'T'}
                </span>
                <div>
                  <strong>
                    {users.find((x) => x.id === row.user_id)?.label ||
                      'Assigned project member'}
                  </strong>
                  <small>{pretty(row.role)}</small>
                </div>
                <Status value={row.active === true ? 'active' : 'inactive'} />
              </div>
            ))}
          </div>
        ) : (
          <Blank
            title="No project assignments"
            detail="Invite existing company staff to this project without copying employee profiles."
          />
        )}
        {d.site?.canManage && users.length > 0 && (
          <details className="pv2-edit-drawer">
            <summary>＋ Add Project Team Member</summary>
            <AssignRole projectId={d.project.id} users={users} />
          </details>
        )}
        {d.site?.canManage && users.length > 0 && (
          <MaterialOrderingAccess
            projectId={d.project.id}
            users={users}
            grants={d.materialAccess.grants}
          />
        )}
      </section>
      <p className="pv2-muted">
        Use “Share with client” in the project header to invite or revoke access
        for this exact project.
      </p>
    </div>
  );
}
const pages: {
  [key in ProjectPageSlug]: (p: { d: WorkspaceData }) => React.ReactNode;
} = {
  overview: Milestones,
  timeline: Milestones,
  milestones: Milestones,
  documents: Documents,
  payments: Payments,
  procurement: Procurement,
  labour: Labour,
  execution: Execution,
  checks: Checks,
  designs: Designs,
  team: Team,
};
export async function ProjectV2Page({
  id,
  view,
}: {
  id: string;
  view: ProjectPageSlug;
}) {
  const data = await projectWorkspace(id);
  const organization = await activeOrganization();
  const nav = organization ? ownerWorkspaceNavigation(organization) : [];
  const Component = pages[view];
  return (
    <OwnerShell
      companyName={data.company}
      accountLabel={data.email.split('@')[0] || 'Company member'}
      accountEmail={data.email}
      planLabel="Business workspace"
      currentHref="/dashboard/projects"
      navigation={nav}
      search=""
      notificationsEnabled={
        organization
          ? canAccess(organization, {
              organizationId: organization.organizationId,
              permission: 'notification.view',
            })
          : false
      }
      dashboardBrand
    >
      <main className="pv2-page" id="main-content">
        <nav className="pv2-crumb" aria-label="Breadcrumb">
          <Link href="/dashboard/projects">Projects</Link>
          <span>›</span>
          <Link href={cur(data.project.id, 'overview')}>
            {data.project.name}
          </Link>
          <span>›</span>
          <strong>{projectPages.find((x) => x.slug === view)?.title}</strong>
        </nav>
        <ProjectHeader data={data} active={view} />
        <section className="pv2-view">
          {Component && <Component d={data} />}
        </section>
      </main>
      <OwnerMobileNav
        currentHref="/dashboard/projects"
        navigation={nav
          .filter((item) =>
            [
              'Dashboard',
              'Projects',
              'My Sites',
              'Finance',
              'Team',
              'Settings',
            ].includes(item.label),
          )
          .filter(
            (item) =>
              item.label !== 'My Sites' ||
              !nav.some((x) => x.label === 'Projects'),
          )
          .slice(0, 5)}
      />
    </OwnerShell>
  );
}
