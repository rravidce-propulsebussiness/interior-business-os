import Image from 'next/image';
import Link from 'next/link';
import type { ConstructionPlanningData } from './construction-planning-panel';
import './construction-journey.css';

type SiteRecord = Record<string, unknown>;
type JourneyProps = {
  projectId: string;
  stages: ConstructionPlanningData['stages'];
  quality?: {
    stages: {
      stage_id: string;
      cleared: boolean;
      inspections: { mandatory: boolean; status: string; current: boolean }[];
    }[];
  } | null;
  materials: SiteRecord[];
  checks: SiteRecord[];
  media: SiteRecord[];
  reports: SiteRecord[];
  gate: SiteRecord[];
  managerUpdates?: SiteRecord[];
  canSeeFinance: boolean;
  inSiteWorkspace?: boolean;
  canRequestMaterials?: boolean;
  canUploadWorkPhotos?: boolean;
  canUploadCuringPhotos?: boolean;
};

const phaseNames: Record<string, string> = {
  preconstruction: 'Agreement & preconstruction',
  design: 'Planning & structural designs',
  site_preparation: 'Site clearance & excavation',
  foundation: 'Foundation & footings',
  plinth: 'Plinth & ground preparation',
  superstructure: 'Columns, beams & slab',
  masonry: 'Brickwork & concealed services',
  finishes: 'Plaster, waterproofing & finishes',
  handover: 'Final inspection & handover',
};

function value(record: SiteRecord, key: string): string {
  const item = record[key];
  return typeof item === 'string' || typeof item === 'number'
    ? String(item)
    : '';
}
function human(raw: string) {
  return raw.replaceAll('_', ' ');
}
function date(raw: string) {
  if (!raw) return 'Date not recorded';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? 'Date not recorded'
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(parsed);
}
function stateLabel(status: string, cleared: boolean) {
  if (cleared) return 'Certified';
  if (status === 'in_progress') return 'In progress';
  if (status === 'completed') return 'Awaiting certification';
  if (status === 'blocked') return 'Blocked';
  return 'Planned';
}
function statusClass(status: string, cleared: boolean) {
  if (cleared) return 'success';
  return status === 'blocked'
    ? 'danger'
    : status === 'in_progress'
      ? 'primary'
      : 'neutral';
}

function EvidenceTile({
  item,
  projectId,
}: {
  item: SiteRecord;
  projectId: string;
}) {
  const id = value(item, 'id');
  const mime = value(item, 'mime');
  const category = value(item, 'category');
  const caption = value(item, 'caption');
  return (
    <a
      className="cj-photo"
      href={`/dashboard/projects/${projectId}/site/media/${id}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {mime.startsWith('image/') ? (
        <Image
          unoptimized
          src={`/dashboard/projects/${projectId}/site/media/${id}`}
          width={200}
          height={128}
          alt={caption || human(category) + ' evidence'}
        />
      ) : (
        <span className="cj-photo-file">
          {mime === 'application/pdf' ? 'PDF document' : 'Site video'}
        </span>
      )}
      <strong>
        {category === 'curing'
          ? 'Curing round'
          : category === 'site'
            ? 'Work started / site'
            : category === 'daily'
              ? 'Daily progress'
              : human(category)}
      </strong>
      <span>{caption || value(item, 'filename')}</span>
      <small>{date(value(item, 'created_at'))}</small>
    </a>
  );
}

/**
 * Reads only records already returned by role-checked site and construction RPCs.
 * Legacy site reports, materials and uploads have NO stage-id FK: display them
 * explicitly as project-wide evidence, never count them as a specific stage's work.
 * Certified state comes only from the independent canonical quality RPC.
 */
export function ConstructionJourney({
  projectId,
  stages,
  quality,
  materials,
  checks,
  media,
  reports,
  gate,
  managerUpdates = [],
  canSeeFinance,
  inSiteWorkspace = false,
  canRequestMaterials = false,
  canUploadWorkPhotos = false,
  canUploadCuringPhotos = false,
}: JourneyProps) {
  const base = `/dashboard/projects/${projectId}/site`;
  const go = (hash: string) => (inSiteWorkspace ? hash : base + hash);
  const qualityByStage = new Map(
    (quality?.stages ?? []).map((entry) => [entry.stage_id, entry]),
  );
  const certified = stages.filter(
    (stage) => qualityByStage.get(stage.id)?.cleared,
  ).length;
  const openStage = stages.find(
    (stage) => !qualityByStage.get(stage.id)?.cleared,
  )?.id;
  const workMedia = media
    .filter(
      (record) =>
        ['site', 'daily', 'inspection'].includes(value(record, 'category')) &&
        ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(
          value(record, 'mime'),
        ),
    )
    .slice(0, 4);
  const curingMedia = media
    .filter((record) => value(record, 'category') === 'curing')
    .slice(0, 4);
  const curingRounds = gate.filter(
    (record) => value(record, 'kind') === 'curing',
  );
  const recentReports = reports.slice(0, 2);
  const latestReport = recentReports[0];
  const latestManager = managerUpdates[0];
  const pendingChecks = checks.filter(
    (record) => value(record, 'status') !== 'passed',
  );
  const materialsOpen = materials.filter(
    (record) => !['received', 'rejected'].includes(value(record, 'status')),
  );
  const operationsUrl = `/dashboard/operations?project=${projectId}`;
  const paymentsUrl = `/dashboard/finance/contracts?project_id=${projectId}`;

  return (
    <section
      className="cj-root"
      id="construction-timeline"
      aria-label="Construction execution timeline"
    >
      <div className="cj-header">
        <div>
          <p className="cj-eyebrow">Construction execution · Live records</p>
          <h2>Construction journey</h2>
          <p>
            Stage-by-stage work, inspections, materials, photos, curing and
            payments in one timeline.
          </p>
        </div>
        <span className="cj-count">
          {certified} / {stages.length} certified
        </span>
      </div>
      <nav className="cj-nav" aria-label="Project workspace shortcuts">
        <Link href={go('#construction-timeline')} className="cj-nav-active">
          Timeline
        </Link>
        <Link href={go('#daily-reports')}>Site updates</Link>
        <Link href={go('#materials')}>Materials</Link>
        <Link href={go('#security')}>Curing</Link>
        <Link href={go('#team')}>Team</Link>
        {canSeeFinance && <Link href={paymentsUrl}>Payments</Link>}
      </nav>
      {!stages.length ? (
        <div className="cj-empty">
          <h3>Construction stages not configured yet</h3>
          <p>
            The project manager can set the actual floors and stage dependencies
            in the site workspace. No progress, check or payment figures have
            been guessed.
          </p>
          <Link href={go('#construction-planning')}>
            Set up the construction stage plan →
          </Link>
        </div>
      ) : (
        <div className="cj-track">
          {stages.map((stage, index) => {
            const qc = qualityByStage.get(stage.id);
            const cleared = qc?.cleared === true;
            const status = stateLabel(stage.status, cleared);
            const style = statusClass(stage.status, cleared);
            const inspected =
              qc?.inspections.filter((entry) => entry.mandatory) ?? [];
            const inspectionsPassed = inspected.filter(
              (entry) => entry.status === 'passed' && entry.current,
            ).length;
            const active = stage.id === openStage;
            return (
              <div className="cj-track-item" key={stage.id}>
                <div className={`cj-node cj-node-${style}`}>
                  {cleared ? '✓' : String(index + 1).padStart(2, '0')}
                </div>
                <details className={`cj-stage cj-stage-${style}`} open={active}>
                  <summary className="cj-stage-summary">
                    <span className="cj-stage-heading">
                      <span className="cj-stage-name">{stage.title}</span>
                      <span className="cj-stage-desc">{stage.explanation}</span>
                      <span className="cj-stage-phase">
                        {phaseNames[stage.phase] ?? human(stage.phase)}
                        {stage.floor_code
                          ? ` · ${human(stage.floor_code)}`
                          : ''}
                      </span>
                    </span>
                    <span className={`cj-state cj-state-${style}`}>
                      {status}
                    </span>
                    <span className="cj-chevron">⌄</span>
                  </summary>
                  <div className="cj-inside">
                    <div className="cj-stat-grid">
                      <div>
                        <span>Planned work</span>
                        <strong>{stage.activities.length} activities</strong>
                      </div>
                      <div>
                        <span>Linked tasks</span>
                        <strong>{stage.task_count}</strong>
                      </div>
                      <div>
                        <span>Formal inspections</span>
                        <strong>
                          {inspected.length
                            ? `${inspectionsPassed}/${inspected.length} passed`
                            : 'Not linked'}
                        </strong>
                      </div>
                      <div>
                        <span>Payment milestone</span>
                        <strong>
                          {canSeeFinance ? 'Open billing record' : 'Restricted'}
                        </strong>
                      </div>
                    </div>
                    <div className="cj-stage-columns">
                      <div className="cj-subcard">
                        <div className="cj-subhead">
                          <h4>Work checklist</h4>
                          <Link href={operationsUrl}>Task schedule →</Link>
                        </div>
                        <p className="cj-caption">
                          Planned steps; these are not self-reported as
                          completed.
                        </p>
                        <ol className="cj-tasks">
                          {stage.activities.map((activity, i) => (
                            <li key={i}>
                              <span>{i + 1}</span>
                              {activity}
                            </li>
                          ))}
                        </ol>
                        {stage.dependencies.length > 0 && (
                          <p className="cj-note">
                            <strong>Prerequisites:</strong>{' '}
                            {stage.dependencies.join(', ')}
                          </p>
                        )}
                        {stage.hold_point && (
                          <p className="cj-hold">
                            Quality hold: {human(stage.hold_point)} review
                            required before certification.
                          </p>
                        )}
                      </div>
                      <div className="cj-side-stack">
                        <div className="cj-subcard">
                          <div className="cj-subhead">
                            <h4>Quality & inspections</h4>
                            <Link href={go('#construction-planning')}>
                              Stage checks →
                            </Link>
                          </div>
                          <p>
                            {inspected.length
                              ? `${inspectionsPassed} of ${inspected.length} linked mandatory formal inspections passed.`
                              : 'No mandatory formal inspection linked to this stage yet.'}
                          </p>
                          <p className="cj-caption">
                            {cleared
                              ? 'Current certificate recorded'
                              : 'Independent QC and structural approval where required'}
                          </p>
                          {stage.inspection_topics.length > 0 && (
                            <p className="cj-note">
                              Check topics:{' '}
                              {stage.inspection_topics.slice(0, 3).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="cj-subcard">
                          <div className="cj-subhead">
                            <h4>Stage payment</h4>
                            {canSeeFinance && (
                              <Link href={paymentsUrl}>View schedule →</Link>
                            )}
                          </div>
                          <p>
                            {canSeeFinance
                              ? 'See linked contract milestones, requests, invoices and receipts in the canonical Billing workspace.'
                              : 'Financial details are visible only to permitted billing roles.'}
                          </p>
                          <p className="cj-caption">
                            No payment is inferred from checklist progress.
                          </p>
                        </div>
                      </div>
                    </div>
                    {active && (
                      <div className="cj-activity">
                        <div className="cj-section-title">
                          <div>
                            <h4>Site records & tomorrow's plan</h4>
                            <p>
                              Project-wide site records (not individually linked
                              to this stage).
                            </p>
                          </div>
                          <Link href={go('#daily-reports')}>All updates →</Link>
                        </div>
                        <div className="cj-stage-columns">
                          <div className="cj-subcard">
                            <div className="cj-subhead">
                              <h4>Site engineer updates</h4>
                              {canUploadWorkPhotos && (
                                <Link href={go('#media')}>
                                  Add work photo →
                                </Link>
                              )}
                            </div>
                            {latestReport ? (
                              <>
                                <p>
                                  <strong>
                                    {date(value(latestReport, 'report_date'))}:
                                  </strong>{' '}
                                  {value(latestReport, 'completed_work')}
                                </p>
                                <p>
                                  <strong>Tomorrow:</strong>{' '}
                                  {value(latestReport, 'tomorrow_plan')}
                                </p>
                                <p className="cj-caption">
                                  Workers recorded today:{' '}
                                  {value(latestReport, 'worker_count') ||
                                    'Not recorded'}
                                </p>
                                <p className="cj-labour">
                                  <strong>
                                    Tomorrow's labour requirement:
                                  </strong>{' '}
                                  {value(latestReport, 'tomorrow_workers') ||
                                    'Not planned'}
                                  {value(latestReport, 'tomorrow_workers')
                                    ? ' workers'
                                    : ''}
                                </p>
                              </>
                            ) : (
                              <p>No daily engineer report yet.</p>
                            )}
                            {latestManager && (
                              <p className="cj-note">
                                <strong>Manager's next priorities:</strong>{' '}
                                {value(latestManager, 'tomorrow_priorities')}
                              </p>
                            )}
                            {!latestReport && (
                              <Link href={go('#daily-reports')}>
                                Create first site update →
                              </Link>
                            )}
                          </div>
                          <div className="cj-subcard">
                            <div className="cj-subhead">
                              <h4>Material requirements</h4>
                              {canRequestMaterials && (
                                <Link href={go('#materials')}>
                                  Request / update →
                                </Link>
                              )}
                            </div>
                            {materials.length ? (
                              <ul className="cj-materials">
                                {materials.slice(0, 5).map((item) => (
                                  <li key={value(item, 'id')}>
                                    <span>
                                      {value(item, 'item')} ·{' '}
                                      {value(item, 'quantity')}{' '}
                                      {value(item, 'unit')}
                                    </span>
                                    <em>{human(value(item, 'status'))}</em>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>No material requests recorded yet.</p>
                            )}
                            <p className="cj-caption">
                              {materialsOpen.length} project-wide requests
                              awaiting closure. Ordering and receipts remain in
                              Procurement.
                            </p>
                            <Link href={go('#materials')}>
                              View procurement status →
                            </Link>
                          </div>
                          <div className="cj-subcard">
                            <div className="cj-subhead">
                              <h4>Engineer work-start & progress photos</h4>
                              <Link href={go('#media')}>Photo updates →</Link>
                            </div>
                            {workMedia.length ? (
                              <div className="cj-gallery">
                                {workMedia.map((item) => (
                                  <EvidenceTile
                                    key={value(item, 'id')}
                                    item={item}
                                    projectId={projectId}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p>
                                No work-start or progress photos uploaded yet.
                              </p>
                            )}
                          </div>
                          <div className="cj-subcard">
                            <div className="cj-subhead">
                              <h4>Watchman curing rounds</h4>
                              <Link href={go('#security')}>
                                Log curing / photos →
                              </Link>
                            </div>
                            <p>
                              {curingRounds.length} curing rounds logged for
                              this project. Curing may continue in parallel with
                              later approved work.
                            </p>
                            {curingMedia.length ? (
                              <div className="cj-gallery">
                                {curingMedia.map((item) => (
                                  <EvidenceTile
                                    key={value(item, 'id')}
                                    item={item}
                                    projectId={projectId}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="cj-caption">
                                No curing photos uploaded yet.
                              </p>
                            )}
                            {canUploadCuringPhotos && (
                              <Link href={go('#security')}>
                                Upload curing evidence →
                              </Link>
                            )}
                          </div>
                        </div>
                        <p className="cj-footer-note">
                          Open quality checks across the project:{' '}
                          {pendingChecks.length}. The Operations plan, approved
                          contract and inspections determine actual construction
                          clearance.
                        </p>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
      <div className="cj-bottom">
        <Link href={go('#daily-reports')}>＋ Add site update</Link>
        {canRequestMaterials && (
          <Link href={go('#materials')}>＋ Material request</Link>
        )}
        {canUploadCuringPhotos && (
          <Link href={go('#security')}>＋ Curing photo</Link>
        )}
      </div>
    </section>
  );
}
