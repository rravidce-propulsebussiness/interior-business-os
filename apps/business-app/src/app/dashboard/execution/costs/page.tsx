import { executionServices } from '../service';
import { record, records, text } from '../presentation';
import Link from 'next/link';
import { operationsServices } from '../../operations/service';
export default async function Costs({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const q = await searchParams,
    s = await executionServices('cost_report.view', true);
  if (!q.project)
    return (
      <main id="main-content" className="mx-auto max-w-6xl p-6">
        <h1 className="text-3xl">Cost Summary</h1>
        <p className="my-4">
          Select a project to view its internal cost summary.
        </p>
        <Link className="underline" href="/dashboard/projects">
          Projects
        </Link>
      </main>
    );
  const report = await s.execution.costs(q.project);
  const operational = s.allowed('cost.execution.view')
    ? await (
        await operationsServices('cost.execution.view')
      ).operations.costs(q.project)
    : null;
  const metric = (title: string, value: unknown, currency: string) => (
    <div className="rounded border p-4">
      <dt className="text-sm text-muted-foreground">{title}</dt>
      <dd className="mt-2 text-xl">
        {value === null || value === undefined
          ? 'Not estimated'
          : `${currency} ${text(value)}`}
      </dd>
    </div>
  );
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">Project Cost Summary</h1>
      {operational && (
        <section className="my-4">
          <h2 className="text-lg font-semibold">
            Recorded site and subcontract work
          </h2>
          {records(operational.rows).map((row) => (
            <dl
              className="my-3 grid gap-3 sm:grid-cols-3"
              key={text(row.currency)}
            >
              {metric(
                'Consumed material cost',
                row.consumed_material_cost,
                text(row.currency),
              )}
              {metric(
                'Subcontractor committed cost',
                row.subcontractor_committed_cost,
                text(row.currency),
              )}
              {metric(
                'Certified work cost',
                row.certified_work_cost,
                text(row.currency),
              )}
            </dl>
          ))}
          <p className="text-xs text-muted-foreground">
            {text(operational.basis)}
          </p>
        </section>
      )}
      <p className="my-3">
        Planning estimates, purchase commitments and accepted receipts. These
        figures are not final profits or accounting costs.
      </p>
      {records(report.contracts).map((contract) => {
        const currency = text(contract.currency),
          commercial = record(contract.commercial),
          breakdown = record(contract.estimated_by_kind);
        return (
          <section className="my-8" key={text(contract.contract_id)}>
            <h2 className="mb-4 text-2xl">{text(contract.contract_number)}</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              {contract.commercial && (
                <>
                  {metric(
                    'Original commercial value',
                    commercial.original_value,
                    currency,
                  )}
                  {metric(
                    'Approved changes',
                    commercial.approved_changes,
                    currency,
                  )}
                  {metric(
                    'Current contract value',
                    commercial.current_value,
                    currency,
                  )}
                </>
              )}
              {metric(
                'Estimated execution cost',
                contract.estimated_cost,
                currency,
              )}
              {metric(
                'Material estimate',
                contract.estimated_cost == null
                  ? null
                  : (breakdown.material ?? '0'),
                currency,
              )}
              {metric(
                'Labour estimate',
                contract.estimated_cost == null
                  ? null
                  : (breakdown.labour ?? '0'),
                currency,
              )}
              {metric(
                'Committed — issued PO value',
                contract.committed_cost,
                currency,
              )}
              {metric(
                'Received — accepted quantity value',
                contract.accepted_received_cost,
                currency,
              )}
              {contract.commercial &&
                metric(
                  'Estimated contribution',
                  commercial.estimated_contribution,
                  currency,
                )}
            </dl>
            {!contract.commercial && (
              <p className="my-3">
                Commercial values require contract access and Billing
                entitlement.
              </p>
            )}
          </section>
        );
      })}
      <p className="my-6 text-sm text-muted-foreground">
        {text(report.cost_basis)}
      </p>
    </main>
  );
}
