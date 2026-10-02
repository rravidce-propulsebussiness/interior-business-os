import Link from 'next/link';
import { operationsServices } from '../service';
import { text } from '../../execution/presentation';
import { SiteForm } from '../site-form';
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; page?: string }>;
}) {
  const { project, page } = await searchParams,
    s = await operationsServices('inventory.view', true),
    result = await s.operations.balances(project, Number(page) || 1);
  return (
    <section className="space-y-4">
      <Link className="text-sm underline" href="/dashboard/operations">
        Project execution
      </Link>
      <h1 className="text-xl font-semibold">Usable stock</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {['Location', 'Material', 'Unit', 'Available'].map((k) => (
                <th className="border-b p-2" key={k}>
                  {k}
                </th>
              ))}
              {project && s.allowed('inventory.consume') && (
                <th className="border-b p-2">Site action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={`${text(row.location_id)}:${text(row.lot_id)}`}>
                {['location', 'material', 'unit', 'available'].map((k) => (
                  <td className="border-b p-2" key={k}>
                    {text(row[k])}
                  </td>
                ))}
                {project && s.allowed('inventory.consume') && (
                  <td className="border-b p-2">
                    <details>
                      <summary className="cursor-pointer">Record usage</summary>
                      <SiteForm
                        kind="stock"
                        project={project}
                        location={text(row.location_id)}
                        lot={text(row.lot_id)}
                      />
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!result.rows.length && <p>No usable stock movements recorded.</p>}
      <nav className="flex gap-4 text-sm" aria-label="Pagination">
        {result.page > 1 && (
          <Link
            href={`?page=${result.page - 1}${project ? `&project=${project}` : ''}`}
          >
            Previous
          </Link>
        )}
        <span>{result.total} stock lots</span>
        {result.page * 25 < result.total && (
          <Link
            href={`?page=${result.page + 1}${project ? `&project=${project}` : ''}`}
          >
            Next
          </Link>
        )}
      </nav>
    </section>
  );
}
