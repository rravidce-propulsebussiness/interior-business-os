import Link from 'next/link';
import { OwnerIcon } from '../../../owner-shell';

type RecordRow = Record<string, unknown>;
export type SiteActivityProps = {
  projectId: string;
  stage: string;
  isManager: boolean;
  isEngineer: boolean;
  isQuality: boolean;
  isProcurement: boolean;
  isWatchman: boolean;
  isDesign: boolean;
  canSeeManagerUpdates: boolean;
  canViewOperations: boolean;
  reports: RecordRow[];
  updates: RecordRow[];
  checks: RecordRow[];
  materials: RecordRow[];
  gate: RecordRow[];
  media: RecordRow[];
};
function field(row: RecordRow, key: string) {
  const value = row[key];
  return typeof value === 'number' || typeof value === 'string'
    ? String(value)
    : '';
}
function present(value: string) {
  return value.replaceAll('_', ' ');
}
function date(raw: string) {
  if (!raw) return 'Date not recorded';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(parsed);
}
export function SiteActivity(props: SiteActivityProps) {
  const {
    projectId,
    stage,
    isManager,
    isEngineer,
    isQuality,
    isProcurement,
    isWatchman,
    isDesign,
    canSeeManagerUpdates,
    canViewOperations,
    reports,
    updates,
    checks,
    materials,
    gate,
    media,
  } = props;
  const executing = stage === 'execution';
  const deliveryActive = executing || stage === 'handover';
  const canSeeReports = (isEngineer || isQuality) && deliveryActive;
  const canSeeMaterials = (isEngineer || isProcurement) && deliveryActive;
  const canSeeQuality = isQuality && deliveryActive;
  const canSeeGate = isWatchman && deliveryActive;
  const canUpload =
    (isDesign || isEngineer || isQuality) && (stage === 'design' || executing);
  const latest = [...reports].sort((a, b) =>
    field(b, 'report_date').localeCompare(field(a, 'report_date')),
  )[0];
  const latestManager = [...updates].sort((a, b) =>
    field(b, 'report_date').localeCompare(field(a, 'report_date')),
  )[0];
  const sortedEvents = [
    ...(canSeeReports
      ? reports.map((item) => ({
          id: 'report-' + field(item, 'id'),
          type: 'Site report',
          date: field(item, 'created_at') || field(item, 'report_date'),
          detail: field(item, 'completed_work'),
          href: '#daily-reports',
        }))
      : []),
    ...(canSeeManagerUpdates
      ? updates.map((item) => ({
          id: 'manager-' + field(item, 'id'),
          type: 'Manager update',
          date: field(item, 'created_at') || field(item, 'report_date'),
          detail: field(item, 'summary'),
          href: '#manager-updates',
        }))
      : []),
    ...(canSeeGate
      ? gate.map((item) => ({
          id: 'gate-' + field(item, 'id'),
          type: present(field(item, 'kind') || 'Site log'),
          date: field(item, 'created_at'),
          detail: field(item, 'description'),
          href: '#security',
        }))
      : []),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const projectOperations = '/dashboard/operations?project=' + projectId;
  const actions = [
    ...(canSeeReports && executing
      ? [
          {
            key: 'daily',
            label: 'Add daily site report',
            info: 'Work completed, crew and next steps',
            href: '#daily-reports',
            icon: 'calendar' as const,
          },
        ]
      : []),
    ...(isManager && executing
      ? [
          {
            key: 'manager',
            label: 'Manager update',
            info: 'Review work and set priorities',
            href: '#manager-updates',
            icon: 'team' as const,
          },
        ]
      : []),
    ...(canSeeMaterials && executing
      ? [
          {
            key: 'materials',
            label: 'Request site material',
            info: 'Record quantity and requirements',
            href: '#materials',
            icon: 'purchases' as const,
          },
        ]
      : []),
    ...(canSeeQuality && executing
      ? [
          {
            key: 'quality',
            label: 'Record quality inspection',
            info: 'Log and review quality checks',
            href: '#quality',
            icon: 'check' as const,
          },
        ]
      : []),
    ...(canSeeGate && executing
      ? [
          {
            key: 'curing',
            label: 'Security & curing log',
            info: 'Rounds, labour and water curing',
            href: '#security',
            icon: 'calendar' as const,
          },
        ]
      : []),
    ...(canUpload
      ? [
          {
            key: 'upload',
            label: 'Upload project evidence',
            info: 'Plans, site photos and short videos',
            href: '#media',
            icon: 'quotations' as const,
          },
        ]
      : []),
    ...(canViewOperations
      ? [
          {
            key: 'tasks',
            label: 'Tasks & work packages',
            info: 'Open the full execution board',
            href: projectOperations,
            icon: 'projects' as const,
          },
        ]
      : []),
    ...(isManager
      ? [
          {
            key: 'team',
            label: 'Assign project team',
            info: 'Set site access and responsibilities',
            href: '#team',
            icon: 'team' as const,
          },
        ]
      : []),
  ];

  return (
    <section className="sc-command-grid" aria-label="Site activity overview">
      <div className="sc-command-main">
        {canSeeReports && (
          <article className="sc-surface sc-live-report">
            <header className="sc-modern-heading">
              <div>
                <h2>
                  <OwnerIcon name="calendar" size={18} /> Latest site report
                </h2>
                <p>Recorded field progress and the next work plan</p>
              </div>
              <a href="#daily-reports">All reports →</a>
            </header>
            {latest ? (
              <>
                <p className="sc-record-date">
                  {date(field(latest, 'report_date'))}
                </p>
                <div className="sc-report-lead">
                  <strong>
                    {field(latest, 'completed_work') ||
                      'No completion details recorded'}
                  </strong>
                  <span className="sc-report-labour">
                    <OwnerIcon name="team" size={15} />
                    {field(latest, 'worker_count') || '—'} workers reported
                  </span>
                </div>
                <div className="sc-report-split">
                  <div>
                    <strong>Tomorrow's plan</strong>
                    <p>{field(latest, 'tomorrow_plan') || 'No plan entered'}</p>
                  </div>
                  <div>
                    <strong>Blockers & issues</strong>
                    <p>{field(latest, 'blockers') || 'No blockers recorded'}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="sc-empty">
                No site reports yet. Authorized engineers can add the first
                field report.
              </p>
            )}
          </article>
        )}

        {canSeeManagerUpdates && (
          <article className="sc-surface">
            <header className="sc-modern-heading">
              <div>
                <h2>
                  <OwnerIcon name="team" size={18} /> Manager priorities
                </h2>
                <p>Instructions and review notes for site delivery</p>
              </div>
              {deliveryActive && <a href="#manager-updates">View updates →</a>}
            </header>
            {latestManager ? (
              <div className="sc-manager-priorities">
                <span className="sc-record-date">
                  {date(field(latestManager, 'report_date'))}
                </span>
                <p>
                  <strong>Site health</strong>{' '}
                  {present(field(latestManager, 'health') || 'Not recorded')}
                </p>
                <p>
                  <strong>Priority work</strong>{' '}
                  {field(latestManager, 'tomorrow_priorities') ||
                    'No priorities recorded'}
                </p>
                {field(latestManager, 'site_instructions') && (
                  <p>
                    <strong>Instructions</strong>{' '}
                    {field(latestManager, 'site_instructions')}
                  </p>
                )}
              </div>
            ) : (
              <p className="sc-empty">No manager priorities recorded yet.</p>
            )}
          </article>
        )}

        {canSeeMaterials && (
          <article className="sc-surface">
            <header className="sc-modern-heading">
              <div>
                <h2>
                  <OwnerIcon name="purchases" size={18} /> Materials &
                  procurement
                </h2>
                <p>Recent site requests and recorded procurement status</p>
              </div>
              <a href="#materials">All materials →</a>
            </header>
            {materials.length ? (
              <div className="sc-modern-table-wrap">
                <table className="sc-modern-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Quantity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.slice(0, 5).map((item, i) => (
                      <tr key={field(item, 'id') || String(i)}>
                        <td>
                          <strong>{field(item, 'item') || 'Material'}</strong>
                        </td>
                        <td>
                          {field(item, 'quantity') || '—'} {field(item, 'unit')}
                        </td>
                        <td>
                          <span className="sc-mini-pill">
                            {present(field(item, 'status') || 'Requested')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sc-empty">No material requests recorded yet.</p>
            )}
          </article>
        )}

        {canSeeQuality && (
          <article className="sc-surface">
            <header className="sc-modern-heading">
              <div>
                <h2>
                  <OwnerIcon name="check" size={18} /> Quality & curing checks
                </h2>
                <p>Site inspections and checks requiring attention</p>
              </div>
              <a href="#quality">All checks →</a>
            </header>
            {checks.length ? (
              <div className="sc-check-list">
                {checks.slice(0, 5).map((check, i) => (
                  <div key={field(check, 'id') || String(i)}>
                    <span
                      className={
                        'sc-check-dot ' +
                        (field(check, 'status') === 'passed'
                          ? 'sc-check-passed'
                          : '')
                      }
                    >
                      <OwnerIcon name="check" size={12} />
                    </span>
                    <strong>{field(check, 'title') || 'Inspection'}</strong>
                    <span className="sc-mini-pill">
                      {present(field(check, 'status') || 'Pending')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="sc-empty">No project quality checks recorded.</p>
            )}
          </article>
        )}

        {canSeeGate && !canSeeReports && (
          <article className="sc-surface">
            <header className="sc-modern-heading">
              <div>
                <h2>
                  <OwnerIcon name="calendar" size={18} /> Security & curing
                </h2>
                <p>
                  Gate register, material deliveries, labour and site rounds
                </p>
              </div>
              <a href="#security">Open register →</a>
            </header>
            <p className="sc-empty">
              {gate.length} recent security and curing entries available.
            </p>
          </article>
        )}

        <article className="sc-surface">
          <header className="sc-modern-heading">
            <div>
              <h2>
                <OwnerIcon name="calendar" size={18} /> Recent site activity
              </h2>
              <p>Updates you have permission to view</p>
            </div>
          </header>
          {sortedEvents.length ? (
            <div className="sc-activity-list">
              {sortedEvents.map((event) => (
                <a key={event.id} href={event.href}>
                  <span className="sc-activity-bullet" />
                  <div>
                    <strong>{event.type}</strong>
                    <p>{event.detail || 'No summary recorded'}</p>
                    <small>{date(event.date)}</small>
                  </div>
                  <span aria-hidden="true">›</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="sc-empty">
              No recent activity available to your role yet.
            </p>
          )}
        </article>
      </div>

      <aside className="sc-command-aside" aria-label="Site workspace actions">
        <article className="sc-surface sc-actions-panel">
          <header className="sc-modern-heading">
            <div>
              <h2>
                <OwnerIcon name="arrow" size={18} /> Quick actions
              </h2>
              <p>Tools available for your site role</p>
            </div>
          </header>
          {actions.length ? (
            <div className="sc-modern-actions">
              {actions.map((action) => (
                <a key={action.key} href={action.href}>
                  <span className="sc-action-icon">
                    <OwnerIcon name={action.icon} size={18} />
                  </span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.info}</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="sc-empty">
              No editing actions are available for your current role or project
              stage.
            </p>
          )}
        </article>

        {(isDesign || isEngineer || isQuality) && (
          <article className="sc-surface">
            <header className="sc-modern-heading">
              <div>
                <h2>
                  <OwnerIcon name="quotations" size={18} /> Photos & documents
                </h2>
                <p>Protected attachments; no stock images</p>
              </div>
              {canUpload && <a href="#media">Upload →</a>}
            </header>
            {media.length ? (
              <div className="sc-photo-files">
                {media.slice(0, 4).map((file) => (
                  <Link
                    href={
                      '/dashboard/projects/' +
                      projectId +
                      '/site/media/' +
                      String(file.id)
                    }
                    key={String(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="sc-file-icon">
                      <OwnerIcon name="quotations" size={18} />
                    </span>
                    <span>
                      <strong>{field(file, 'filename') || 'Site file'}</strong>
                      <small>
                        {present(field(file, 'category') || 'Evidence')}
                      </small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="sc-empty">No site media has been uploaded yet.</p>
            )}
          </article>
        )}
      </aside>
    </section>
  );
}
