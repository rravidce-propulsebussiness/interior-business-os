import Link from 'next/link';
import { executionServices } from './service';
import { executionPermissions } from '@business-os/core/execution';
import { ExecutionForm } from './form';
import { record, records, text, titles } from './presentation';
export default async function Execution({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; contract?: string; page?: string }>;
}) {
  const query = await searchParams,
    s = await executionServices('estimate.view', true),
    page = Math.max(1, Number(query.page) || 1);
  const contracts = await s.execution.contracts(query.project, page);
  const scope = query.contract ? await s.execution.scope(query.contract) : null;
  const sections = [
    'execution_estimate_revisions',
    'materials',
    'estimation_recipes',
    'purchase_requisitions',
    'rfqs',
    'vendors',
    'vendor_quotes',
    'purchase_orders',
    'goods_receipts',
  ] as const;
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">Project execution</h1>
      <p className="my-3">
        Plan requirements from accepted scope, compare supplier terms, purchase
        and receive. Quantities are estimates, not measured consumption.
      </p>
      <nav
        aria-label="Execution sections"
        className="my-6 flex flex-wrap gap-4"
      >
        {sections
          .filter((entity) => s.allowed(executionPermissions[entity]))
          .map((entity) => (
            <Link
              className="underline"
              key={entity}
              href={`/dashboard/execution/${entity}${query.project ? `?project=${query.project}` : ''}`}
            >
              {titles[entity]}
            </Link>
          ))}
        {s.allowed('cost_report.view') && query.project && (
          <Link
            className="underline"
            href={`/dashboard/execution/costs?project=${query.project}`}
          >
            Cost Summary
          </Link>
        )}
      </nav>
      <h2 className="mt-8 text-2xl">Accepted contracts</h2>
      <p>
        Select a contract to inspect quotation and approved change-order scope.
      </p>
      <ul className="my-4 grid gap-3">
        {contracts.rows.map((c) => (
          <li className="rounded border p-4" key={text(c.id)}>
            <Link
              className="underline"
              href={`/dashboard/execution?project=${text(c.project_id)}&contract=${text(c.id)}`}
            >
              {text(c.contract_number)} · {text(c.project_name)}
            </Link>
            <span className="ml-3">{text(c.status)}</span>
          </li>
        ))}
      </ul>
      {!contracts.rows.length && (
        <p>
          No accepted contracts are available. Start the contract from an
          approved quotation.
        </p>
      )}
      {contracts.total > page * 25 && (
        <Link
          href={`?page=${page + 1}${query.project ? `&project=${query.project}` : ''}`}
        >
          Next contracts
        </Link>
      )}
      {scope && (
        <section className="mt-8">
          <h2 className="text-2xl">Execution scope</h2>
          <p>
            {text(scope.covered)} covered · {text(scope.unestimated)} not
            estimated
          </p>
          {records(scope.scope).map((item) => {
            const snapshot = record(item.snapshot);
            return (
              <article
                className="my-3 rounded border p-4"
                key={`${text(item.source_type)}:${text(item.source_id)}`}
              >
                <h3 className="font-semibold">
                  {text(item.area_name) || 'Unassigned area'} ·{' '}
                  {text(snapshot.name)}
                </h3>
                <p>
                  Source:{' '}
                  {item.source_type === 'change_order'
                    ? 'Approved change order'
                    : 'Accepted quotation'}{' '}
                  · {text(snapshot.quantity)}{' '}
                  {text(record(snapshot.unit).label)} ·{' '}
                  {item.covered ? 'Covered' : 'Not estimated'}
                </p>
              </article>
            );
          })}
          {s.allowed('estimate.create') && (
            <ExecutionForm
              title="Create or open estimate"
              initial={{
                action: 'estimate',
                operation: 'create',
                input: { contract_id: query.contract },
              }}
            />
          )}
        </section>
      )}
    </main>
  );
}
