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

function pretty(raw: string) {
  return raw.replaceAll('_', ' ');
}

export function SiteCommandOverview(props: SiteCommandOverviewProps) {
  const {
    projectId,projectName,projectCode,stage,role,isManager,isEngineer,
    isQuality,isWatchman,isDesign,
  } = props;

  const currentStage = milestones.findIndex(
    (milestone) => milestone.key === stage,
  );
  const stageTitle =
    stage === 'not_started'
      ? 'Not started'
      : (milestones[currentStage]?.name ?? pretty(stage));
  const canUploadEvidence =
    ((isDesign || isEngineer || isQuality) &&
      (stage === 'design' || stage === 'execution')) ||
    (isWatchman && stage === 'execution');
  const canSubmitReport = isEngineer && stage === 'execution';

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

      </header>




    </>
  );
}
