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

function PanelHeading({
  icon,
  title,
  href,
  action,
}: {
  icon: 'calendar' | 'team' | 'check' | 'projects';
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="sc-panel-heading">
      <h2>
        <OwnerIcon name={icon} size={19} /> {title}
      </h2>
      {href && <a href={href}>{action ?? 'View all'} ›</a>}
    </div>
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
    managerUpdates,
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
  const latestReport = [...reports].sort((a, b) =>
    field(b, 'report_date').localeCompare(field(a, 'report_date')),
  )[0];
  const latestUpdate = [...managerUpdates].sort((a, b) =>
    field(b, 'report_date').localeCompare(field(a, 'report_date')),
  )[0];
  const canUploadEvidence =
    (isDesign || isEngineer || isQuality) &&
    (stage === 'design' || stage === 'execution');
  const canSubmitReport = isEngineer && stage === 'execution';
  const latestMedia = media.slice(0, 4);

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
              <h1>Site Delivery</h1>
              <span className="sc-stage-badge">{stageTitle}</span>
            </div>
            <p className="sc-project-name">{projectName}</p>
            <p className="sc-project-meta">
              {projectCode || 'Project code not set'}
              <span aria-hidden="true"> · </span>
              {isManager
                ? 'Project manager'
                : pretty(role ?? 'Assigned member')}
            </p>
          </div>
          <div className="sc-hero-actions">
            {canUploadEvidence && (
              <a className="sc-btn sc-btn-outline" href="#media">
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
        {(isEngineer || isQuality) && (
          <Metric
            title="Daily reports"
            count={reports.length}
            caption="Recorded updates"
            icon="quotations"
            color="sc-blue"
            href="#daily-reports"
          />
        )}
        {canSeeManagerUpdates && (
          <Metric
            title="Pending reviews"
            count={awaitingReview}
            caption="Reports without a review"
            icon="calendar"
            color="sc-amber"
            href="#daily-reports"
          />
        )}
        {isQuality && (
          <Metric
            title="Quality checks"
            count={checks.length}
            caption={passedChecks + ' passed · ' + openChecks + ' open'}
            icon="check"
            color="sc-green"
            href="#quality"
          />
        )}
        {(isEngineer || isProcurement) && (
          <Metric
            title="Material requests"
            count={materials.length}
            caption={openMaterials + ' awaiting closure'}
            icon="purchases"
            color="sc-orange"
            href="#materials"
          />
        )}
        {isWatchman && (
          <Metric
            title="Security & curing"
            count={gate.length}
            caption="Recorded site events"
            icon="clients"
            color="sc-cyan"
            href="#security"
          />
        )}
        {isDesign && !isEngineer && (
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
        <a className="sc-tab-current" href="#overview">
          <OwnerIcon name="dashboard" size={16} /> Overview
        </a>
        {(isEngineer || isQuality) && (
          <a href="#daily-reports">
            <OwnerIcon name="quotations" size={16} /> Daily reports
          </a>
        )}
        {(isEngineer || isProcurement) && (
          <a href="#materials">
            <OwnerIcon name="purchases" size={16} /> Materials
          </a>
        )}
        {isQuality && (
          <a href="#quality">
            <OwnerIcon name="check" size={16} /> Quality
          </a>
        )}
        {isWatchman && (
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

      <section className="sc-overview" id="overview">
        <div className="sc-overview-main">
          {(isEngineer || isQuality) && (
            <article className="sc-surface">
              <PanelHeading
                title="Latest site progress"
                icon="calendar"
                href="#daily-reports"
                action="All reports"
              />
              {latestReport ? (
                <>
                  <p className="sc-reported-date">
                    Report dated{' '}
                    {field(latestReport, 'report_date') || 'not recorded'}
                  </p>
                  <div className="sc-progress-tiles">
                    <div>
                      <span className="sc-tile-icon sc-green">
                        <OwnerIcon name="check" size={19} />
                      </span>
                      <strong>Work completed</strong>
                      <p>
                        {field(latestReport, 'completed_work') || 'Not entered'}
                      </p>
                    </div>
                    <div>
                      <span className="sc-tile-icon sc-blue">
                        <OwnerIcon name="leads" size={19} />
                      </span>
                      <strong>Labour count</strong>
                      <p>
                        {field(latestReport, 'worker_count') || 'Not entered'}
                      </p>
                    </div>
                    <div>
                      <span className="sc-tile-icon sc-amber">
                        <OwnerIcon name="calendar" size={19} />
                      </span>
                      <strong>Tomorrow’s plan</strong>
                      <p>
                        {field(latestReport, 'tomorrow_plan') || 'Not entered'}
                      </p>
                    </div>
                    <div>
                      <span className="sc-tile-icon sc-orange">
                        <OwnerIcon name="bell" size={19} />
                      </span>
                      <strong>Blockers</strong>
                      <p>
                        {field(latestReport, 'blockers') || 'None recorded'}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="sc-empty">
                  No daily site reports yet. Engineer updates will appear here
                  after submission.
                </p>
              )}
            </article>
          )}
          {canSeeManagerUpdates && (
            <article className="sc-surface">
              <PanelHeading
                title="Manager instructions"
                icon="team"
                href="#manager-updates"
                action="All updates"
              />
              {latestUpdate ? (
                <div className="sc-instructions">
                  <p className="sc-reported-date">
                    {field(latestUpdate, 'report_date')}
                  </p>
                  <p>
                    <strong>Site health:</strong>{' '}
                    {pretty(field(latestUpdate, 'health')) || 'Not entered'}
                  </p>
                  <p>
                    <strong>Progress:</strong>{' '}
                    {field(latestUpdate, 'summary') || 'Not entered'}
                  </p>
                  <p>
                    <strong>Next priorities:</strong>{' '}
                    {field(latestUpdate, 'tomorrow_priorities') ||
                      'Not entered'}
                  </p>
                  {field(latestUpdate, 'site_instructions') && (
                    <p>
                      <strong>Team instructions:</strong>{' '}
                      {field(latestUpdate, 'site_instructions')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="sc-empty">
                  No project-manager update published yet.
                </p>
              )}
            </article>
          )}
          {isWatchman && !isEngineer && !canSeeManagerUpdates && (
            <article className="sc-surface">
              <PanelHeading
                icon="calendar"
                title="Security & curing"
                href="#security"
                action="Open log"
              />
              <p className="sc-empty">
                Record material arrivals, labour entry, site rounds and curing
                activities without commercial access.
              </p>
            </article>
          )}
          {isDesign && !isEngineer && (
            <article className="sc-surface">
              <PanelHeading
                title="Technical design"
                icon="projects"
                href="#design"
                action="Design reviews"
              />
              <p className="sc-empty">
                Submit revised drawings, review current approvals and follow the
                client-approval workflow.
              </p>
            </article>
          )}
        </div>
        <div className="sc-overview-aside">
          <article className="sc-surface">
            <PanelHeading title="Delivery status" icon="check" />
            <div className="sc-current-stage">
              <strong>{stageTitle}</strong>
              <span>Current workflow stage</span>
            </div>
            <div className="sc-data-line">
              <span>Recorded reports</span>
              <strong>{reports.length}</strong>
            </div>
            {isQuality && (
              <div className="sc-data-line">
                <span>Open quality checks</span>
                <strong>{openChecks}</strong>
              </div>
            )}
            <div className="sc-data-line">
              <span>Assigned access</span>
              <strong>
                {isManager ? 'Manager' : pretty(role ?? 'Member')}
              </strong>
            </div>
          </article>
          {(isDesign || isEngineer || isQuality) && latestMedia.length > 0 && (
            <article className="sc-surface">
              <PanelHeading
                title="Recent evidence"
                icon="projects"
                href="#media"
                action="All files"
              />
              <div className="sc-evidence-list">
                {latestMedia.map((file) => (
                  <a
                    href={
                      '/dashboard/projects/' +
                      projectId +
                      '/site/media/' +
                      file.id
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    key={String(file.id)}
                  >
                    <OwnerIcon name="quotations" size={18} />
                    <span>
                      <strong>
                        {field(file, 'filename') || 'Site evidence'}
                      </strong>
                      <small>{pretty(field(file, 'category'))}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </article>
          )}
          {isQuality && (
            <article className="sc-surface">
              <PanelHeading
                title="Quality checklist"
                icon="check"
                href="#quality"
                action="View checks"
              />
              <div className="sc-quality">
                <strong>
                  {passedChecks} of {checks.length} passed
                </strong>
                <div className="sc-quality-track">
                  <span
                    style={{
                      width: checks.length
                        ? Math.round((passedChecks / checks.length) * 100) + '%'
                        : '0%',
                    }}
                  />
                </div>
                <small>{openChecks} pending, failed or requiring recheck</small>
              </div>
            </article>
          )}
        </div>
      </section>
    </>
  );
}
