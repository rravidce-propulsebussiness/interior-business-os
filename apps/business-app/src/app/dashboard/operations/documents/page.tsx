import Link from 'next/link';
import { operationsServices } from '../service';
export default async function Documents({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams,
    s = await operationsServices('execution.view', true);
  if (!project) return <p>Select a project first.</p>;
  const reports = [
    ['consumption', 'Material consumption', 'inventory.view'],
    ['snag', 'Snag / punch list', 'snag.view'],
    ['completion', 'Internal completion review', 'execution.view'],
  ] as const;
  const locations = s.allowed('inventory.view')
    ? await s.operations.options('inventory_locations', project)
    : { rows: [] };
  const materials = s.allowed('inventory.view')
    ? await s.operations.options('material_variants', project)
    : { rows: [] };
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">Project documents</h1>
      <nav className="flex flex-wrap gap-3 text-sm">
        {reports
          .filter(([, , permission]) => s.allowed(permission))
          .map(([kind, label]) => (
            <Link
              key={kind}
              className="rounded border px-3 py-2"
              href={`/dashboard/operations/documents/${kind}/${project}/pdf`}
            >
              {label} PDF
            </Link>
          ))}
      </nav>
      {s.allowed('inventory.view') && (
        <form
          action={`/dashboard/operations/documents/movement_report/${project}/pdf`}
          className="grid max-w-2xl gap-3 rounded border p-4 sm:grid-cols-2"
        >
          <h2 className="col-span-full text-lg">Inventory movement report</h2>
          <label className="text-sm">
            Location
            <select
              className="block w-full rounded border p-2"
              name="location_id"
            >
              <option value="">All locations</option>
              {locations.rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Material
            <select
              className="block w-full rounded border p-2"
              name="variant_id"
            >
              <option value="">All materials</option>
              {materials.rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            From
            <input
              className="block rounded border p-2"
              type="date"
              name="from"
            />
          </label>
          <label className="text-sm">
            Until
            <input
              className="block rounded border p-2"
              type="date"
              name="until"
            />
          </label>
          <label className="text-sm">
            Movement
            <select className="block w-full rounded border p-2" name="kind">
              <option value="">All movements</option>
              {[
                'purchase_receipt',
                'transfer',
                'issue_to_site',
                'return_from_site',
                'consumption',
                'scrap',
                'damage',
                'adjustment',
                'count',
                'reversal',
              ].map((k) => (
                <option key={k} value={k}>
                  {k.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <button className="self-end rounded bg-primary p-2 text-sm text-primary-foreground">
            Download movement PDF
          </button>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        Issue slips, inspection reports, work orders and handovers are available
        from their finalized record. Historical records preserve their approved
        or issued data.
      </p>
      <nav className="flex flex-wrap gap-4 text-sm">
        {[
          'execution_estimate_revisions',
          'purchase_orders',
          'goods_receipts',
        ].map((e) => (
          <Link
            className="underline"
            key={e}
            href={`/dashboard/execution/${e}?project=${project}`}
          >
            {e.replaceAll('_', ' ')}
          </Link>
        ))}
      </nav>
    </section>
  );
}
