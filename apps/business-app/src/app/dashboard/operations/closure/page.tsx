import Link from 'next/link';
import { operationsServices } from '../service';
import { record, records, text } from '../../execution/presentation';
export default async function Closure({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams,
    s = await operationsServices('execution.view', true);
  if (!project) return <p>Select a project first.</p>;
  const report = await s.operations.closure(project),
    gates = record(report.readiness);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Project completion review</h1>
      <dl className="grid gap-3 sm:grid-cols-2">
        {Object.entries(gates).map(([key, value]) => (
          <div className="rounded border p-3" key={key}>
            <dt className="text-sm capitalize">{key.replaceAll('_', ' ')}</dt>
            <dd>{value ? 'Satisfied' : 'Pending'}</dd>
          </div>
        ))}
        {[
          'unfinished_tasks',
          'open_snags',
          'pending_inspections',
          'open_purchase_orders',
          'unposted_accepted_receipts',
          'approved_handovers',
        ].map((key) => (
          <div key={key}>
            <dt className="text-sm capitalize">{key.replaceAll('_', ' ')}</dt>
            <dd>
              {report[key] === null ? 'Permission required' : text(report[key])}
            </dd>
          </div>
        ))}
      </dl>
      {records(report.commercial).map((c) => (
        <div
          className="rounded border p-3 text-sm"
          key={text(c.contract_number)}
        >
          <strong>
            {text(c.contract_number)} · {text(c.currency)}
          </strong>
          <p>Invoice outstanding: {text(c.invoice_outstanding)}</p>
          <p>Unbilled contract value: {text(c.unbilled_value)}</p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Operational completion does not close financial records.
      </p>
      <Link
        className="text-sm underline"
        href={`/dashboard/operations?project=${project}`}
      >
        Back to execution
      </Link>
    </section>
  );
}
