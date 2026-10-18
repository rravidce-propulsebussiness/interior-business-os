import Link from 'next/link';
import { activeOrganization, pageServices } from '@business-os/auth/server';
import { canAccess } from '@business-os/auth';
import { reportFilterSchema, reportKinds } from '@business-os/core/automation';
import { createReportingRepository } from '@business-os/database/reporting';
import { createGstRepository, type GstDocumentRow } from '@business-os/database/gst';
import { OwnerIcon, OwnerShell, type OwnerIconName } from '../owner-shell';
import { ownerWorkspaceNavigation } from '../owner-workspace-navigation';
import { reportPermissions } from './service';
import { saveReport } from './actions';
import '../owner-dashboard.css';
import '../command-centre.css';
import './reports-home.css';

export const dynamic = 'force-dynamic';

type Kind = (typeof reportKinds)[number];
type Period = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
type Query = { period?: string; from?: string; to?: string; projectId?: string };
type SavedReport = { id: string; kind: Kind; createdAt: string };
type ProjectRecord = { id: string; name: string; status: string };

const families: {
  title: string; description: string; icon: OwnerIconName; kinds: Kind[];
}[] = [
  { title: 'CRM & Sales', description: 'Leads, quotations and conversion', icon: 'leads', kinds: ['crm', 'sales'] },
  { title: 'Finance', description: 'Invoices, receivables and project costs', icon: 'billing', kinds: ['billing', 'receivables', 'cost'] },
  { title: 'Projects & Execution', description: 'Progress, inspections and handover', icon: 'projects', kinds: ['projects', 'execution', 'snags', 'handover'] },
  { title: 'Materials & Procurement', description: 'Purchases and material inventory', icon: 'purchases', kinds: ['procurement', 'inventory'] },
  { title: 'Subcontractors', description: 'Work orders and measurement records', icon: 'team', kinds: ['subcontractors'] },
];

const reportNames: Record<Kind, string> = {
  crm: 'CRM & Leads', sales: 'Sales & Quotations', billing: 'Billing',
  receivables: 'Receivables', projects: 'Projects', procurement: 'Procurement',
  inventory: 'Materials & Inventory', execution: 'Execution',
  snags: 'Site Issues', handover: 'Handover', cost: 'Project Costs',
  subcontractors: 'Subcontractors',
};
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const countFormat = new Intl.NumberFormat('en-IN');

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 10000000) return '₹' + (value / 10000000).toFixed(2).replace(/\.?0+$/, '') + 'Cr';
  if (Math.abs(value) >= 100000) return '₹' + (value / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L';
  return inr.format(value);
}
function localDay(zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? '01';
  return get('year') + '-' + get('month') + '-' + get('day');
}
function selectedDates(today: string, query: Query): { period: Period; from: string; to: string } {
  const allowed: Period[] = ['today', 'week', 'month', 'quarter', 'year', 'custom'];
  const period: Period = allowed.includes(query.period as Period) ? query.period as Period : 'month';
  const date = new Date(today + 'T12:00:00Z');
  let from = today.slice(0, 7) + '-01';
  if (period === 'today') from = today;
  if (period === 'week') {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    from = date.toISOString().slice(0, 10);
  }
  if (period === 'quarter') {
    from = today.slice(0, 4) + '-' + String(Math.floor(date.getUTCMonth() / 3) * 3 + 1).padStart(2, '0') + '-01';
  }
  if (period === 'year') from = today.slice(0, 4) + '-01-01';
  const custom = reportFilterSchema.safeParse({ from: query.from, to: query.to });
  if (period === 'custom' && custom.success) return { period, from: custom.data.from, to: custom.data.to };
  return { period, from, to: today };
}
function periodUrl(kind: Kind, from: string, to: string, projectId: string | null): string {
  const query = new URLSearchParams({ from, to });
  if (projectId) query.set('projectId', projectId);
  return '/dashboard/reports/' + kind + '?' + query.toString();
}
function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function Trend({ documents }: { documents: GstDocumentRow[] | null }) {
  const now = new Date();
  now.setUTCDate(1);
  const rows = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6 + index, 1));
    const month = date.toISOString().slice(0, 7);
    return {
      month, label: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(date),
      invoiced: documents?.filter((doc) => doc.kind === 'sales_invoice' && doc.status === 'issued' && doc.date.startsWith(month))
        .reduce((total, doc) => total + safeNumber(doc.total), 0) ?? 0,
      expenses: documents?.filter((doc) => doc.kind === 'purchase_bill' && doc.status === 'recorded' && doc.date.startsWith(month))
        .reduce((total, doc) => total + safeNumber(doc.total), 0) ?? 0,
    };
  });
  const max = Math.max(1, ...rows.flatMap((row) => [row.invoiced, row.expenses]));
  const points = rows.map((row, index) =>
    ((index + 0.5) * 700 / rows.length).toFixed(1) + ',' + (149 - row.expenses / max * 132).toFixed(1)
  ).join(' ');
  return <section className="rp-panel rp-trend">
    <div className="rp-panel-head">
      <div><h2>Financial Performance Trend</h2><p>Issued invoices vs recorded expenses · last 7 months</p></div>
      <span className="rp-tag">Monthly</span>
    </div>
    {documents === null ? <div className="rp-chart-empty">Financial records are unavailable for your access level.</div> :
      <div className="rp-trend-plot" role="img" aria-label="Last seven months of invoiced amounts shown as orange bars and recorded expenses shown as a green line">
        <div className="rp-chart-grid" aria-hidden="true">
          <span>{money(max)}</span><span>{money(max / 2)}</span><span>₹0</span>
        </div>
        <div className="rp-chart-body">
          <div className="rp-chart-bars">
            {rows.map((row) => <div className="rp-chart-column" key={row.month}>
              <div className="rp-bar-track">
                <span className="rp-bar" style={{ height: (row.invoiced ? Math.max(2, row.invoiced / max * 100) : 0) + '%' }} title={row.label + ': invoiced ' + money(row.invoiced)} />
              </div>
              <span className="rp-month-label">{row.label}</span>
            </div>)}
          </div>
          <svg className="rp-chart-line" viewBox="0 0 700 160" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} fill="none" stroke="#119960" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
            {rows.map((row, index) => <circle key={row.month} cx={(index + 0.5) * 700 / rows.length} cy={149 - row.expenses / max * 132} r="5" fill="#fff" stroke="#119960" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
          </svg>
        </div>
      </div>}
    <div className="rp-chart-legend"><span><i className="rp-legend-orange"/> Invoiced</span><span><i className="rp-legend-green"/> Recorded expenses</span></div>
  </section>;
}

function Metric({ title, value, description, icon, href, tone = 'orange' }: {
  title: string; value: string; description: string; icon: OwnerIconName;
  href?: string | undefined; tone?: 'orange' | 'green';
}) {
  const children = <>
    <span className={'rp-metric-icon rp-icon-' + tone}><OwnerIcon name={icon} size={23}/></span>
    <span className="rp-metric-body"><span>{title}</span><strong>{value}</strong><small>{description}</small></span>
    <span className="rp-metric-spark" aria-hidden="true"><svg viewBox="0 0 70 30"><polyline points="0,26 15,19 27,23 41,10 52,13 70,2" stroke={tone === 'green' ? '#14ad72' : '#fe651a'} strokeWidth="2" fill="none"/></svg></span>
  </>;
  return href ? <Link className="rp-metric" href={href}>{children}</Link>
    : <article className="rp-metric">{children}</article>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { repository, client, user } = await pageServices();
  const context = await activeOrganization();
  if (!context) return <main id="main-content" className="rp-no-company"><h1>Choose a company to view reports.</h1><Link href="/dashboard">Back to dashboard</Link></main>;
  const org = await repository.organization(context.organizationId);
  if (!org) return <main className="rp-no-company"><h1>Company unavailable.</h1><Link href="/dashboard">Back to dashboard</Link></main>;
  const orgId = context.organizationId;
  const allowedKinds = reportKinds.filter((kind) => canAccess(context, {
    organizationId: orgId, permission: reportPermissions[kind],
  }));
  const available = new Set<Kind>(allowedKinds);
  const canExport = canAccess(context, { organizationId: orgId, permission: 'report.export' });
  const canInvoice = canAccess(context, { organizationId: orgId, permission: 'invoice.view', moduleKey: 'billing' });
  const canProjects = canAccess(context, { organizationId: orgId, permission: 'project.view', moduleKey: 'projects' });
  const notificationsEnabled = canAccess(context, { organizationId: orgId, permission: 'notification.view' });
  const zone = org.default_timezone || 'Asia/Kolkata';
  const today = localDay(zone);
  const query = await searchParams;
  const { period, from, to } = selectedDates(today, query);
  const reporting = createReportingRepository(client, orgId);
  const [documents, projectResult, overview, histories] = await Promise.all([
    canInvoice ? createGstRepository(client).list(orgId, 'all').catch(() => null) : Promise.resolve(null),
    canProjects ? client.from('projects').select('id,name,status').eq('organization_id', orgId).order('name').limit(1000) : Promise.resolve(null),
    allowedKinds.length ? reporting.dashboard({ from, to }).catch(() => null) : Promise.resolve(null),
    canExport ? Promise.all(allowedKinds.map(async (kind) => {
      try { return { kind, result: await reporting.history(kind) }; }
      catch { return { kind, result: null }; }
    })) : Promise.resolve([]),
  ]);
  const projects: ProjectRecord[] = projectResult && !projectResult.error
    ? (projectResult.data ?? []).map((project) => ({ id: project.id, name: project.name, status: project.status }))
    : [];
  const selectedProject = projects.find((project) => project.id === query.projectId) ?? null;
  const scopedProjects = selectedProject ? [selectedProject] : projects;
  const bucket = { active: 0, completed: 0, onHold: 0, planned: 0 };
  for (const project of scopedProjects) {
    const status = (project.status || '').toLowerCase();
    if (['completed', 'closed', 'handed_over'].includes(status)) bucket.completed++;
    else if (['on_hold', 'blocked', 'delayed', 'paused'].includes(status)) bucket.onHold++;
    else if (['active', 'in_progress', 'ongoing', 'execution'].includes(status)) bucket.active++;
    else bucket.planned++;
  }
  const totalProjects = scopedProjects.length;
  const activePct = totalProjects ? bucket.active / totalProjects * 100 : 0;
  const holdPct = totalProjects ? (bucket.active + bucket.onHold) / totalProjects * 100 : 0;
  const donePct = totalProjects ? (bucket.active + bucket.onHold + bucket.completed) / totalProjects * 100 : 0;
  const ring = totalProjects
    ? 'conic-gradient(#15a568 0% ' + activePct + '%, #ff6a17 ' + activePct + '% ' + holdPct + '%, #f9ba25 ' + holdPct + '% ' + donePct + '%, #9aa5b4 ' + donePct + '% 100%)'
    : '#eef0f4';
  const docsInPeriod = documents?.filter((doc) => doc.date >= from && doc.date <= to) ?? null;
  const invoiceTotal = docsInPeriod?.filter((doc) => doc.kind === 'sales_invoice' && doc.status === 'issued')
    .reduce((sum, doc) => sum + safeNumber(doc.total), 0) ?? null;
  const expenseTotal = docsInPeriod?.filter((doc) => doc.kind === 'purchase_bill' && doc.status === 'recorded')
    .reduce((sum, doc) => sum + safeNumber(doc.total), 0) ?? null;
  const saved: SavedReport[] = histories.flatMap(({ kind, result }) =>
    (result?.rows ?? []).flatMap((row) =>
      typeof row.id === 'string' && typeof row.created_at === 'string'
        ? [{ id: row.id, kind, createdAt: row.created_at }] : []
    )
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const queryProjectId = selectedProject?.id ?? null;
  const firstReport = allowedKinds[0];
  const workItems = Object.entries(overview?.work ?? {}).filter(([, count]) => count > 0).slice(0, 2);
  const insights: { title: string; detail: string; href: string; icon: OwnerIconName }[] = workItems.map(([group, count]) => ({
    title: countFormat.format(count) + ' ' + (group === 'assigned' ? 'assigned to me' : group.replaceAll('_', ' ')),
    detail: 'Open current work queue', href: '/dashboard/work?group=' + encodeURIComponent(group), icon: 'calendar',
  }));
  if (available.has('receivables')) insights.push({ title: 'Review payments due', detail: 'Check receivables and invoice aging', href: periodUrl('receivables', from, to, queryProjectId), icon: 'billing' });
  if (available.has('execution')) insights.push({ title: 'Review project checks', detail: 'Tasks, inspections and site issues', href: periodUrl('execution', from, to, queryProjectId), icon: 'projects' });
  if (saved[0]) insights.push({ title: countFormat.format(saved.length) + ' recent saved reports', detail: 'Download PDF or CSV snapshots', href: '/dashboard/reports/snapshots/' + saved[0].id, icon: 'reports' });
  const visibleFamilies = families.map((family) => ({
    ...family, kinds: family.kinds.filter((kind) => available.has(kind)),
  })).filter((family) => family.kinds.length > 0);
  const filters = { from, to, ...(queryProjectId ? { projectId: queryProjectId } : {}) };
  const accountEmail = user.email ?? '';
  const accountLabel = accountEmail.split('@')[0]?.split(/[._-]/).filter(Boolean).join(' ') || 'Company member';

  return <OwnerShell companyName={org.name} accountEmail={accountEmail} accountLabel={accountLabel}
    planLabel="Business workspace" navigation={ownerWorkspaceNavigation(context)} currentHref="/dashboard/reports"
    search="" notificationsEnabled={notificationsEnabled} dashboardBrand
    searchAction="/dashboard" searchPlaceholder="Search leads, projects, quotations…">
    <main id="main-content" tabIndex={-1} className="owner-dashboard command-dashboard rp-dashboard">
      <header className="rp-page-heading">
        <div><h1>Reports</h1><p>Insights and performance across your business</p></div>
        <div className="rp-header-actions">
          <form className="rp-filters" method="GET" action="/dashboard/reports">
            <label className="rp-select-wrap"><OwnerIcon name="calendar" size={17}/>
              <span className="rp-visually-hidden">Reporting period</span>
              <select name="period" defaultValue={period} aria-label="Reporting period">
                <option value="today">Today</option><option value="week">This Week</option>
                <option value="month">This Month</option><option value="quarter">This Quarter</option>
                <option value="year">This Year</option><option value="custom">Custom Range</option>
              </select>
            </label>
            {canProjects && <label className="rp-select-wrap">
              <span className="rp-visually-hidden">Project</span>
              <select name="projectId" defaultValue={queryProjectId ?? ''} aria-label="Project">
                <option value="">All projects</option>
                {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              </select>
            </label>}
            {period === 'custom' && <div className="rp-custom-range">
              <label>From <input type="date" name="from" defaultValue={from} required/></label>
              <label>To <input type="date" name="to" defaultValue={to} required/></label>
            </div>}
            <button className="rp-apply" type="submit">Apply</button>
          </form>
          {canExport && allowedKinds.length > 0 ? <details className="rp-export">
            <summary><OwnerIcon name="reports" size={17}/> Export Report</summary>
            <div className="rp-export-menu"><strong>Choose a report to export</strong><small>Generate a saved snapshot, then download PDF or CSV.</small>
              {allowedKinds.map((kind) =>
                <form key={kind} action={saveReport}>
                  <input type="hidden" name="kind" value={kind}/>
                  <input type="hidden" name="filters" value={JSON.stringify(filters)}/>
                  <button type="submit" disabled={(kind === 'inventory' || kind === 'cost') && !queryProjectId}>
                    {reportNames[kind]} <span aria-hidden="true">→</span>
                  </button>
                </form>
              )}
              {!queryProjectId && <small>Choose a project to export material or cost balances.</small>}
            </div>
          </details> : firstReport && <Link className="rp-export-link" href={periodUrl(firstReport, from, to, queryProjectId)}>View Reports <OwnerIcon name="arrow" size={16}/></Link>}
        </div>
      </header>
      {queryProjectId && <p className="rp-scope-note">Showing project-specific report links for <strong>{selectedProject?.name}</strong>. Financial summary cards remain company-wide because invoice records are not project-filtered here.</p>}
      <section className="rp-metrics" aria-label="Financial summary">
        <Metric title="Total Invoiced" value={money(invoiceTotal)} description="Issued invoices · selected period" icon="billing" href={available.has('billing') ? periodUrl('billing',from,to,null) : undefined}/>
        <Metric title="Payments Received" value="—" description="See confirmed payments in Billing report" icon="expenses" tone="green" href={available.has('billing') ? periodUrl('billing',from,to,null) : undefined}/>
        <Metric title="Receivables" value="—" description="See allocated balances and aging" icon="reports" href={available.has('receivables') ? periodUrl('receivables',from,to,null) : undefined}/>
        <Metric title="Recorded Expenses" value={money(expenseTotal)} description="Purchase bills · selected period" icon="purchases" href={available.has('billing') ? periodUrl('billing',from,to,null) : undefined}/>
      </section>
      <div className="rp-main-grid">
        <Trend documents={documents}/>
        <section className="rp-panel rp-insights">
          <div className="rp-panel-head"><div className="rp-insights-title"><span className="rp-insight-bulb"><OwnerIcon name="bell" size={18}/></span><h2>Quick Insights</h2></div></div>
          <div className="rp-insight-list">
            {insights.length ? insights.slice(0, 4).map((insight, index) =>
              <Link className="rp-insight-row" href={insight.href} key={insight.href + index}>
                <span className="rp-insight-icon"><OwnerIcon name={insight.icon} size={20}/></span>
                <span><strong>{insight.title}</strong><small>{insight.detail}</small></span>
                <span className="rp-insight-chevron" aria-hidden="true">›</span>
              </Link>) : <p className="rp-empty-insights">No items need attention in the available reports.</p>}
          </div>
        </section>
      </div>
      <section className="rp-panel rp-explore">
        <div className="rp-panel-head"><div><h2>Explore Reports</h2><p>Choose a category to view detailed reports</p></div></div>
        {visibleFamilies.length ? <div className="rp-family-grid">
          {visibleFamilies.map((family) => <article className="rp-family" key={family.title}>
            <Link className="rp-family-primary" href={periodUrl(family.kinds[0]!, from, to, queryProjectId)}>
              <span className="rp-family-icon"><OwnerIcon name={family.icon} size={23}/></span>
              <span><strong>{family.title}</strong><small>{family.description}</small></span>
              <span className="rp-family-arrow" aria-hidden="true">›</span>
            </Link>
            <div className="rp-family-links">
              {family.kinds.map((kind) => <Link key={kind} href={periodUrl(kind,from,to,queryProjectId)}>{reportNames[kind]}</Link>)}
            </div>
          </article>)}
        </div> : <p className="rp-report-empty">Your role has no enabled reports. Ask your administrator for report access.</p>}
      </section>
      <div className="rp-bottom-grid">
        <section className="rp-panel rp-recent">
          <div className="rp-panel-head"><div><h2>Recent Reports</h2><p>Your recently generated report snapshots</p></div>
            {firstReport && <Link className="rp-outline-button" href={periodUrl(firstReport, from, to, queryProjectId)}>View reports <OwnerIcon name="arrow" size={14}/></Link>}
          </div>
          {saved.length ? <>
            <div className="rp-table-scroll"><table><thead><tr><th>Report name</th><th>Generated on</th><th>Download</th><th>Report</th></tr></thead>
              <tbody>{saved.map((item) => <tr key={item.id}><td><Link href={'/dashboard/reports/snapshots/' + item.id}>{reportNames[item.kind]}</Link></td>
                <td>{new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone })}</td>
                <td className="rp-downloads"><a href={'/dashboard/reports/snapshots/' + item.id + '/download?format=pdf'}>PDF</a><a href={'/dashboard/reports/snapshots/' + item.id + '/download?format=csv'}>CSV</a></td>
                <td><Link href={'/dashboard/reports/snapshots/' + item.id} aria-label={'Open ' + reportNames[item.kind]}>View →</Link></td></tr>)}</tbody>
            </table></div>
            <div className="rp-recent-mobile">{saved.map((item) => <article key={item.id}><div><strong>{reportNames[item.kind]}</strong><small>{new Date(item.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:zone})}</small></div><Link href={'/dashboard/reports/snapshots/' + item.id}>Open →</Link></article>)}</div>
          </> : <p className="rp-report-empty">No saved exports yet. Use Export Report to generate your first PDF or CSV snapshot.</p>}
        </section>
        <section className="rp-panel rp-project-status">
          <div className="rp-panel-head"><div><h2>Project Status Overview</h2><p>{selectedProject ? 'Selected project' : 'Visible company projects'}</p></div>
            {canProjects && <Link href="/dashboard/projects" className="rp-orange-link">View all ›</Link>}
          </div>
          {canProjects && projectResult && !projectResult.error ? <div className="rp-donut-area">
            <div className="rp-donut" style={{ background: ring }} role="img" aria-label={String(totalProjects) + ' projects: ' + bucket.active + ' active, ' + bucket.onHold + ' on hold, ' + bucket.completed + ' completed, ' + bucket.planned + ' other'}>
              <div><strong>{countFormat.format(totalProjects)}</strong><small>Total projects</small></div>
            </div>
            <div className="rp-status-legend">
              <div><i className="rp-dot rp-dot-green"/>Active<strong>{bucket.active}</strong></div>
              <div><i className="rp-dot rp-dot-orange"/>On hold<strong>{bucket.onHold}</strong></div>
              <div><i className="rp-dot rp-dot-yellow"/>Completed<strong>{bucket.completed}</strong></div>
              <div><i className="rp-dot rp-dot-grey"/>Other / Planned<strong>{bucket.planned}</strong></div>
            </div>
          </div> : <p className="rp-report-empty">Project statuses are unavailable for your access level.</p>}
        </section>
      </div>
      <p className="rp-basis">Amounts are taken from issued invoices and recorded purchase bills, not assumed cash receipts. Reporting permissions and company isolation are retained. Snapshot downloads offer PDF and CSV.</p>
    </main>
  </OwnerShell>;
}
