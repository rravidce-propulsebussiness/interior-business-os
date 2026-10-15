/* Dashboard-only presentational component: all values are supplied by the
   authenticated, tenant-scoped server page. No demonstration data. */
import { OwnerIcon, type OwnerIconName } from './owner-shell';

export type CommandMetric = {
  title: string;
  value: string;
  detail: string;
  href: string;
  icon: OwnerIconName;
  tone: 'orange' | 'green' | 'blue' | 'purple';
};
export type CommandAction = {
  title: string;
  detail: string;
  href: string;
  icon: OwnerIconName;
};
export type CommandAttention = {
  title: string;
  detail: string;
  href: string;
  icon: OwnerIconName;
  status: string;
  tone: 'urgent' | 'pending' | 'neutral';
};
export type CommandProject = {
  id: string;
  name: string;
  stage: string;
  status: string;
  step: number | null;
};
export type CommandDocument = {
  id: string;
  party: string;
  number: string;
  date: string;
  total: string;
  status: string;
};
export type CommandFinance = {
  invoiced: string;
  expenses: string;
  issuedCount: string;
  recordedCount: string;
  graph: { name: string; total: number }[];
};

const formatDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(parsed);
};
const prettify = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function PanelHeading({ title, href, action = 'View all', icon }: {
  title: string; href?: string; action?: string; icon: OwnerIconName;
}) {
  return <div className="command-panel-heading">
    <h2><span className="command-heading-icon"><OwnerIcon name={icon} size={17}/></span>{title}</h2>
    {href && <a href={href}>{action}<span aria-hidden="true"> →</span></a>}
  </div>;
}

function Metric({ item }: { item: CommandMetric }) {
  return <a className={'command-metric command-tone-' + item.tone} href={item.href}>
    <span className="command-metric-icon"><OwnerIcon name={item.icon} size={24}/></span>
    <span className="command-metric-body">
      <span className="command-metric-label">{item.title}</span>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </span>
  </a>;
}

function DocumentList({ rows, empty, href, kind }: {
  rows: CommandDocument[]; empty: string; href: string; kind: 'invoice' | 'expense';
}) {
  return <section className="command-panel command-documents">
    <PanelHeading title={kind === 'invoice' ? 'Recent Invoices' : 'Recent Expenses'}
      href={href} icon={kind === 'invoice' ? 'billing' : 'expenses'} />
    {rows.length ? <div className="command-document-rows">
      {rows.map((item) => <a key={item.id} href={href} className="command-document-row">
        <span className="command-row-icon"><OwnerIcon name={kind === 'invoice' ? 'billing' : 'expenses'} size={17}/></span>
        <span className="command-row-content">
          <strong>{item.party}</strong>
          <small>{item.number ? item.number + ' · ' : ''}{formatDate(item.date)}</small>
        </span>
        <strong className="command-document-amount">{item.total}</strong>
        <span className={'command-status command-status-' + (item.status === 'issued' || item.status === 'recorded' ? 'success' : 'pending')}>
          {prettify(item.status)}
        </span>
      </a>)}
    </div> : <p className="command-empty">{empty}</p>}
  </section>;
}

export function CommandCentre({
  accountLabel,
  dateLabel,
  metrics,
  actions,
  attention,
  projects,
  finance,
  team,
  invoices,
  expenses,
  navigation,
}: {
  accountLabel: string;
  dateLabel: string;
  metrics: CommandMetric[];
  actions: CommandAction[];
  attention: CommandAttention[];
  projects: CommandProject[];
  finance: CommandFinance | null;
  team: { active: number | null; total: number | null } | null;
  invoices: CommandDocument[];
  expenses: CommandDocument[];
  navigation: { label: string; href: string; icon: OwnerIconName }[];
}) {
  const max = Math.max(1, ...(finance?.graph.map((month) => month.total) ?? []));
  return <main id="main-content" tabIndex={-1} className="owner-dashboard command-dashboard">
    <header className="command-welcome">
      <div className="command-welcome-text">
        <span className="command-sun" aria-hidden="true">☀</span>
        <span><h1>Good to see you, {accountLabel}</h1><p>Your business at a glance.</p></span>
      </div>
      <time className="command-date"><OwnerIcon name="calendar" size={16}/>{dateLabel}</time>
    </header>

    {metrics.length > 0 && <section className="command-metrics" aria-label="Business overview">
      {metrics.map((item) => <Metric item={item} key={item.title}/>)}
    </section>}

    {actions.length > 0 && <section className="command-actions-panel">
      <div className="command-actions-heading">
        <h2><span className="command-heading-icon"><OwnerIcon name="dashboard" size={18}/></span>Quick Actions</h2>
      </div>
      <div className="command-actions-grid">
        {actions.map((action) => <a key={action.href} className="command-action" href={action.href}>
          <span className="command-action-icon"><OwnerIcon name={action.icon} size={23}/></span>
          <span><strong>{action.title}</strong><small>{action.detail}</small></span>
        </a>)}
      </div>
    </section>}

    <div className="command-two-cols">
      <section className="command-panel">
        <PanelHeading title="Needs Attention" icon="bell" />
        {attention.length ? <div className="command-attention-list">
          {attention.map((item, i) => <a key={item.href + ':' + i} href={item.href} className="command-attention-row">
            <span className="command-row-icon"><OwnerIcon name={item.icon} size={18}/></span>
            <span className="command-row-content"><strong>{item.title}</strong><small>{item.detail}</small></span>
            <span className={'command-status command-status-' + item.tone}>{item.status}</span>
            <span className="command-arrow" aria-hidden="true">›</span>
          </a>)}
        </div> : <p className="command-empty">Nothing needs your attention right now.</p>}
      </section>
      <section className="command-panel">
        <PanelHeading title="Project Progress" icon="projects" href="/dashboard/projects" />
        {projects.length ? <div className="command-project-list">
          {projects.map((project) => <a key={project.id} href={'/dashboard/projects/' + project.id} className="command-project-row">
            <span className="command-project-symbol"><OwnerIcon name="projects" size={25}/></span>
            <span className="command-project-content">
              <span className="command-project-top"><strong>{project.name}</strong><small>{prettify(project.stage)}</small></span>
              <span className="command-progress" aria-label={project.stage + ' workflow stage (not completion percentage)'}>
                {project.step !== null && <span style={{ width: project.step + '%' }}/>}
              </span>
              <small className="command-stage-note">Current stage: {prettify(project.stage)}</small>
            </span><span className="command-arrow" aria-hidden="true">›</span>
          </a>)}
        </div> : <p className="command-empty">No active projects to display.</p>}
      </section>
    </div>

    <div className="command-two-cols command-secondary-row">
      {finance && <section className="command-panel">
        <PanelHeading title="Finance Overview" icon="expenses" href="/dashboard/billing"/>
        <div className="command-chart" role="img" aria-label="Issued invoice value over the last seven calendar months">
          {finance.graph.map((item) => <div className="command-chart-column" key={item.name}>
            <span className="command-chart-bar-wrap">
              <span className="command-chart-bar" style={{ height: (item.total > 0 ? Math.max(3, item.total / max * 100) : 0) + '%' }} title={item.name}/>
            </span>
            <span>{item.name}</span>
          </div>)}
        </div>
        <div className="command-finance-totals">
          <div><strong>{finance.invoiced}</strong><span>Invoiced this month</span></div>
          <div><strong>{finance.expenses}</strong><span>Recorded expenses</span></div>
          <div><strong>{finance.issuedCount}</strong><span>Invoices issued</span></div>
          <div><strong>{finance.recordedCount}</strong><span>Bills recorded</span></div>
        </div>
      </section>}
      {team && <section className="command-panel">
        <PanelHeading title="Team Overview" icon="team" href="/dashboard/company/team" action="Manage Team"/>
        <div className="command-team-content">
          <div className="command-team-count"><OwnerIcon name="team" size={34}/>
            <strong>{team.active === null ? '—' : team.active}</strong><span>Active members</span>
          </div>
          <div className="command-team-details">
            <span><OwnerIcon name="check" size={17}/> Active <strong>{team.active ?? '—'}</strong></span>
            <span><OwnerIcon name="leads" size={17}/> Total members <strong>{team.total ?? '—'}</strong></span>
            <a href="/dashboard/company/team">Manage assignments and access →</a>
          </div>
        </div>
      </section>}
    </div>

    {finance && <div className="command-two-cols command-bottom-row">
      <DocumentList kind="invoice" rows={invoices} href="/dashboard/billing?kind=sales_invoice" empty="No invoices recorded yet."/>
      <DocumentList kind="expense" rows={expenses} href="/dashboard/billing?kind=purchase_bill" empty="No expenses recorded yet."/>
    </div>}

    <nav className="command-mobile-nav" aria-label="Dashboard shortcuts">
      {navigation.slice(0, 5).map((item) => <a href={item.href} key={item.href}
        aria-current={item.href === '/dashboard' ? 'page' : undefined}>
        <OwnerIcon name={item.icon} size={20}/><span>{item.label}</span></a>)}
    </nav>
  </main>;
}
