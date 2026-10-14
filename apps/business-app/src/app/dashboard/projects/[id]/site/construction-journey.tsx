import Image from 'next/image';
import { StageRecordLinker, type StageLinkOption } from './stage-record-linker';
import Link from 'next/link';
import type { ConstructionPlanningData } from './construction-planning-panel';
import './construction-journey.css';

type SiteRecord = Record<string, unknown>;
export type ConstructionStageRecordData = {
  links: { stage_id: string; kind: string; record_id: string }[];
  payments: {
    stage_id: string;
    item_id: string;
    contract_id: string;
    label: string;
    amount: string;
    due_date: string | null;
    currency: string;
    contract_number: string;
    request_number: string | null;
    request_status: string | null;
  }[];
  options: {
    id: string;
    contract_id: string;
    label: string;
    amount: string;
    currency: string;
    contract_number: string;
  }[];
};
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
  stageRecords?: ConstructionStageRecordData | null;
  canLinkRecords?: boolean;
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
  stageRecords,
  canLinkRecords = false,
}: JourneyProps) {
  const base = `/dashboard/projects/${projectId}/site`;
  const linkedRecords = (
    stageId: string,
    kind: string,
    records: SiteRecord[],
  ) => {
    const associated = new Set(
      (stageRecords?.links ?? [])
        .filter((item) => item.stage_id === stageId && item.kind === kind)
        .map((item) => item.record_id),
    );
    return records.filter((record) => associated.has(value(record, 'id')));
  };
  const stageOptions: StageLinkOption[] = [
    ...reports.map((item) => ({
      kind: 'report' as const,
      id: value(item, 'id'),
      label: `${date(value(item, 'report_date'))}: ${value(item, 'completed_work').slice(0, 75)}`,
    })),
    ...materials.map((item) => ({
      kind: 'material' as const,
      id: value(item, 'id'),
      label: `${value(item, 'item')} · ${value(item, 'quantity')} ${value(item, 'unit')}`,
    })),
    ...media.filter((item) => value(item, 'category') !== 'agreement').map((item) => ({
      kind: 'media' as const,
      id: value(item, 'id'),
      label: `${human(value(item, 'category'))}: ${value(item, 'caption') || value(item, 'filename')}`,
    })),
    ...checks.map((item) => ({
      kind: 'check' as const,
      id: value(item, 'id'),
      label: `${value(item, 'title')} · ${human(value(item, 'status'))}`,
    })),
    ...gate.filter((item) => value(item, 'kind') === 'curing').map((item) => ({
      kind: 'curing_round' as const,
      id: value(item, 'id'),
      label: `${date(value(item, 'created_at'))}: ${value(item, 'description').slice(0, 70)}`,
    })),
    ...(canSeeFinance ? stageRecords?.options ?? [] : []).map((item) => ({
      kind: 'payment' as const,
      id: item.id,
      contractId: item.contract_id,
      label: `${item.contract_number}: ${item.label} · ${item.currency} ${item.amount}`,
    })),
  ];
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
            const stageMaterials = linkedRecords(stage.id, 'material', materials);
            const stageReports = linkedRecords(stage.id, 'report', reports);
            const stageChecks = linkedRecords(stage.id, 'check', checks);
            const stageMedia = linkedRecords(stage.id, 'media', media);
            const stageRounds = linkedRecords(stage.id, 'curing_round', gate);
            const stagePayments = (stageRecords?.payments ?? [])
              .filter((item) => item.stage_id === stage.id);
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
                          {canSeeFinance
                            ? stagePayments.length
                              ? `${stagePayments.length} linked`
                              : 'Not linked'
                            : 'Restricted'}
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
                          {canSeeFinance && stagePayments.length ? (
                            <ul className="cj-materials">
                              {stagePayments.map((payment) => (
                                <li key={payment.item_id}>
                                  <span>
                                    <strong>{payment.label}</strong>
                                    <span className="cj-currency">
                                      {payment.currency} {payment.amount}
                                      {payment.due_date ? ` · Due ${date(payment.due_date)}` : ''}
                                    </span>
                                  </span>
                                  <em>
                                    {payment.request_number
                                      ? `${payment.request_number} · ${human(payment.request_status ?? 'issued')}`
                                      : 'Not requested'}
                                  </em>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>
                              {canSeeFinance
                                ? 'No approved payment schedule item is assigned to this stage.'
                                : 'Financial details require Billing permission.'}
                            </p>
                          )}
                          <p className="cj-caption">
                            Linked values come from the contract schedule. Request
                            status is not proof of payment; invoices, allocations
                            and receipts stay in Billing.
                          </p>
                        </div>
                      </div>
                    </div>
                    {stageRecords && (
                      <div className="cj-subcard cj-stage-linked">
                        <div className="cj-subhead">
                          <h4>Records assigned to this construction stage</h4>
                          <span className="cj-count">
                            {stageReports.length + stageMaterials.length +
                              stageMedia.length + stageChecks.length + stageRounds.length} records
                          </span>
                        </div>
                        {stageReports.length > 0 && (
                          <div className="cj-linked-group">
                            <strong>Engineer updates</strong>
                            {stageReports.map((item) => (
                              <p key={value(item, 'id')}>
                                {date(value(item, 'report_date'))}: {value(item, 'completed_work')}
                                {value(item, 'tomorrow_plan') && ` · Tomorrow: ${value(item, 'tomorrow_plan')}`}
                              </p>
                            ))}
                          </div>
                        )}
                        {stageMaterials.length > 0 && (
                          <div className="cj-linked-group">
                            <strong>Materials</strong>
                            <ul className="cj-materials">
                              {stageMaterials.map((item) => (
                                <li key={value(item,'id')}>
                                  <span>{value(item,'item')} · {value(item,'quantity')} {value(item,'unit')}</span>
                                  <em>{human(value(item,'status'))}</em>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {stageChecks.length > 0 && (
                          <div className="cj-linked-group">
                            <strong>Site checks (informal)</strong>
                            {stageChecks.map((item) => (
                              <p key={value(item,'id')}>
                                {value(item,'title')} · {human(value(item,'status'))}
                              </p>
                            ))}
                            <p className="cj-caption">
                              Informal notes do not replace independent formal QC.
                            </p>
                          </div>
                        )}
                        {stageMedia.length > 0 && (
                          <div className="cj-linked-group">
                            <strong>Stage photos and evidence</strong>
                            <div className="cj-gallery">
                              {stageMedia.map((item) => (
                                <EvidenceTile key={value(item,'id')} item={item} projectId={projectId} />
                              ))}
                            </div>
                          </div>
                        )}
                        {stageRounds.length > 0 && (
                          <div className="cj-linked-group">
                            <strong>Curing rounds</strong>
                            {stageRounds.map((item) => (
                              <p key={value(item,'id')}>
                                {date(value(item,'created_at'))}: {value(item,'description')}
                              </p>
                            ))}
                          </div>
                        )}
                        {!stageReports.length && !stageMaterials.length &&
                          !stageMedia.length && !stageChecks.length && !stageRounds.length && (
                            <p>No site updates, materials or photos have been assigned to this stage yet.</p>
                          )}
                        {canLinkRecords && (
                          <StageRecordLinker
                            projectId={projectId}
                            stageId={stage.id}
                            options={stageOptions}
                          />
                        )}
                      </div>
                    )}
                    {active && (
                      <div className="cj-activity">
                        <div className="cj-section-title">
                          <div>
                            <h4>Site records &amp; tomorrow&apos;s plan</h4>
                            <p>
                              Recent project-wide activity below is for context only.
                              Stage-specific evidence appears in the section above.
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
                                    Tomorrow&apos;s labour requirement:
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
                                <strong>Manager&apos;s next priorities:</strong>{' '}
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
