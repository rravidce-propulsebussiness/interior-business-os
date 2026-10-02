import Link from 'next/link';
import { operationsServices } from '../service';
import { text } from '../../execution/presentation';
export default async function MaterialReport({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; area?: string; page?: string }>;
}) {
  const q = await searchParams,
    s = await operationsServices('inventory.view', true);
  if (!q.project)
    return (
      <p>
        Select a project from{' '}
        <Link className="underline" href="/dashboard/projects">
          Projects
        </Link>
        .
      </p>
    );
  const report = await s.operations.materials(
      q.project,
      q.area,
      Number(q.page) || 1,
    ),
    areas = await s.operations.options('project_areas', q.project);
  const columns = [
    'material',
    'unit',
    'estimated',
    'planned_waste',
    'planned_purchase',
    'purchased',
    'ordered',
    'received',
    'accepted',
    'issued',
    'consumed',
    'returned',
    'scrapped',
    'damaged',
    'at_store',
    'at_site',
    'variance',
    'shortage',
    'potential_surplus',
  ];
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Material usage and availability</h1>
      <form className="flex flex-wrap gap-3 text-sm">
        <input type="hidden" name="project" value={q.project} />
        <label>
          Area{' '}
          <select
            name="area"
            defaultValue={q.area ?? ''}
            className="rounded border p-2"
          >
            <option value="">All areas</option>
            {areas.rows.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded border px-3">Apply</button>
      </form>
      <p className="text-xs text-muted-foreground">
        Quantities use purchase units. Purchased is issued PO commitment. Area
        filters affect estimate and recorded usage; procurement and stock remain
        project totals. Store quantities follow project receipt lots and are not
        reservations.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap border-b p-2 capitalize"
                >
                  {c.replaceAll('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={`${text(r.variant_id)}:${text(r.unit)}`}>
                {columns.map((c) => (
                  <td key={c} className="whitespace-nowrap border-b p-2">
                    {text(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-4 text-sm">
        {report.page > 1 && (
          <Link
            href={`?project=${q.project}&page=${report.page - 1}${q.area ? `&area=${q.area}` : ''}`}
          >
            Previous
          </Link>
        )}
        <span>{report.total} material/unit combinations</span>
        {report.page * 25 < report.total && (
          <Link
            href={`?project=${q.project}&page=${report.page + 1}${q.area ? `&area=${q.area}` : ''}`}
          >
            Next
          </Link>
        )}
      </nav>
      {s.allowed('purchase_requisition.create') && (
        <Link
          className="text-sm underline"
          href={`/dashboard/execution/purchase_requisitions/new?project=${q.project}`}
        >
          Create purchase requisition from approved estimate
        </Link>
      )}
      <Link
        className="ml-4 text-sm underline"
        href={`/dashboard/operations?project=${q.project}`}
      >
        Execution summary
      </Link>
    </section>
  );
}
