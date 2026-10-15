import Link from 'next/link';
import { OwnerIcon } from '../../../owner-shell';

type RecordRow = Record<string, unknown>;
export type SiteCommandOverviewProps = {
  projectId: string;
  projectName: string;
  projectCode: string;
  stage:
    'not_started' | 'design' | 'client_approved' | 'execution' | 'handover';
  role: string | null;
  isManager: boolean;
  isEngineer: boolean;
  isQuality: boolean;
  isProcurement: boolean;
  isWatchman: boolean;
  isDesign: boolean;
  canSeeManagerUpdates: boolean;
  reports: RecordRow[];
  reviews: RecordRow[];
  managerUpdates: RecordRow[];
  managerDataUnavailable: boolean;
  checks: RecordRow[];
  materials: RecordRow[];
  gate: RecordRow[];
  media: RecordRow[];
};

const milestones = [
  { key: 'design', name: 'Design & engineering' },
  { key: 'client_approved', name: 'Client approval' },
  { key: 'execution', name: 'Site execution' },
  { key: 'handover', name: 'Quality & handover' },
] as const;

function field(record: RecordRow, key: string): string {
  const value = record[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function pretty(raw: string) {
  return raw.replaceAll('_', ' ');
}

function Metric({
  title,
  count,
  caption,
  icon,
  color,
  href,
}: {
  title: string;
  count: number;
  caption: string;
  icon: 'quotations' | 'calendar' | 'check' | 'purchases' | 'clients';
  color: string;
  href: string;
}) {
  return (
    <a href={href} className="sc-metric">
      <span className={'sc-metric-icon ' + color}>
        <OwnerIcon name={icon} size={21} />
      </span>
      <span>
        <small>{title}</small>
        <strong>{count.toLocaleString('en-IN')}</strong>
        <em>{caption}</em>
      </span>
      <span className="sc-metric-arrow" aria-hidden="true">
        ›
      </span>
    </a>
  );
}

export function SiteCommandOverview(props: SiteCommandOverviewProps) {
  const {
    projectId,
    projectName,
    projectCode,
    stage,
    role,
    isManager,
    isEngineer,
    isQuality,
    isProcurement,
    isWatchman,
    isDesign,
    canSeeManagerUpdates,
    reports,
    reviews,
    managerDataUnavailable,
    checks,
    materials,
    gate,
    media,
  } = props;

  const currentStage = milestones.findIndex(
    (milestone) => milestone.key === stage,
  );
  const stageTitle =
    stage === 'not_started'
      ? 'Not started'
      : (milestones[currentStage]?.name ?? pretty(stage));
  const reviewByReport = new Map<string, RecordRow>();
  for (const review of reviews) {
    const reportId = field(review, 'report_id');
    if (!reviewByReport.has(reportId)) reviewByReport.set(reportId, review);
  }
  const awaitingReview = reports.filter(
    (report) => !reviewByReport.has(String(report.id)),
  ).length;
  const passedChecks = checks.filter(
    (check) => field(check, 'status') === 'passed',
  ).length;
  const openChecks = checks.length - passedChecks;
  const openMaterials = materials.filter(
    (material) => !['received', 'rejected'].includes(field(material, 'status')),
  ).length;
  const canUploadEvidence =
    ((isDesign || isEngineer || isQuality) &&
      (stage === 'design' || stage === 'execution')) ||
    (isWatchman && stage === 'execution');
  const canSubmitReport = isEngineer && stage === 'execution';
  const deliveryActive = stage === 'execution' || stage === 'handover';
  const reportSection = (isEngineer || isQuality) && deliveryActive;
  const managerSection =
    canSeeManagerUpdates && deliveryActive && !managerDataUnavailable;
  const materialSection = (isEngineer || isProcurement) && deliveryActive;
  const qualitySection = isQuality && deliveryActive;
  const securitySection = isWatchman && deliveryActive;

  return (
    <>
      <nav className="sc-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard">Dashboard</Link>
        <span aria-hidden="true">›</span>
        <Link href="/dashboard/projects">Projects</Link>
        <span aria-hidden="true">›</span>
        <Link href={'/dashboard/projects/' + projectId}>{projectName}</Link>
        <span aria-hidden="true">›</span>
        <strong>Site delivery</strong>
      </nav>

      <header className="sc-hero">
        <div className="sc-hero-heading">
          <div className="sc-hero-symbol">
            <OwnerIcon name="projects" size={30} />
          </div>
          <div className="sc-hero-title">
            <p className="sc-overline">Business OS · Project workspace</p>
            <div className="sc-project-title-row">
              <h1>{projectName}</h1>
              <span className="sc-stage-badge">{stageTitle}</span>
            </div>
            <p className="sc-project-name">Site Delivery workspace</p>
            <p className="sc-project-meta">
              {projectCode || 'Project code not set'}
              <span aria-hidden="true"> · </span>
              {isManager
                ? 'Project manager'
                : pretty(role ?? 'Assigned member')}
            </p>
          </div>
          <div className="sc-hero-actions">
            <Link
              className="sc-btn sc-btn-outline"
              href={'/dashboard/projects/' + projectId}
            >
              <OwnerIcon name="projects" size={17} /> Project details
            </Link>
            {canUploadEvidence && (
              <a
                className="sc-btn sc-btn-outline"
                href={
                  isWatchman && !isEngineer && !isDesign
                    ? '#security'
                    : '#media'
                }
              >
                <OwnerIcon name="plus" size={17} /> Upload evidence
              </a>
            )}
            {canSubmitReport ? (
              <a className="sc-btn sc-btn-primary" href="#daily-reports">
                <OwnerIcon name="plus" size={17} /> Add site update
              </a>
            ) : isManager && stage === 'execution' ? (
              <a className="sc-btn sc-btn-primary" href="#manager-updates">
                <OwnerIcon name="plus" size={17} /> Manager update
              </a>
            ) : isManager && stage === 'not_started' ? (
              <a className="sc-btn sc-btn-primary" href="#initialize">
                <OwnerIcon name="plus" size={17} /> Start delivery
              </a>
            ) : null}
          </div>
        </div>

        <div className="sc-stage-label">
          <span>Project workflow</span>
          <strong>
            {currentStage < 0
              ? 'Awaiting initialization'
              : 'Stage ' + (currentStage + 1) + ' of 4'}
          </strong>
        </div>
        <div
          className="sc-milestones"
          aria-label="Project workflow stages, not physical completion"
        >
          {milestones.map((milestone, index) => (
            <div
              className={
                'sc-milestone' +
                (index < currentStage
                  ? ' sc-completed'
                  : index === currentStage
                    ? ' sc-current'
                    : '')
              }
              key={milestone.key}
            >
              <span className="sc-step-number">
                {index < currentStage ? (
                  <OwnerIcon name="check" size={16} />
                ) : (
                  index + 1
                )}
              </span>
              <strong>{milestone.name}</strong>
              <small>
                {index < currentStage
                  ? 'Completed'
                  : index === currentStage
                    ? 'Current stage'
                    : 'Upcoming'}
              </small>
            </div>
          ))}
        </div>
        <p className="sc-disclaimer">
          Stages reflect workflow status, not measured physical progress or
          budget completion.
        </p>
      </header>

      <section className="sc-metrics" aria-label="Project record counts">
        {reportSection && (
          <Metric
            title="Daily reports"
            count={reports.length}
            caption="Most recent reports (up to 40)"
            icon="quotations"
            color="sc-blue"
            href="#daily-reports"
          />
        )}
        {managerSection && (
          <Metric
            title="Pending reviews"
            count={awaitingReview}
            caption="Reports without a review"
            icon="calendar"
            color="sc-amber"
            href="#daily-reports"
          />
        )}
        {qualitySection && (
          <Metric
            title="Quality checks"
            count={checks.length}
            caption={passedChecks + ' passed · ' + openChecks + ' open'}
            icon="check"
            color="sc-green"
            href="#quality"
          />
        )}
        {materialSection && (
          <Metric
            title="Material requests"
            count={materials.length}
            caption={openMaterials + ' awaiting closure (latest 70)'}
            icon="purchases"
            color="sc-orange"
            href="#materials"
          />
        )}
        {securitySection && (
          <Metric
            title="Security & curing"
            count={gate.length}
            caption="Recorded site events"
            icon="clients"
            color="sc-cyan"
            href="#security"
          />
        )}
        {isDesign && !isEngineer && canUploadEvidence && (
          <Metric
            title="Design files"
            count={media.length}
            caption="Private evidence uploads"
            icon="quotations"
            color="sc-blue"
            href="#media"
          />
        )}
      </section>

      <nav className="sc-tabs" aria-label="Site delivery sections">
        <a className="sc-tab-current" href="#construction-timeline">
          <OwnerIcon name="calendar" size={16} /> Timeline
        </a>
        <a href="#overview">
          <OwnerIcon name="dashboard" size={16} /> Overview
        </a>
        {reportSection && (
          <a href="#daily-reports">
            <OwnerIcon name="quotations" size={16} /> Daily reports
          </a>
        )}
        {materialSection && (
          <a href="#materials">
            <OwnerIcon name="purchases" size={16} /> Materials
          </a>
        )}
        {qualitySection && (
          <a href="#quality">
            <OwnerIcon name="check" size={16} /> Quality
          </a>
        )}
        {securitySection && (
          <a href="#security">
            <OwnerIcon name="calendar" size={16} /> Security &amp; curing
          </a>
        )}
        {canUploadEvidence && (
          <a href="#media">
            <OwnerIcon name="projects" size={16} /> Evidence
          </a>
        )}
        {isManager && (
          <a href="#team">
            <OwnerIcon name="team" size={16} /> Team
          </a>
        )}
      </nav>
    </>
  );
}
