import Link from 'next/link';
import { operationsServices } from '../service';
import { text } from '../../execution/presentation';
export default async function Scope({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; page?: string }>;
}) {
  const { project, page } = await searchParams,
    s = await operationsServices('execution.view', true);
  if (!project) return <p>Select a project first.</p>;
  const report = await s.operations.scope(project, Number(page) || 1);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Approved scope and execution</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Contract', 'Source', 'Area', 'Scope', 'Execution status'].map(
                (c) => (
                  <th className="border-b p-2" key={c}>
                    {c}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={`${text(r.contract_id)}:${text(r.source_id)}`}>
                {[
                  'contract_number',
                  'source_type',
                  'area',
                  'title',
                  'status',
                ].map((k) => (
                  <td className="border-b p-2" key={k}>
                    {text(r[k]).replaceAll('_', ' ')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Removed scope awaits physical confirmation; purchased stock remains in
        inventory. New unestimated scope must pass through the existing estimate
        and procurement workflow.
      </p>
      <Link
        className="text-sm underline"
        href={`/dashboard/execution?project=${project}`}
      >
        Estimate and procure approved scope
      </Link>
      <nav className="flex gap-4 text-sm">
        {report.page > 1 && (
          <Link href={`?project=${project}&page=${report.page - 1}`}>
            Previous
          </Link>
        )}
        <span>{report.total} scope items</span>
        {report.page * 25 < report.total && (
          <Link href={`?project=${project}&page=${report.page + 1}`}>Next</Link>
        )}
      </nav>
    </section>
  );
}
