import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  financeEntitySchema,
  financeFilterSchema,
  financePermissions,
} from '@business-os/core/finance';
import { OwnerMobileNav } from '../../owner-mobile-nav';
import { OwnerIcon, OwnerShell, type OwnerNavItem } from '../../owner-shell';
import { financeServices } from '../service';
import { RecordList, text, titles } from '../presentation';

const financeLinks = [
  {
    label: 'Finance overview',
    href: '/dashboard/finance',
    permission: 'invoice.view',
  },
  {
    label: 'Contracts',
    href: '/dashboard/finance/contracts',
    permission: 'contract.view',
  },
  {
    label: 'Payment schedules',
    href: '/dashboard/finance/payment_schedules',
    permission: 'payment_schedule.view',
  },
  {
    label: 'Invoices',
    href: '/dashboard/finance/invoices',
    permission: 'invoice.view',
  },
  {
    label: 'Payments',
    href: '/dashboard/finance/payments',
    permission: 'payment.view',
  },
] as const;

const statusOptions = [
  ['active', 'Active'],
  ['on_hold', 'On hold'],
  ['completed', 'Completed'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled'],
] as const;

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(date);
}

function ContractResults({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return (
      <div className="fw-empty fw-record-empty">
        <span className="fw-empty-icon">
          <OwnerIcon name="billing" size={25} />
        </span>
        <strong>No contracts match these filters</strong>
        <p>
          Try a different reference, remove a filter, or create a contract from
          an accepted quotation.
        </p>
        <Link className="fw-empty-link" href="/dashboard/finance/contracts">
          Clear filters
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="fw-table-wrap fw-contract-table">
        <table aria-label="Contracts">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Customer & project</th>
              <th>Created</th>
              <th>Contract value</th>
              <th>Status</th>
              <th>
                <span className="fw-visually-hidden">Open record</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = text(row, 'id');
              const status =
                text(row, 'status') || text(row, 'effective_status') || 'draft';
              const statusClass = status
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '-');
              return (
                <tr key={id}>
                  <td>
                    <Link
                      className="fw-contract-reference"
                      href={`/dashboard/finance/contracts/${id}`}
                    >
                      <span className="fw-contract-mark">
                        <OwnerIcon name="billing" size={17} />
                      </span>
                      <span>
                        <strong>
                          {text(row, 'contract_number') || 'Draft contract'}
                        </strong>
                        <small>Contract record</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="fw-cell-stack">
                      <strong>
                        {text(row, 'customer_name') || 'Customer not listed'}
                      </strong>
                      <small>
                        {text(row, 'project_name') || 'Project not linked'}
                      </small>
                    </span>
                  </td>
                  <td>
                    <span className="fw-date-cell">
                      {text(row, 'created_at')
                        ? displayDate(text(row, 'created_at'))
                        : '—'}
                    </span>
                  </td>
                  <td>
                    <span className="fw-cell-stack fw-value-stack">
                      <strong>
                        {text(row, 'currency') || 'INR'}{' '}
                        {text(row, 'current_contract_value') ||
                          text(row, 'original_contract_value') ||
                          '—'}
                      </strong>
                      <small>Current contract value</small>
                    </span>
                  </td>
                  <td>
                    <span className={`fw-status fw-status-${statusClass}`}>
                      {status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="fw-row-action"
                      href={`/dashboard/finance/contracts/${id}`}
                      aria-label={`Open contract ${text(row, 'contract_number')}`}
                    >
                      <OwnerIcon name="arrow" size={17} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fw-mobile-rows fw-contract-mobile">
        {rows.map((row) => {
          const id = text(row, 'id');
          const status =
            text(row, 'status') || text(row, 'effective_status') || 'draft';
          return (
            <Link
              key={id}
              className="fw-mobile-row"
              href={`/dashboard/finance/contracts/${id}`}
            >
              <span>
                <strong>
                  {text(row, 'contract_number') || 'Draft contract'}
                </strong>
                <small>
                  {text(row, 'customer_name') || 'Customer not listed'} ·{' '}
                  {text(row, 'project_name') || 'No project'}
                </small>
                <small>
                  {text(row, 'created_at')
                    ? displayDate(text(row, 'created_at'))
                    : ''}
                </small>
              </span>
              <span>
                <strong>
                  {text(row, 'currency') || 'INR'}{' '}
                  {text(row, 'current_contract_value') ||
                    text(row, 'original_contract_value') ||
                    '—'}
                </strong>
                <small>{status.replaceAll('_', ' ')}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default async function FinanceList({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { entity: raw } = await params;
  const parsed = financeEntitySchema.safeParse(raw);
  if (!parsed.success) notFound();
  const entity = parsed.data;
  const query = await searchParams;
  const s = await financeServices(financePermissions[entity], true);
  const filter = financeFilterSchema.parse(
    Object.fromEntries(
      Object.entries(query).filter(
        ([key, value]) =>
          !['page', 'lookup', 'lookup_page'].includes(key) && value,
      ),
    ),
  );
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const result = await s.finance.search(entity, filter, page);
  const lookupPage = Math.max(
    1,
    Math.min(10000, Number(query.lookup_page) || 1),
  );
  const lookup = (query.lookup ?? '')
    .slice(0, 100)
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
  const start = (lookupPage - 1) * 25;
  const [customers, projects, branches, contracts, organization] =
    await Promise.all([
      s.client
        .from('customers')
        .select('id,display_name')
        .eq('organization_id', s.org)
        .ilike('display_name', lookup + '%')
        .order('display_name')
        .range(start, start + 24),
      s.client
        .from('projects')
        .select('id,name')
        .eq('organization_id', s.org)
        .ilike('name', lookup + '%')
        .order('name')
        .range(start, start + 24),
      s.client
        .from('branches')
        .select('id,name')
        .eq('organization_id', s.org)
        .ilike('name', lookup + '%')
        .order('name')
        .range(start, start + 24),
      s.allowed('contract.view')
        ? s.finance.search('contracts', { q: query.lookup ?? '' }, lookupPage)
        : Promise.resolve({ rows: [] }),
      s.repository.organization(s.org),
    ]);
  type FinanceChoiceKey =
    'customer_id' | 'project_id' | 'branch_id' | 'contract_id';
  const choices: Record<FinanceChoiceKey, { value: string; label: string }[]> =
    {
      customer_id: (customers.data ?? []).map((row) => ({
        value: row.id,
        label: row.display_name,
      })),
      project_id: (projects.data ?? []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
      branch_id: (branches.data ?? []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
      contract_id: contracts.rows.map((row) => ({
        value: String(row.id),
        label: String(row.contract_number),
      })),
    };
  const createPermission: Record<string, string> = {
    contracts: 'contract.create',
    payment_schedules: 'payment_schedule.manage',
    invoices: 'invoice.create',
    payments: 'payment.record',
    change_orders: 'change_order.create',
    organization_billing_settings: 'billing.manage',
    payment_methods: 'billing.manage',
    tax_codes: 'billing.manage',
  };
  const queryString = (targetPage: number) =>
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(query).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      page: String(targetPage),
    }).toString();
  const title = titles[entity] ?? entity;
  const activeFilters = Object.entries(filter).filter(([, value]) =>
    Boolean(value),
  ).length;
  const nav: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Finance', href: '/dashboard/finance', icon: 'billing' },
    { label: 'Projects', href: '/dashboard/projects', icon: 'projects' },
    { label: 'Employees', href: '/dashboard/employees', icon: 'team' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ];
  const bottomNav: OwnerNavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
    { label: 'Projects', href: '/dashboard/projects', icon: 'projects' },
    { label: 'Finance', href: '/dashboard/finance', icon: 'billing' },
    { label: 'Team', href: '/dashboard/company/team', icon: 'team' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'settings' },
  ];
  const {
    data: { user },
  } = await s.client.auth.getUser();
  const email = user?.email ?? '';
  const isContracts = entity === 'contracts';

  return (
    <OwnerShell
      companyName={organization?.name ?? 'Company workspace'}
      accountLabel={email.split('@')[0] || 'Account'}
      accountEmail={email}
      planLabel="Business workspace"
      navigation={nav}
      currentHref="/dashboard/finance"
      search=""
      dashboardBrand
      notificationsEnabled={s.allowed('notification.view')}
    >
      <main className="fw-page fw-record-page" id="main-content" tabIndex={-1}>
        <div className="fw-crumb">
          <Link href="/dashboard">Dashboard</Link>
          <span>/</span>
          <Link href="/dashboard/finance">Finance</Link>
          <span>/</span>
          <strong>{title}</strong>
        </div>
        <header className="fw-heading fw-record-heading">
          <div>
            <span className="fw-eyebrow">
              <OwnerIcon name="billing" size={14} /> Finance workspace
            </span>
            <h1>{title}</h1>
            <p>
              {isContracts
                ? 'A clear register of customer agreements, project values and contract status.'
                : `Review and manage ${title.toLowerCase()} in your finance workspace.`}
            </p>
          </div>
          {createPermission[entity] && s.allowed(createPermission[entity]!) && (
            <Link
              className="fw-primary"
              href={`/dashboard/finance/${entity}/new${filter.contract_id ? `?contract_id=${filter.contract_id}` : ''}`}
            >
              <OwnerIcon name="plus" size={16} /> Create {title.toLowerCase()}
            </Link>
          )}
        </header>

        <nav className="fw-tabs fw-record-tabs" aria-label="Finance sections">
          {financeLinks
            .filter((item) => s.allowed(item.permission))
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  entity === item.href.split('/').pop() ? 'page' : undefined
                }
                className={
                  entity === item.href.split('/').pop() ? 'fw-tab-active' : ''
                }
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <section
          className="fw-record-stats"
          aria-label="Contract search summary"
        >
          <article>
            <span className="fw-stat-icon">
              <OwnerIcon name="search" size={18} />
            </span>
            <div>
              <small>Matching records</small>
              <strong>{result.total}</strong>
              <span>Based on current filters</span>
            </div>
          </article>
          <article>
            <span className="fw-stat-icon fw-stat-warm">
              <OwnerIcon name="billing" size={18} />
            </span>
            <div>
              <small>Page</small>
              <strong>{page}</strong>
              <span>{result.rows.length} records shown</span>
            </div>
          </article>
          <article>
            <span className="fw-stat-icon fw-stat-green">
              <OwnerIcon name="check" size={18} />
            </span>
            <div>
              <small>Active filters</small>
              <strong>{activeFilters}</strong>
              <span>
                {activeFilters
                  ? 'Narrowing this register'
                  : 'Showing all records'}
              </span>
            </div>
          </article>
        </section>

        <section className="fw-panel fw-record-panel">
          <div className="fw-panel-head">
            <div>
              <h2>{isContracts ? 'Contract register' : title}</h2>
              <p>Search, filter and open a record without leaving Finance.</p>
            </div>
            <span className="fw-record-count">
              {result.total} {result.total === 1 ? 'record' : 'records'}
            </span>
          </div>
          <form
            action={`/dashboard/finance/${entity}`}
            method="get"
            className="fw-record-form"
          >
            <div className="fw-filter-grid">
              <label className="fw-filter-search">
                <span>Reference search</span>
                <span className="fw-input-wrap">
                  <OwnerIcon name="search" size={17} />
                  <input
                    name="q"
                    defaultValue={filter.q}
                    placeholder={isContracts ? 'Contract number' : 'Reference'}
                  />
                </span>
              </label>
              <label>
                <span>Customer</span>
                <select
                  name="customer_id"
                  defaultValue={query.customer_id ?? ''}
                >
                  <option value="">All customers</option>
                  {query.customer_id &&
                    !choices.customer_id.some(
                      (choice) => choice.value === query.customer_id,
                    ) && (
                      <option value={query.customer_id}>
                        Current selection
                      </option>
                    )}
                  {choices.customer_id.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Project</span>
                <select name="project_id" defaultValue={query.project_id ?? ''}>
                  <option value="">All projects</option>
                  {query.project_id &&
                    !choices.project_id.some(
                      (choice) => choice.value === query.project_id,
                    ) && (
                      <option value={query.project_id}>
                        Current selection
                      </option>
                    )}
                  {choices.project_id.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              {[
                'contracts',
                'invoices',
                'payments',
                'payment_schedules',
                'payment_requests',
                'receipts',
                'change_orders',
              ].includes(entity) && (
                <label>
                  <span>Status</span>
                  <select name="status" defaultValue={filter.status ?? ''}>
                    <option value="">All statuses</option>
                    {filter.status &&
                      !statusOptions.some(
                        ([value]) => value === filter.status,
                      ) && (
                        <option value={filter.status}>{filter.status}</option>
                      )}
                    {statusOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <details className="fw-advanced-filters">
              <summary>
                <OwnerIcon name="settings" size={15} /> Advanced filters{' '}
                <span>
                  {activeFilters
                    ? `${activeFilters} applied`
                    : 'Dates, branch and more'}
                </span>
              </summary>
              <div className="fw-advanced-grid">
                <label>
                  <span>From date</span>
                  <input type="date" name="from" defaultValue={filter.from} />
                </label>
                <label>
                  <span>Until date</span>
                  <input type="date" name="until" defaultValue={filter.until} />
                </label>
                <label>
                  <span>Branch</span>
                  <select name="branch_id" defaultValue={query.branch_id ?? ''}>
                    <option value="">All branches</option>
                    {query.branch_id &&
                      !choices.branch_id.some(
                        (choice) => choice.value === query.branch_id,
                      ) && (
                        <option value={query.branch_id}>
                          Current selection
                        </option>
                      )}
                    {choices.branch_id.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
                {entity !== 'contracts' && (
                  <label>
                    <span>Contract</span>
                    <select
                      name="contract_id"
                      defaultValue={query.contract_id ?? ''}
                    >
                      <option value="">All contracts</option>
                      {query.contract_id &&
                        !choices.contract_id.some(
                          (choice) => choice.value === query.contract_id,
                        ) && (
                          <option value={query.contract_id}>
                            Current selection
                          </option>
                        )}
                      {choices.contract_id.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="fw-filter-lookup">
                  <span>Find filter choices</span>
                  <input
                    name="lookup"
                    defaultValue={query.lookup}
                    placeholder="Name or contract number"
                  />
                </label>
                <label className="fw-choice-page">
                  <span>Choices page</span>
                  <input
                    type="number"
                    min="1"
                    name="lookup_page"
                    defaultValue={lookupPage}
                  />
                </label>
              </div>
              <p>
                Use the lookup to populate customer, project, branch and
                contract selectors.
              </p>
            </details>
            <div className="fw-filter-actions">
              <button className="fw-filter-submit" type="submit">
                <OwnerIcon name="search" size={16} /> Search records
              </button>
              <Link
                href={`/dashboard/finance/${entity}`}
                className="fw-clear-filters"
              >
                Clear filters
              </Link>
              <span>Dates filter by record creation date.</span>
            </div>
          </form>
          {isContracts ? (
            <ContractResults rows={result.rows} />
          ) : (
            <RecordList entity={entity} rows={result.rows} />
          )}
          {result.total > 25 && (
            <nav className="fw-pagination" aria-label="Pagination">
              <span>
                Page {page} of {Math.ceil(result.total / 25)}
              </span>
              <div>
                {page > 1 && (
                  <Link href={`?${queryString(page - 1)}`}>Previous</Link>
                )}
                {page * 25 < result.total && (
                  <Link href={`?${queryString(page + 1)}`}>
                    Next <OwnerIcon name="arrow" size={15} />
                  </Link>
                )}
              </div>
            </nav>
          )}
        </section>
        <OwnerMobileNav
          navigation={bottomNav}
          currentHref="/dashboard/finance"
        />
      </main>
    </OwnerShell>
  );
}
