import Link from 'next/link';
import { z } from 'zod';
import { canAccess } from '@business-os/auth';
import { operationsPermissions } from '@business-os/core/operations';
import { OwnerIcon, OwnerShell, type OwnerIconName } from '../owner-shell';
import { projectWorkspaceNavigation } from '../projects/project-workspace-navigation';
import { operationsServices } from './service';
import '../owner-dashboard.css';
import './operations-dashboard.css';

export const dynamic = 'force-dynamic';

const numberFormat = new Intl.NumberFormat('en-IN');
const projectIdSchema = z.uuid();
const sections = [
  'project_execution_members',
  'execution_plans',
  'work_packages',
  'project_milestones',
  'project_tasks',
  'inventory_locations',
  'material_issue_requests',
  'inventory_transactions',
  'vendor_execution_profiles',
  'subcontractor_work_orders',
  'work_measurements',
  'inspection_templates',
  'project_inspections',
  'project_snags',
  'handover_templates',
  'handover_records',
] as const;

type Row = Record<string, unknown>;
type RowsResult = { rows: Row[]; total: number; page: number; page_size: 25 };
type Resource = PromiseSettledResult<RowsResult | null> | undefined;

function retrieved(result: Resource): RowsResult | null {
  return result?.status === 'fulfilled' ? result.value : null;
}
function value(row: Row, key: string) {
  const field = row[key];
  return typeof field === 'number' || typeof field === 'string'
    ? String(field)
    : '';
}
function label(raw: string) {
  return raw.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function number(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function progressValue(raw: unknown) {
  const parsed = number(raw);
  return parsed === null ? null : Math.max(0, Math.min(100, parsed));
}
function address(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Site address not recorded';
  const object = raw as Record<string, unknown>;
  const parts = [object.city, object.region]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()));
  return parts.join(', ') || (typeof object.line1 === 'string' && object.line1.trim()) || 'Site address not recorded';
}
function date(raw: unknown) {
  const value = typeof raw === 'string' ? raw : '';
  if (!value) return 'Not scheduled';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
}
function displayAmount(raw: unknown) {
  const parsed = number(raw);
  return parsed === null ? (raw === null || raw === undefined ? '—' : String(raw)) : numberFormat.format(parsed);
}
function accountName(email: string) {
  return (email.split('@')[0] ?? '').split(/[._-]/).filter(Boolean).slice(0, 2).map(label).join(' ') || 'Company member';
}
function Metric({
  label: title,
  value: metric,
  detail,
  tone,
  icon,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'red' | 'amber' | 'blue' | 'green';
  icon: OwnerIconName;
  href?: string;
}) {
  const children = (
    <>
      <span className={'ops-metric-symbol ops-symbol-' + tone}><OwnerIcon name={icon} size={19}/></span>
      <div className="ops-metric-copy">
        <span>{title}</span>
        <strong>{metric}</strong>
        <small>{detail}</small>
      </div>
    </>
  );
  return href
    ? <Link href={href} className={'ops-metric ops-metric-' + tone}>{children}</Link>
    : <div className={'ops-metric ops-metric-' + tone}>{children}</div>;
}
function PanelHeading({
  title,
  detail,
  icon,
  href,
}: {
  title: string;
  detail: string;
  icon: OwnerIconName;
  href?: string;
}) {
  return (
    <div className="ops-panel-heading">
      <div>
        <h2><OwnerIcon name={icon} size={18}/>{title}</h2>
        <p>{detail}</p>
      </div>
      {href && <Link href={href}>View all <OwnerIcon name="arrow" size={14}/></Link>}
    </div>
  );
}
function Empty({ detail }: { detail: string }) {
  return <p className="ops-empty">{detail}</p>;
}
function Action({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: OwnerIconName;
}) {
  return (
    <Link className="ops-action" href={href}>
      <span><OwnerIcon name={icon} size={19}/></span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <OwnerIcon name="arrow" size={16}/>
    </Link>
  );
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; query?: string; page?: string }>;
}) {
  const params = await searchParams;
  const s = await operationsServices('execution.view', true);
  const query = (params.query ?? '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
  const requestedId = params.project ?? '';
  const projectId = projectIdSchema.safeParse(requestedId).success ? requestedId : '';
  const has = (permission: string, moduleKey?: string) =>
    canAccess(s.context, {
      organizationId: s.context.organizationId,
      permission,
      ...(moduleKey ? { moduleKey } : {}),
    });

  const [organization, user, plans, projects, projectResponse] = await Promise.all([
    s.repository.organization(s.context.organizationId),
    s.authorization.requireAuthenticatedUser(),
    s.repository.plans().catch(() => []),
    s.operations.options('projects', undefined, query, page),
    projectId
      ? s.client.from('projects')
        .select('id,name,code,status,project_type,site_address')
        .eq('organization_id', s.context.organizationId)
        .eq('id', projectId)
        .maybeSingle()
      : Promise.resolve(null),
  ]);
  if (!organization) throw new Error('Company workspace unavailable');
  const selected = projectResponse && !projectResponse.error ? projectResponse.data : null;
  const scopedProject = selected?.id ?? '';
  const summary = scopedProject ? await s.operations.dashboard(scopedProject) : null;
  const permitted = {
    work: s.allowed(operationsPermissions.work_packages),
    tasks: s.allowed(operationsPermissions.project_tasks),
    materials: s.allowed('inventory.view'),
    quality: s.allowed(operationsPermissions.project_inspections),
    snags: s.allowed(operationsPermissions.project_snags),
  };

  const resources = scopedProject
    ? await Promise.allSettled([
        permitted.work ? s.operations.search('work_packages', { project_id: scopedProject }) : Promise.resolve(null),
        permitted.tasks ? s.operations.search('project_tasks', { project_id: scopedProject }) : Promise.resolve(null),
        permitted.materials ? s.operations.materials(scopedProject) : Promise.resolve(null),
        s.operations.timeline(scopedProject),
      ])
    : null;
  const work = retrieved(resources?.[0]);
  const tasks = retrieved(resources?.[1]);
  const materials = retrieved(resources?.[2]);
  const timeline = retrieved(resources?.[3]);
  const progress = progressValue(summary?.progress);
  const blocked = number(summary?.blocked_tasks);
  const overdue = number(summary?.overdue_tasks);
  const snags = number(summary?.open_snags);
  const readiness = summary?.readiness;
  const readinessState =
    readiness && typeof readiness === 'object' && !Array.isArray(readiness)
      ? (readiness as Record<string, unknown>).ready
      : undefined;

  const base = '/dashboard/operations';
  const projectQuery = scopedProject ? '?project=' + encodeURIComponent(scopedProject) : '';
  const projectHref = '/dashboard/projects/' + scopedProject;
  const opsHref = (entity: string) => base + '/' + entity + projectQuery;
  const commandHref = (command: string) => base + '/command/' + command + projectQuery;
  const nav = projectWorkspaceNavigation(has);
  const planName = plans.find((plan) => plan.id === organization.plan_id)?.name ?? 'Business plan';
  const userEmail = user.email ?? '';
  const allSections = sections.filter((section) => s.allowed(operationsPermissions[section]));
  const isReady = readinessState === true;
  const hasReadiness = readinessState === true || readinessState === false;

  return (
    <OwnerShell
      companyName={organization.name}
      accountLabel={accountName(userEmail)}
      accountEmail={userEmail}
      planLabel={planName}
      navigation={nav}
      search={query}
      notificationsEnabled={has('notification.view')}
      currentHref="/dashboard/projects"
    >
      <main id="main-content" tabIndex={-1} className="ops-dashboard">
        <nav aria-label="Breadcrumb" className="ops-breadcrumb">
          <Link href="/dashboard/projects">Projects</Link>
          {scopedProject && <><span>›</span><Link href={projectHref}>Project details</Link></>}
          <span>›</span><strong>Operations</strong>
        </nav>
        <div className="ops-hero">
          <div className="ops-hero-title">
            <span className="ops-hero-icon"><OwnerIcon name="projects" size={27}/></span>
            <div>
              <h1>Project Execution</h1>
              <p>Plan, track and complete every site activity.</p>
            </div>
          </div>
          <div className="ops-hero-actions">
            {scopedProject && <Link href={projectHref} className="ops-outline-button">Project details <OwnerIcon name="arrow" size={15}/></Link>}
            {scopedProject && <Link href={projectHref + '/site'} className="ops-primary-button"><OwnerIcon name="plus" size={17}/> Site updates</Link>}
          </div>
        </div>

        <section className="ops-selector" aria-label="Project selector">
          <form method="get" action={base} className="ops-picker">
            <label htmlFor="ops-project">Active project workspace</label>
            <div>
              <select name="project" id="ops-project" defaultValue={scopedProject} required>
                <option value="">Select a project</option>
                {selected && !projects.rows.some((row) => row.id === scopedProject) &&
                  <option value={scopedProject}>{selected.name}</option>}
                {projects.rows.map((row) =>
                  <option key={row.id} value={row.id}>{row.label}</option>,
                )}
              </select>
              <button type="submit">Open project <OwnerIcon name="arrow" size={15}/></button>
            </div>
          </form>
          <form method="get" action={base} className="ops-project-search">
            {scopedProject && <input type="hidden" name="project" value={scopedProject}/>}
            <label htmlFor="ops-find">Find another project</label>
            <div>
              <input id="ops-find" type="search" maxLength={100} name="query" defaultValue={query} placeholder="Search project names"/>
              <button type="submit"><OwnerIcon name="search" size={17}/><span>Search</span></button>
            </div>
          </form>
          <div className="ops-picker-pagination">
            {page > 1 && <Link href={base + '?query=' + encodeURIComponent(query) + '&page=' + (page - 1)}>← Previous</Link>}
            {projects.has_more && <Link href={base + '?query=' + encodeURIComponent(query) + '&page=' + (page + 1)}>More →</Link>}
          </div>
        </section>

        {!scopedProject ? (
          <section className="ops-no-project">
            <span className="ops-no-project-icon"><OwnerIcon name="projects" size={28}/></span>
            <h2>{requestedId ? 'Project unavailable' : 'Choose a project to begin'}</h2>
            <p>{requestedId
              ? 'Select an accessible company project to view its execution records.'
              : 'Select a project to see actual site progress, tasks, materials, inspections and handover readiness.'}</p>
            <Link href="/dashboard/projects">Browse company projects →</Link>
          </section>
        ) : (
          <>
            <section className="ops-summary" aria-label="Execution overview">
              <div className="ops-project-identity">
                <span className={'ops-status ' + (selected?.status === 'active' ? 'ops-status-active' : 'ops-status-neutral')}>
                  {label(selected?.status ?? 'inactive')}
                </span>
                <h2>{selected?.name ?? 'Project'}</h2>
                <p>{selected?.code || 'Project'} · {label(selected?.project_type || 'Site execution')}</p>
                <small><OwnerIcon name="globe" size={15}/>{address(selected?.site_address)}</small>
              </div>
              <div className="ops-progress-box">
                <div
                  className="ops-progress-ring"
                  role="img"
                  aria-label={progress === null ? 'Progress not available' : 'Execution progress ' + progress.toFixed(1) + ' percent'}
                  style={{
                    background: progress === null
                      ? '#e4ecf7'
                      : 'conic-gradient(#1768ed ' + progress + '%, #e4ecf7 0)',
                  }}
                >
                  <div>{progress === null ? '—' : progress.toFixed(0) + '%'}</div>
                </div>
                <strong>Overall execution</strong>
                <small>{progress === null ? 'Not available' : 'Reported by execution engine'}</small>
              </div>
              <div className="ops-summary-metrics">
                <Metric label="Blocked tasks" value={blocked === null ? '—' : displayAmount(blocked)} detail="Needs attention" tone="red" icon="close" href={permitted.tasks ? opsHref('project_tasks') : undefined}/>
                <Metric label="Overdue tasks" value={overdue === null ? '—' : displayAmount(overdue)} detail="Past planned due date" tone="amber" icon="calendar" href={permitted.tasks ? opsHref('project_tasks') : undefined}/>
                <Metric label="Open snags" value={snags === null ? '—' : displayAmount(snags)} detail="Awaiting resolution" tone="blue" icon="projects" href={permitted.snags ? opsHref('project_snags') : undefined}/>
                <Metric label="Handover readiness" value={hasReadiness ? isReady ? 'Ready' : 'Pending' : '—'} detail={hasReadiness ? isReady ? 'Gates satisfied' : 'Checks outstanding' : 'Not assessed'} tone="green" icon="check" href={base + '/closure' + projectQuery}/>
              </div>
            </section>

            <nav className="ops-section-nav" aria-label="Execution sections">
              <a href="#overview" className="ops-nav-selected">Overview</a>
              <Link href={base + '/scope' + projectQuery}>Approved Scope</Link>
              {permitted.work && <Link href={opsHref('work_packages')}>Work Packages</Link>}
              {s.allowed(operationsPermissions.project_milestones) && <Link href={opsHref('project_milestones')}>Milestones</Link>}
              {permitted.tasks && <Link href={opsHref('project_tasks')}>Tasks</Link>}
              {permitted.materials && <Link href={base + '/materials' + projectQuery}>Materials & Stock</Link>}
              {permitted.quality && <Link href={opsHref('project_inspections')}>Inspections</Link>}
              {permitted.snags && <Link href={opsHref('project_snags')}>Snags</Link>}
              <Link href={base + '/timeline' + projectQuery}>Timeline</Link>
              <Link href={base + '/documents' + projectQuery}>Documents</Link>
              <Link href={base + '/closure' + projectQuery}>Handover</Link>
            </nav>

            <div className="ops-grid" id="overview">
              <div className="ops-primary-column">
                <section className="ops-panel">
                  <PanelHeading title="Work Packages" detail="Track defined scopes of work and execution state." icon="projects" href={permitted.work ? opsHref('work_packages') : undefined}/>
                  {!permitted.work ? <Empty detail="Work packages require execution access."/>
                  : !work ? <Empty detail="Work packages could not be loaded. Try again."/>
                  : work.rows.length ? (
                    <div className="ops-table-scroll">
                      <table className="ops-table">
                        <thead><tr><th>Work package</th><th>Progress</th><th>Scope state</th></tr></thead>
                        <tbody>
                          {work.rows.slice(0, 5).map((row, index) => {
                            const valuePct = progressValue(row.completion_percentage);
                            return <tr key={value(row, 'id') || String(index)}>
                              <td><Link href={opsHref('work_packages') + '#main-content'} className="ops-record-link">{value(row, 'name') || 'Work package'}</Link><small>{value(row, 'notes') || 'Scope details in workspace'}</small></td>
                              <td>{valuePct === null ? <span className="ops-dash">Not measured</span>
                                : <div className="ops-progress-inline"><span><i style={{ width: valuePct + '%' }}/></span><b>{valuePct.toFixed(0)}%</b></div>}</td>
                              <td><span className="ops-table-pill">{label(value(row, 'scope_state') || 'Not specified')}</span></td>
                            </tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <Empty detail="No work packages recorded for this project yet."/>}
                </section>

                <section className="ops-panel">
                  <PanelHeading title="Materials & Inventory" detail="Recorded quantities and site material availability." icon="purchases" href={permitted.materials ? base + '/materials' + projectQuery : undefined}/>
                  {!permitted.materials ? <Empty detail="Material usage requires inventory access."/>
                  : !materials ? <Empty detail="Material usage could not be loaded."/>
                  : materials.rows.length ? (
                    <div className="ops-table-scroll">
                      <table className="ops-table">
                        <thead><tr><th>Material</th><th>Purchased</th><th>Received</th><th>Issued</th><th>Shortage</th></tr></thead>
                        <tbody>{materials.rows.slice(0, 5).map((row, index) =>
                          <tr key={value(row, 'variant_id') + ':' + value(row, 'unit') + ':' + index}>
                            <td><strong>{value(row, 'material') || 'Material'}</strong><small>{value(row, 'unit') || 'Unit not set'}</small></td>
                            <td>{displayAmount(row.purchased)}</td>
                            <td>{displayAmount(row.received)}</td>
                            <td>{displayAmount(row.issued)}</td>
                            <td>{displayAmount(row.shortage)}</td>
                          </tr>,
                        )}</tbody>
                      </table>
                    </div>
                  ) : <Empty detail="No material usage has been recorded yet."/>}
                </section>
              </div>

              <div className="ops-secondary-column">
                <section className="ops-panel">
                  <PanelHeading title="Site Tasks" detail="Priorities and deadlines for active site work." icon="check" href={permitted.tasks ? opsHref('project_tasks') : undefined}/>
                  {!permitted.tasks ? <Empty detail="Tasks require project task access."/>
                  : !tasks ? <Empty detail="Tasks could not be loaded."/>
                  : tasks.rows.length ? (
                    <div className="ops-table-scroll">
                      <table className="ops-table">
                        <thead><tr><th>Task</th><th>Priority</th><th>Due date</th><th>Status</th></tr></thead>
                        <tbody>{tasks.rows.slice(0, 6).map((row, index) =>
                          <tr key={value(row, 'id') || String(index)}>
                            <td><Link className="ops-record-link" href={opsHref('project_tasks')}>{value(row, 'title') || 'Site task'}</Link></td>
                            <td><span className={'ops-priority ops-priority-' + (value(row, 'priority') || 'normal')}>{label(value(row, 'priority') || 'Normal')}</span></td>
                            <td>{date(row.planned_end)}</td>
                            <td><span className="ops-table-pill">{label(value(row, 'status') || 'Not started')}</span></td>
                          </tr>,
                        )}</tbody>
                      </table>
                    </div>
                  ) : <Empty detail="No site tasks are registered for this project yet."/>}
                </section>

                <section className="ops-panel ops-quality">
                  <PanelHeading title="Quality & Snag Tracker" detail="Inspect workmanship and resolve outstanding issues." icon="check" href={permitted.quality ? opsHref('project_inspections') : permitted.snags ? opsHref('project_snags') : undefined}/>
                  <div className="ops-quality-layout">
                    <div className="ops-quality-count">
                      <span className="ops-quality-icon"><OwnerIcon name="check" size={27}/></span>
                      <div><strong>{snags === null ? '—' : displayAmount(snags)}</strong><small>Open snags</small></div>
                    </div>
                    <div className="ops-quality-links">
                      {permitted.quality && <Link href={opsHref('project_inspections')}>Inspections <OwnerIcon name="arrow" size={14}/></Link>}
                      {permitted.snags && <Link href={opsHref('project_snags')}>View snags <OwnerIcon name="arrow" size={14}/></Link>}
                      <Link href={base + '/closure' + projectQuery}>Completion checks <OwnerIcon name="arrow" size={14}/></Link>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="ops-side-column">
                <section className="ops-panel ops-actions-panel">
                  <PanelHeading title="Quick Actions" detail="Common on-site workflows." icon="arrow"/>
                  <div className="ops-actions">
                    {s.allowed('execution.manage') && <>
                      <Action href={commandHref('save_work_packages')} title="Create work package" description="Define a project work scope" icon="projects"/>
                    </>}
                    {s.allowed('task.manage') && <Action href={commandHref('save_project_tasks')} title="Add site task" description="Create a task and assign priorities" icon="check"/>}
                    {s.allowed('material_issue.request') && <Action href={commandHref('request_create')} title="Request material" description="Raise a project material request" icon="purchases"/>}
                    {s.allowed('inspection.create') && <Action href={commandHref('inspection_create')} title="Record inspection" description="Start a project inspection" icon="quotations"/>}
                    {s.allowed('snag.create') && <Action href={opsHref('project_snags')} title="Raise snag" description="Report a quality issue" icon="close"/>}
                    <Action href={base + '/closure' + projectQuery} title="Completion review" description="View handover readiness gates" icon="calendar"/>
                    <Action href={projectHref + '/site'} title="Site updates & evidence" description="Daily reports and field updates" icon="team"/>
                  </div>
                </section>
              </aside>
            </div>

            <section className="ops-panel ops-activity">
              <PanelHeading title="Recent Site Activity" detail="Latest operational events and changes." icon="calendar" href={base + '/timeline' + projectQuery}/>
              {!timeline ? <Empty detail="Recent activity could not be loaded."/>
              : timeline.rows.length ? (
                <div className="ops-activity-list">
                  {timeline.rows.slice(0, 6).map((row, index) =>
                    <div className="ops-activity-event" key={value(row, 'id') || String(index)}>
                      <span className="ops-event-icon"><OwnerIcon name="check" size={17}/></span>
                      <div><strong>{label(value(row, 'action') || 'Project update')}</strong>
                        <small>{label(value(row, 'entity_type') || 'Execution')} · {date(row.created_at)}</small>
                        {value(row, 'note') && <p>{value(row, 'note')}</p>}
                      </div>
                    </div>,
                  )}
                </div>
              ) : <Empty detail="No site activity has been recorded yet."/>}
            </section>

            <details className="ops-more">
              <summary><OwnerIcon name="projects" size={17}/> All execution modules <span>{allSections.length} available</span></summary>
              <div className="ops-more-grid">
                {allSections.map((entity) =>
                  <Link key={entity} href={opsHref(entity)}><OwnerIcon name="arrow" size={14}/>{label(entity)}</Link>,
                )}
                {s.allowed('inventory.view') && <Link href={base + '/stock' + projectQuery}>Stock balances</Link>}
                {s.allowed('cost.execution.view') && <Link href={'/dashboard/execution/costs' + projectQuery}>Cost summary</Link>}
                <Link href={'/dashboard/execution' + projectQuery}>Estimates & procurement</Link>
                <Link href={base + '/documents' + projectQuery}>Project documents</Link>
              </div>
            </details>
          </>
        )}
      </main>
    </OwnerShell>
  );
}
