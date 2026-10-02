import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  financeEntitySchema,
  financeFilterSchema,
  financePermissions,
} from '@business-os/core/finance';
import { financeServices } from '../service';
import { RecordList, titles, Metrics } from '../presentation';
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
  const entity = parsed.data,
    query = await searchParams,
    s = await financeServices(financePermissions[entity], true);
  const filter = financeFilterSchema.parse(
      Object.fromEntries(
        Object.entries(query).filter(
          ([k, v]) => !['page', 'lookup', 'lookup_page'].includes(k) && v,
        ),
      ),
    ),
    page = Math.max(1, Math.min(10000, Number(query.page) || 1)),
    result = await s.finance.search(entity, filter, page);
  const lookupPage = Math.max(
    1,
    Math.min(10000, Number(query.lookup_page) || 1),
  );
  const lookup = (query.lookup ?? '')
    .slice(0, 100)
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
  const start = (lookupPage - 1) * 25;
  const [customers, projects, branches, contracts] = await Promise.all([
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
  ]);
  const choices: Record<string, { value: string; label: string }[]> = {
    customer_id: (customers.data ?? []).map((r) => ({
      value: r.id,
      label: r.display_name,
    })),
    project_id: (projects.data ?? []).map((r) => ({
      value: r.id,
      label: r.name,
    })),
    branch_id: (branches.data ?? []).map((r) => ({
      value: r.id,
      label: r.name,
    })),
    contract_id: contracts.rows.map((r) => ({
      value: String(r.id),
      label: String(r.contract_number),
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
  const queryString = (p: number) =>
    new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(query).filter(
          (v): v is [string, string] => v[1] !== undefined,
        ),
      ),
      page: String(p),
    }).toString();
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">{titles[entity] ?? entity}</h1>
      {createPermission[entity] && s.allowed(createPermission[entity]!) && (
        <Link
          className="my-4 inline-block underline"
          href={`/dashboard/finance/${entity}/new${filter.contract_id ? `?contract_id=${filter.contract_id}` : ''}`}
        >
          Create {titles[entity]?.toLowerCase()}
        </Link>
      )}
      <form className="my-4 flex flex-wrap gap-3">
        <label>
          Reference search
          <input
            name="q"
            defaultValue={filter.q}
            className="block rounded border p-2"
          />
        </label>
        {['customer_id', 'project_id', 'branch_id', 'contract_id'].map(
          (key) => (
            <label key={key}>
              {key.replace('_id', '')}
              <select
                name={key}
                defaultValue={query[key]}
                className="block rounded border p-2"
              >
                <option value="">All</option>
                {query[key] &&
                  !choices[key]?.some((o) => o.value === query[key]) && (
                    <option value={query[key]}>Current selection</option>
                  )}
                {choices[key]?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}
        <label>
          Status
          <input
            name="status"
            defaultValue={filter.status}
            className="block rounded border p-2"
          />
        </label>
        <label>
          Find filter choices
          <input
            name="lookup"
            defaultValue={query.lookup}
            className="block rounded border p-2"
            placeholder="Name or contract number"
          />
        </label>
        <label>
          Choices page
          <input
            type="number"
            min="1"
            name="lookup_page"
            defaultValue={lookupPage}
            className="block rounded border p-2"
          />
        </label>
        <label>
          From
          <input
            type="date"
            name="from"
            defaultValue={filter.from}
            className="block rounded border p-2"
          />
        </label>
        <label>
          Until
          <input
            type="date"
            name="until"
            defaultValue={filter.until}
            className="block rounded border p-2"
          />
        </label>
        <button className="rounded border p-2">Search</button>
      </form>
      {filter.customer_id && s.allowed('financial_report.view') && (
        <Metrics
          data={await s.finance.summary(undefined, filter.customer_id)}
        />
      )}
      <RecordList entity={entity} rows={result.rows} />
      <p>
        {result.total} records / Page {page}
      </p>
      <nav className="my-4 flex gap-4" aria-label="Pagination">
        {page > 1 && <Link href={`?${queryString(page - 1)}`}>Previous</Link>}
        {page * 25 < result.total && (
          <Link href={`?${queryString(page + 1)}`}>Next</Link>
        )}
      </nav>
    </main>
  );
}
