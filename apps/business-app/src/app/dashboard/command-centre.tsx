/* eslint-disable @next/next/no-html-link-for-pages -- Full-document navigation is required by the hosted workspace. */
/* Dashboard-only presentational component: all values are supplied by the
   authenticated, tenant-scoped server page. No demonstration data. */
import { OwnerIcon, type OwnerIconName } from './owner-shell';
import { OwnerMobileNav } from './owner-mobile-nav';
import './command-layout.css';

export type CommandMetric = {
  title: string;
  value: string;
  detail: string;
  href: string;
  icon: OwnerIconName;
  tone: 'orange' | 'green' | 'blue' | 'purple';
  /** Raw count for the pipeline donut; omitted when the value is not a count. */
  count?: number;
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

type Tile = {
  key: string;
  label: string;
  value: string;
  note: string;
  href: string;
  icon: OwnerIconName;
};

const donutColours = ['#88352b', '#bd5c3f', '#ff7820', '#ffb283'];

const formatDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parsed);
};
const prettify = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function PanelHeading({
  title,
  href,
  action = 'View all',
  icon,
}: {
  title: string;
  href?: string;
  action?: string;
  icon: OwnerIconName;
}) {
  return (
    <div className="command-panel-heading">
      <h2>
        <span className="command-heading-icon">
          <OwnerIcon name={icon} size={17} />
        </span>
        {title}
      </h2>
      {href && (
        <a href={href}>
          {action}
          <span aria-hidden="true"> →</span>
        </a>
      )}
    </div>
  );
}

function DocumentList({
  rows,
  empty,
  href,
  kind,
}: {
  rows: CommandDocument[];
  empty: string;
  href: string;
  kind: 'invoice' | 'expense';
}) {
  const icon = kind === 'invoice' ? 'billing' : 'expenses';
  return (
    <section className="command-panel command-documents">
      <PanelHeading
        title={kind === 'invoice' ? 'Recent Invoices' : 'Recent Expenses'}
        href={href}
        icon={icon}
      />
      {rows.length ? (
        <div className="command-document-rows">
          {rows.map((item) => (
            <a key={item.id} href={href} className="command-document-row">
              <span className="command-row-icon">
                <OwnerIcon name={icon} size={17} />
              </span>
              <span className="command-row-content">
                <strong>{item.party}</strong>
                <small>
                  {item.number ? item.number + ' · ' : ''}
                  {formatDate(item.date)}
                </small>
              </span>
              <strong className="command-document-amount">{item.total}</strong>
              <span
                className={
                  'command-status command-status-' +
                  (item.status === 'issued' || item.status === 'recorded'
                    ? 'success'
                    : 'pending')
                }
              >
                {prettify(item.status)}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="command-empty">{empty}</p>
      )}
    </section>
  );
}

function PipelineDonut({ metrics }: { metrics: CommandMetric[] }) {
  const parts = metrics.filter(
    (item): item is CommandMetric & { count: number } =>
      typeof item.count === 'number' && Number.isFinite(item.count),
  );
  if (parts.length < 2) return null;
  const total = parts.reduce((sum, item) => sum + item.count, 0);
  let start = 0;
  const stops = parts.map((item, index) => {
    const end = total ? start + (item.count / total) * 100 : start;
    const stop = `${donutColours[index % donutColours.length]} ${start}% ${end}%`;
    start = end;
    return stop;
  });
  const ring = total
    ? `conic-gradient(${stops.join(', ')})`
    : 'conic-gradient(#efe6e4 0% 100%)';
  return (
    <section className="command-panel command-mix">
      <PanelHeading title="Pipeline Mix" icon="reports" />
      <div className="command-mix-body">
        <div
          className="command-donut"
          style={{ background: ring }}
          role="img"
          aria-label={parts
            .map((item) => item.title + ': ' + item.value)
            .join(', ')}
        >
          <span className="command-donut-centre">
            <strong>{total.toLocaleString('en-IN')}</strong>
            <small>Total records</small>
          </span>
        </div>
        <ul className="command-mix-legend">
          {parts.map((item, index) => (
            <li key={item.title}>
              <span
                className="command-mix-dot"
                style={{
                  background: donutColours[index % donutColours.length],
                }}
                aria-hidden="true"
              />
              <a href={item.href}>{item.title}</a>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function CommandCentre({
  greeting = 'Good to see you',
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
  greeting?: string;
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
  const max = Math.max(
    1,
    ...(finance?.graph.map((month) => month.total) ?? []),
  );
  const tiles: Tile[] = metrics.map((item) => ({
    key: item.title,
    label: item.title,
    value: item.value,
    note: item.detail,
    href: item.href,
    icon: item.icon,
  }));
  if (finance)
    tiles.push(
      {
        key: 'invoiced',
        label: 'Invoiced',
        value: finance.invoiced,
        note: 'This month',
        href: '/dashboard/finance?tab=invoices',
        icon: 'billing',
      },
      {
        key: 'expenses',
        label: 'Recorded Expenses',
        value: finance.expenses,
        note: 'This month',
        href: '/dashboard/finance?tab=expenses',
        icon: 'expenses',
      },
      {
        key: 'issued',
        label: 'Invoices Issued',
        value: finance.issuedCount,
        note: 'This month',
        href: '/dashboard/billing?kind=sales_invoice',
        icon: 'quotations',
      },
      {
        key: 'bills',
        label: 'Bills Recorded',
        value: finance.recordedCount,
        note: 'This month',
        href: '/dashboard/billing?kind=purchase_bill',
        icon: 'purchases',
      },
    );
  if (team)
    tiles.push({
      key: 'team',
      label: 'Active Members',
      value: team.active === null ? '—' : String(team.active),
      note: team.total === null ? 'Team' : 'of ' + team.total + ' total',
      href: '/dashboard/company/team',
      icon: 'team',
    });
  const [primaryAction, ...otherActions] = actions;
  const hasDonut =
    metrics.filter((item) => typeof item.count === 'number').length >= 2;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="owner-dashboard command-dashboard command-reel"
    >
      <div
        className={
          'command-hero-row' + (hasDonut ? '' : ' command-hero-row-single')
        }
      >
        <section className="command-hero" aria-labelledby="command-greeting">
          <header className="command-hero-head">
            <div>
              <h1 id="command-greeting">
                {greeting}, {accountLabel}
              </h1>
              <p>
                <OwnerIcon name="calendar" size={14} />
                <time>{dateLabel}</time>
                <span aria-hidden="true">·</span>
                Your business at a glance
              </p>
            </div>
            {actions.length > 0 && (
              <div className="command-hero-actions">
                {otherActions.map((action) => (
                  <a
                    key={action.href}
                    href={action.href}
                    className="command-chip"
                    title={action.detail}
                  >
                    <OwnerIcon name={action.icon} size={15} />
                    {action.title}
                  </a>
                ))}
                {primaryAction && (
                  <a
                    href={primaryAction.href}
                    className="command-chip command-chip-primary"
                    title={primaryAction.detail}
                  >
                    <OwnerIcon name="plus" size={15} />
                    {primaryAction.title}
                  </a>
                )}
              </div>
            )}
          </header>
          {finance ? (
            <div className="command-hero-chart">
              <div className="command-hero-chart-head">
                <strong>Invoice value</strong>
                <small>Issued invoices, last 7 months</small>
                <a href="/dashboard/billing">
                  Finance<span aria-hidden="true"> →</span>
                </a>
              </div>
              <div
                className="command-chart"
                role="img"
                aria-label="Issued invoice value over the last seven calendar months"
              >
                {finance.graph.map((item, index) => (
                  <div className="command-chart-column" key={item.name}>
                    <span className="command-chart-bar-wrap">
                      <span
                        className={
                          'command-chart-bar' +
                          (index === finance.graph.length - 1
                            ? ' command-chart-bar-current'
                            : '')
                        }
                        style={{
                          height:
                            (item.total > 0
                              ? Math.max(3, (item.total / max) * 100)
                              : 0) + '%',
                        }}
                        title={item.name}
                      />
                    </span>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="command-hero-note">
              Your modules are summarised below.
            </p>
          )}
        </section>
        <PipelineDonut metrics={metrics} />
      </div>

      {tiles.length > 0 && (
        <section className="command-tiles" aria-label="Business overview">
          {tiles.map((tile) => (
            <a key={tile.key} className="command-tile" href={tile.href}>
              <span className="command-tile-top">
                <span className="command-tile-icon">
                  <OwnerIcon name={tile.icon} size={18} />
                </span>
                <span className="command-tile-pill">{tile.note}</span>
              </span>
              <strong>{tile.value}</strong>
              <span className="command-tile-label">{tile.label}</span>
            </a>
          ))}
        </section>
      )}

      <div className="command-two-cols">
        <section className="command-panel">
          <PanelHeading title="Needs Attention" icon="bell" />
          {attention.length ? (
            <div className="command-attention-list">
              {attention.map((item, i) => (
                <a
                  key={item.href + ':' + i}
                  href={item.href}
                  className="command-attention-row"
                >
                  <span className="command-row-icon">
                    <OwnerIcon name={item.icon} size={18} />
                  </span>
                  <span className="command-row-content">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span
                    className={'command-status command-status-' + item.tone}
                  >
                    {item.status}
                  </span>
                  <span className="command-arrow" aria-hidden="true">
                    ›
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="command-empty">
              Nothing needs your attention right now.
            </p>
          )}
        </section>
        <section className="command-panel">
          <PanelHeading
            title="Project Progress"
            icon="projects"
            href="/dashboard/projects"
          />
          {projects.length ? (
            <div className="command-project-list">
              {projects.map((project) => (
                <a
                  key={project.id}
                  href={'/dashboard/projects/' + project.id}
                  className="command-project-row"
                >
                  <span className="command-project-symbol">
                    <OwnerIcon name="projects" size={25} />
                  </span>
                  <span className="command-project-content">
                    <span className="command-project-top">
                      <strong>{project.name}</strong>
                      <small>
                        {project.step === null
                          ? 'Not tracked'
                          : project.step + '% done'}
                      </small>
                    </span>
                    <span
                      className="command-progress"
                      role={project.step === null ? undefined : 'progressbar'}
                      aria-label="Recorded work completed"
                      aria-valuenow={project.step ?? undefined}
                      aria-valuemin={project.step === null ? undefined : 0}
                      aria-valuemax={project.step === null ? undefined : 100}
                    >
                      {project.step !== null && (
                        <span style={{ width: project.step + '%' }} />
                      )}
                    </span>
                    <small className="command-stage-note">
                      Overall work completion
                    </small>
                  </span>
                  <span className="command-arrow" aria-hidden="true">
                    ›
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="command-empty">No active projects to display.</p>
          )}
        </section>
      </div>

      {finance && (
        <div className="command-two-cols command-bottom-row">
          <DocumentList
            kind="invoice"
            rows={invoices}
            href="/dashboard/billing?kind=sales_invoice"
            empty="No invoices recorded yet."
          />
          <DocumentList
            kind="expense"
            rows={expenses}
            href="/dashboard/billing?kind=purchase_bill"
            empty="No expenses recorded yet."
          />
        </div>
      )}

      <OwnerMobileNav navigation={navigation} currentHref="/dashboard" />
    </main>
  );
}
